"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PublicAvailability } from "@vygo/validation";
import { apiUrl } from "@/lib/api";
import { trackAnalytics } from "@/lib/analytics";
import {
  AVAILABILITY_POLL_MS,
  AVAILABILITY_STALE_MS,
  availabilityCopy,
  deriveUiState,
  initialAvailabilitySnapshot,
  type AvailabilityCopy,
  type AvailabilitySnapshot,
  type AvailabilityUiState,
} from "@/lib/availability";

type AvailabilityContextValue = AvailabilitySnapshot & {
  copy: AvailabilityCopy;
  refresh: () => Promise<void>;
};

const AvailabilityContext = createContext<AvailabilityContextValue | null>(null);

async function fetchAvailability(): Promise<PublicAvailability> {
  const res = await fetch(apiUrl("/v1/public/availability"), {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Availability HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data?: PublicAvailability };
  if (!body?.data?.status) {
    throw new Error("Invalid availability payload");
  }
  return body.data;
}

export function AvailabilityProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AvailabilitySnapshot>(initialAvailabilitySnapshot);
  const lastGoodRef = useRef<PublicAvailability | null>(null);
  const fetchedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const applyState = useCallback(
    (partial: {
      loading?: boolean;
      error?: boolean;
      /** Fresh successful payload only — updates lastGood + fetchedAt. */
      data?: PublicAvailability | null;
      errorMessage?: string | null;
      /** When true, do not treat `data` as a successful fetch timestamp update. */
      retainOnly?: boolean;
    }) => {
      if (!mountedRef.current) return;
      const loading = partial.loading ?? false;
      const error = partial.error ?? false;

      if (partial.data && !partial.retainOnly) {
        lastGoodRef.current = partial.data;
        fetchedAtRef.current = Date.now();
      }

      const lastGood = lastGoodRef.current;
      const fetchedAt = fetchedAtRef.current;
      const effective = partial.data ?? lastGood;
      const uiState = deriveUiState({
        loading,
        error,
        data: effective,
        lastGood,
        fetchedAt,
      });
      setSnapshot({
        uiState,
        data: effective,
        lastGood,
        fetchedAt,
        errorMessage: partial.errorMessage ?? null,
        isBusy: loading,
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    applyState({
      loading: true,
      error: false,
      data: lastGoodRef.current,
      retainOnly: true,
      errorMessage: null,
    });
    try {
      const data = await fetchAvailability();
      applyState({ loading: false, error: false, data, errorMessage: null });
      trackAnalytics("availability_view", { status: data.status });
    } catch {
      applyState({
        loading: false,
        error: true,
        data: lastGoodRef.current,
        retainOnly: true,
        errorMessage: "Could not load availability.",
      });
    }
  }, [applyState]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const poll = window.setInterval(() => {
      void refresh();
    }, AVAILABILITY_POLL_MS);

    const staleTimer = window.setInterval(() => {
      if (!fetchedAtRef.current || !lastGoodRef.current) return;
      if (Date.now() - fetchedAtRef.current <= AVAILABILITY_STALE_MS) return;
      setSnapshot((prev) => {
        if (prev.uiState === "stale" || prev.isBusy) return prev;
        return {
          ...prev,
          uiState: "stale",
        };
      });
    }, 5_000);

    // Test/debug surface for Playwright — not used by production UI.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__vygoAvailability = {
      refresh: () => refresh(),
      markStale: () => {
        setSnapshot((prev) => ({
          ...prev,
          uiState: "stale",
          data: prev.data ?? prev.lastGood,
        }));
      },
    };

    return () => {
      mountedRef.current = false;
      window.clearInterval(poll);
      window.clearInterval(staleTimer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__vygoAvailability;
    };
  }, [refresh]);

  const copy = useMemo(
    () => availabilityCopy(snapshot.uiState, snapshot.data),
    [snapshot.uiState, snapshot.data],
  );

  const value = useMemo<AvailabilityContextValue>(
    () => ({
      ...snapshot,
      copy,
      refresh: async () => {
        trackAnalytics("availability_retry", { from: snapshot.uiState });
        await refresh();
      },
    }),
    [snapshot, copy, refresh],
  );

  return <AvailabilityContext.Provider value={value}>{children}</AvailabilityContext.Provider>;
}

export function useAvailability(): AvailabilityContextValue {
  const ctx = useContext(AvailabilityContext);
  if (!ctx) {
    // Safe fallback when used outside provider (should not happen in layout).
    const empty = initialAvailabilitySnapshot();
    return {
      ...empty,
      copy: availabilityCopy("loading", null),
      refresh: async () => undefined,
    };
  }
  return ctx;
}

export function useAvailabilityUiState(): AvailabilityUiState {
  return useAvailability().uiState;
}

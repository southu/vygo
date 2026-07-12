"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WaitlistForm } from "./WaitlistForm";

type WaitlistContextValue = {
  isOpen: boolean;
  openWaitlist: (invoker?: HTMLElement | null) => void;
  closeWaitlist: () => void;
};

const WaitlistContext = createContext<WaitlistContextValue | null>(null);

export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const invokerRef = useRef<HTMLElement | null>(null);

  const openWaitlist = useCallback((invoker?: HTMLElement | null) => {
    invokerRef.current = invoker ?? (document.activeElement as HTMLElement | null);
    setIsOpen(true);
  }, []);

  const closeWaitlist = useCallback(() => {
    setIsOpen(false);
    const invoker = invokerRef.current;
    invokerRef.current = null;
    if (invoker && typeof invoker.focus === "function") {
      requestAnimationFrame(() => invoker.focus());
    }
  }, []);

  const value = useMemo(
    () => ({ isOpen, openWaitlist, closeWaitlist }),
    [isOpen, openWaitlist, closeWaitlist],
  );

  return (
    <WaitlistContext.Provider value={value}>
      {children}
      {isOpen ? (
        <WaitlistForm mode="modal" open={isOpen} onDismiss={closeWaitlist} />
      ) : null}
    </WaitlistContext.Provider>
  );
}

export function useWaitlistModal(): WaitlistContextValue {
  const ctx = useContext(WaitlistContext);
  if (!ctx) {
    return {
      isOpen: false,
      openWaitlist: () => undefined,
      closeWaitlist: () => undefined,
    };
  }
  return ctx;
}

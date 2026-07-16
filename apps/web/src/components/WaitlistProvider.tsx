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
import type { InquiryOfferKey } from "@/content/inquiry-offers";
import { WaitlistForm } from "./WaitlistForm";

type OpenWaitlistOptions = {
  offer?: InquiryOfferKey | null;
};

type WaitlistContextValue = {
  isOpen: boolean;
  offer: InquiryOfferKey | null;
  openWaitlist: (invoker?: HTMLElement | null, options?: OpenWaitlistOptions) => void;
  closeWaitlist: () => void;
};

const WaitlistContext = createContext<WaitlistContextValue | null>(null);

export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [offer, setOffer] = useState<InquiryOfferKey | null>(null);
  const invokerRef = useRef<HTMLElement | null>(null);

  const openWaitlist = useCallback(
    (invoker?: HTMLElement | null, options?: OpenWaitlistOptions) => {
      invokerRef.current = invoker ?? (document.activeElement as HTMLElement | null);
      setOffer(options?.offer ?? null);
      setIsOpen(true);
    },
    [],
  );

  const closeWaitlist = useCallback(() => {
    setIsOpen(false);
    setOffer(null);
    const invoker = invokerRef.current;
    invokerRef.current = null;
    if (invoker && typeof invoker.focus === "function") {
      requestAnimationFrame(() => invoker.focus());
    }
  }, []);

  const value = useMemo(
    () => ({ isOpen, offer, openWaitlist, closeWaitlist }),
    [isOpen, offer, openWaitlist, closeWaitlist],
  );

  return (
    <WaitlistContext.Provider value={value}>
      {children}
      {isOpen ? (
        <WaitlistForm mode="modal" open={isOpen} onDismiss={closeWaitlist} offer={offer} />
      ) : null}
    </WaitlistContext.Provider>
  );
}

export function useWaitlistModal(): WaitlistContextValue {
  const ctx = useContext(WaitlistContext);
  if (!ctx) {
    return {
      isOpen: false,
      offer: null,
      openWaitlist: () => undefined,
      closeWaitlist: () => undefined,
    };
  }
  return ctx;
}

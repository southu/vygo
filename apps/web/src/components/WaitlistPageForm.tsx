"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { parseOfferFromSearch } from "@/content/inquiry-offers";
import { WaitlistForm } from "./WaitlistForm";

/** Page-mode waitlist form that reads ?offer= and readiness snapshot prefill params. */
export function WaitlistPageForm() {
  const searchParams = useSearchParams();
  const offer = parseOfferFromSearch(searchParams.toString());
  const prefill = useMemo(() => {
    const fullName = searchParams.get("name")?.trim() || searchParams.get("fullName")?.trim() || "";
    const email = searchParams.get("email")?.trim() || "";
    const companyName =
      searchParams.get("company")?.trim() || searchParams.get("companyName")?.trim() || "";
    if (!fullName && !email && !companyName) return null;
    return {
      fullName: fullName || undefined,
      email: email || undefined,
      companyName: companyName || undefined,
    };
  }, [searchParams]);
  return <WaitlistForm mode="page" offer={offer} prefill={prefill} />;
}

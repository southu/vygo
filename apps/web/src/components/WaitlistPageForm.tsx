"use client";

import { useSearchParams } from "next/navigation";
import { parseOfferFromSearch } from "@/content/inquiry-offers";
import { WaitlistForm } from "./WaitlistForm";

/** Page-mode waitlist form that reads ?offer= for free Harden assessment preselection. */
export function WaitlistPageForm() {
  const searchParams = useSearchParams();
  const offer = parseOfferFromSearch(searchParams.toString());
  return <WaitlistForm mode="page" offer={offer} />;
}

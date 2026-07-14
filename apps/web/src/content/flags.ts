/**
 * Commercial feature flags — control public presentation of claim-sensitive
 * and commercial details.
 */

export const commercialFlags = {
  showPublicPricing: true,
  showOpsPricing: true,
  /** Publish “U.S.-based” language only while operationally true. */
  showUsBasedClaim: true,
  /** Publish “senior-only” language only while operationally true. */
  showSeniorOnlyClaim: true,
} as const;

export type CommercialFlags = typeof commercialFlags;

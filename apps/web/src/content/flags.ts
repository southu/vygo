/**
 * Commercial feature flags — control public presentation of claim-sensitive
 * and commercial details. Keep exact equity / cash-premium numbers private
 * until counsel approves public wording.
 *
 * // INTERNAL (not for public UI until approved):
 * // equity structure draft: 5% common equity
 * // cash-only premium draft: 25%
 */

export const commercialFlags = {
  showPublicPricing: true,
  showExactEquityTerms: false,
  showCashOnlyPremium: false,
  showOpsPricing: true,
  /** Publish “U.S.-based” language only while operationally true. */
  showUsBasedClaim: true,
  /** Publish “senior-only” language only while operationally true. */
  showSeniorOnlyClaim: true,
} as const;

export type CommercialFlags = typeof commercialFlags;

/** Shared design tokens and UI primitives for the vygo marketing site. */

export const brand = {
  name: "vygo",
  domain: "vygo.ai",
  email: "hello@vygo.ai",
  tagline: "Your MVP proved the market. vygo makes it production-grade.",
  promise: "We keep the validated product and rebuild the foundation underneath it.",
  positioning:
    "For teams whose AI-built product has proven demand but is not ready for scale, enterprise procurement, compliance readiness, or sustained operations, vygo provides senior production engineering that preserves the validated product, rebuilds the foundation beneath it, and hands off full IP.",
  footerDisclaimer:
    "Submitting an inquiry does not create a client relationship. Services are provided only under a signed agreement. Questions, privacy requests, and legal notices may be sent to hello@vygo.ai.",
} as const;

export const colors = {
  canvas: "#fafaf8",
  surface: "#ffffff",
  ink: "#16181d",
  inkSoft: "#2e3440",
  muted: "#64748b",
  border: "#e3e1da",
  purple: "#5b47e0",
  purpleDark: "#4535b8",
  purpleSoft: "#e8e6fa",
  green: "#12b76a",
  greenDark: "#047857",
  red: "#b42318",
  amber: "#b45309",
  blue: "#0369a1",
  trust: "#0f172a",
} as const;

export type BrandColors = typeof colors;

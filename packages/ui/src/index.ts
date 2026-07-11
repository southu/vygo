/** Shared design tokens and UI primitives for the vygo marketing site. */

export const brand = {
  name: "vygo",
  tagline: "Your MVP proved the market. vygo makes it production-grade.",
  promise: "We keep the validated product. We rebuild everything underneath it.",
} as const;

export const colors = {
  canvas: "#fafaf8",
  surface: "#ffffff",
  ink: "#14141a",
  muted: "#5c5c66",
  purple: "#5b4bdb",
  green: "#1f8a5b",
  trust: "#0f172a",
} as const;

export type BrandColors = typeof colors;

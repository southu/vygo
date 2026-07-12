import { HTML_MESSAGE_PREVIEW_CHARS, TEXT_MESSAGE_MAX_CHARS } from "./types.js";

/** Escape HTML special characters for safe interpolation into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Normalize and bound free-text for templates (never throw on long content). */
export function prepareMessage(
  raw: string | null | undefined,
  options?: { htmlPreview?: boolean },
): { display: string; truncated: boolean; originalLength: number } {
  const original = typeof raw === "string" ? raw : "";
  const originalLength = original.length;
  if (options?.htmlPreview) {
    if (originalLength <= HTML_MESSAGE_PREVIEW_CHARS) {
      return { display: original, truncated: false, originalLength };
    }
    return {
      display: `${original.slice(0, HTML_MESSAGE_PREVIEW_CHARS)}\n…[truncated for email preview]`,
      truncated: true,
      originalLength,
    };
  }
  if (originalLength <= TEXT_MESSAGE_MAX_CHARS) {
    return { display: original, truncated: false, originalLength };
  }
  return {
    display: `${original.slice(0, TEXT_MESSAGE_MAX_CHARS)}\n…[truncated]`,
    truncated: true,
    originalLength,
  };
}

export function safeDisplayName(fullName: string | null | undefined): string {
  const t = (fullName ?? "").trim();
  return t.length > 0 ? t : "there";
}

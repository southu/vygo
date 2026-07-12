/** Same-origin under the live reverse proxy; optional absolute override for split dev. */
export function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv && typeof window !== "undefined") {
    try {
      const envUrl = new URL(fromEnv);
      const pageOrigin = window.location.origin;
      if (envUrl.origin === pageOrigin) return "";
      if (window.location.port === "8380") return "";
      return fromEnv.replace(/\/$/, "");
    } catch {
      return "";
    }
  }
  return "";
}

export function apiUrl(path: string): string {
  const base = resolveApiBase();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

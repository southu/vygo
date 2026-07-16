/**
 * Client-side helpers for the internal ops Basic Auth session.
 * Credentials live only in sessionStorage for the browser tab — never
 * embedded in page source or NEXT_PUBLIC_* config.
 */

const STORAGE_KEY = "vygo.ops.basicAuth";

export function loadOpsAuthHeader(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // Stored as base64(user:pass) so we can rebuild the Authorization header.
    if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return null;
    return `Basic ${raw}`;
  } catch {
    return null;
  }
}

export function saveOpsCredentials(user: string, password: string): void {
  if (typeof window === "undefined") return;
  const token = btoa(`${user}:${password}`);
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearOpsCredentials(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Same-origin ops API paths on www.vygo.ai (never api.vygo.ai). */
export function opsApiUrl(path: string, query?: Record<string, string | undefined>): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") params.set(k, v);
    }
  }
  const qs = params.toString();
  return qs ? `${normalized}?${qs}` : normalized;
}

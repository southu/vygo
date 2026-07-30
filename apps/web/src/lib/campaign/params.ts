/**
 * Approved campaign parameter capture + full-session preservation.
 *
 * Only an explicit allowlist of attribution parameters is ever stored,
 * propagated, or attached to payloads — arbitrary query parameters are never
 * persisted. Newer explicit values on a later URL take precedence over older
 * session values; older session values never overwrite a newer explicit one.
 */

/** The only campaign parameters the conversion layer preserves and propagates. */
export const ALLOWLISTED_CAMPAIGN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  // Paid-media click identifiers supported by the current attribution stack.
  "gclid",
  "wbraid",
  "gbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "twclid",
  "li_fat_id",
] as const;

export type CampaignParamKey = (typeof ALLOWLISTED_CAMPAIGN_PARAMS)[number];
export type CampaignParams = Partial<Record<CampaignParamKey, string>>;

/** Session key for the preserved campaign parameters (per browser session). */
export const CAMPAIGN_PARAMS_STORAGE_KEY = "vygo:campaign-params:v1";

/** Clip so a single value can never dominate storage, a URL, or an analytics payload. */
const VALUE_MAX = 120;

const ALLOW_SET = new Set<string>(ALLOWLISTED_CAMPAIGN_PARAMS);

function isAllowed(key: string): key is CampaignParamKey {
  return ALLOW_SET.has(key);
}

function clip(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > VALUE_MAX ? trimmed.slice(0, VALUE_MAX) : trimmed;
}

/**
 * Extract only the allowlisted, non-empty campaign parameters from a query
 * string. Unapproved keys are dropped — never stored or propagated.
 */
export function readAllowlistedParams(search: string): CampaignParams {
  const out: CampaignParams = {};
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of ALLOWLISTED_CAMPAIGN_PARAMS) {
    const value = clip(params.get(key));
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Merge preserved session values with the current URL's explicit values.
 * Explicit (incoming) values win — precedence is newer-explicit over
 * older-session — and only allowlisted keys survive.
 */
export function mergeParams(stored: CampaignParams, incoming: CampaignParams): CampaignParams {
  const out: CampaignParams = {};
  for (const [key, value] of Object.entries(stored)) {
    if (isAllowed(key) && value) out[key] = value;
  }
  for (const [key, value] of Object.entries(incoming)) {
    if (isAllowed(key) && value) out[key] = value;
  }
  return out;
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Read the preserved campaign parameters for this browser session. */
export function readStoredParams(): CampaignParams {
  const store = safeSessionStorage();
  if (!store) return {};
  try {
    const raw = store.getItem(CAMPAIGN_PARAMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: CampaignParams = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isAllowed(key) && typeof value === "string") {
        const clipped = clip(value);
        if (clipped) out[key] = clipped;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredParams(params: CampaignParams): void {
  const store = safeSessionStorage();
  if (!store) return;
  try {
    store.setItem(CAMPAIGN_PARAMS_STORAGE_KEY, JSON.stringify(params));
  } catch {
    // Storage may be full or blocked; params still apply in-memory for callers
    // that hold the returned value.
  }
}

/**
 * Capture the current URL's allowlisted parameters, merge them over the
 * preserved session values (explicit wins), persist, and return the merged set.
 * Safe to call on every landing-page mount.
 */
export function syncSessionParams(search?: string): CampaignParams {
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const incoming = readAllowlistedParams(query);
  const merged = mergeParams(readStoredParams(), incoming);
  writeStoredParams(merged);
  return merged;
}

/** Current preserved campaign parameters (empty when none / no storage). */
export function getCampaignParams(): CampaignParams {
  return readStoredParams();
}

/**
 * Append preserved campaign parameters to a same-origin destination href so
 * approved attribution is propagated on navigation. External URLs, mailto, and
 * in-page hash anchors are returned unchanged. An explicit parameter already on
 * the href is never overwritten by an older session value.
 */
export function appendParamsToHref(href: string, params: CampaignParams): string {
  if (!href) return href;
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return href;
  }
  // Only propagate onto same-origin destinations. Absolute external URLs are
  // left untouched so we never leak attribution to third parties.
  const isRelative = href.startsWith("/") && !href.startsWith("//");
  if (!isRelative) return href;

  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : "";
  const pathAndQuery = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = pathAndQuery.indexOf("?");
  const path = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
  const existingQuery = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : "";
  const query = new URLSearchParams(existingQuery);
  for (const key of ALLOWLISTED_CAMPAIGN_PARAMS) {
    const value = params[key];
    if (!value) continue;
    // Do not overwrite a newer explicit parameter already present on the link.
    if (query.has(key)) continue;
    query.set(key, value);
  }
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";
  const hashSuffix = hash ? `#${hash}` : "";
  return `${path}${suffix}${hashSuffix}`;
}

/** Read the current session params and append them to a same-origin href. */
export function appendCampaignParamsToHref(href: string): string {
  return appendParamsToHref(href, getCampaignParams());
}

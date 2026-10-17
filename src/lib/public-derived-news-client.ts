import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
/**
 * Direct, public, derived-only newsroom GET for browser clients.
 * This intentionally bypasses the React Start server-function transport when
 * the site's SSR/RPC runtime is unhealthy. It never asks for upstream sources,
 * private article URLs, raw feeds, Supabase, B2, credentials or payments.
 */
import type { StatelessIntelligenceSignal } from "./stateless-intelligence-model";

export const GEOMACRO_DERIVED_JOURNAL_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news";

const SIGNAL_FIELDS = new Set(["id","category","title","what_changed","why_it_matters",
  "topic","geography","development_type","published_at","date_precision",
  "observed_release_count","sources_credited","status","same_event_corrob_verified","severity"]);
function safeSignal(value: unknown, now: number): value is StatelessIntelligenceSignal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  if (Object.keys(s).length!==SIGNAL_FIELDS.size ||
      Object.keys(s).some(key=>!SIGNAL_FIELDS.has(key)) ||
      !["geopolitics", "macro", "rare_earth"].includes(String(s.category)) ||
      typeof s.id !== "string" ||
      !/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(s.id) ||
      typeof s.title !== "string" || s.title.length>240 || !s.title.startsWith("Geomacro finds ") ||
      typeof s.topic!=="string" || s.topic.length>120 ||
      !(s.geography===null || typeof s.geography==="string"&&s.geography.length<=70) ||
      typeof s.development_type!=="string" || s.development_type.length>80 ||
      typeof s.what_changed !== "string" || s.what_changed.length < 30 || s.what_changed.length>650 ||
      typeof s.why_it_matters !== "string" || s.why_it_matters.length < 30 || s.why_it_matters.length>700 ||
      s.status !== "official_release_observed_unscored" ||
      s.same_event_corrob_verified !== false || s.severity !== null ||
      s.observed_release_count !== 1 ||
      !Array.isArray(s.sources_credited) ||
      s.sources_credited.length > 2 ||
      s.sources_credited.some(c => typeof c !== "string" || c.length > 230)) return false;
  const original = typeof s.published_at === "string" ? s.published_at : "";
  const ms = Date.parse(original);
  if (!Number.isFinite(ms) || ms > now || ms < now - 30 * 86_400_000) return false;
  // Date.parse can normalize impossible days (e.g. 2026-02-30); require the
  // exact originating Gregorian date, never a JavaScript-normalized alias.
  if (s.date_precision === "day" && new Date(ms).toISOString().slice(0, 10) !== original)
    return false;
  if (s.date_precision === "exact" &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(original) ||
       new Date(ms).toISOString().slice(0,19)!==original.slice(0,19))) return false;
  // D1 accepts verified publisher-day (without inventing a publication hour)
  // from the three domains, including Statistics Canada original article day.
  // All day-only issues wait the complete next-day 12:15 UTC embargo.
  const embargoEnd = s.date_precision === "day" &&
    ["rare_earth", "geopolitics", "macro"].includes(String(s.category)) &&
    /^\d{4}-\d{2}-\d{2}$/u.test(original)
    ? ms + 36 * 60 * 60_000 + 15 * 60_000
    : s.date_precision === "exact" && /^\d{4}-\d{2}-\d{2}T/u.test(original)
      ? ms + 15 * 60_000
      : Infinity;
  if (embargoEnd > now ||
      JSON.stringify(s).length > 5_000 ||
      /https?:\/\/|www\./iu.test(JSON.stringify(s))) return false;
  return true;
}

export function checkedDerivedNews(doc: unknown, now = Date.now()): StatelessIntelligenceSignal[] {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw Error("DERIVED_NEWS_PUBLIC_DOCUMENT_INVALID");
  }
  const value = doc as Record<string, unknown>;
  if (value.ok !== true ||
      value.schema !== "geomacro.website-derived-news-feed.v1" ||
      value.original_release_delay_minutes !== 15 ||
      value.retention_days !== 30 ||
      value.delivery_scope !== "free_website_only" ||
      !Array.isArray(value.signals) || value.signals.length > 250) {
    throw Error("DERIVED_NEWS_PUBLIC_DOCUMENT_INVALID");
  }
  // A malformed object cannot be permitted to smuggle source metadata to UI.
  return value.signals.filter(s => safeSignal(s, now));
}

export async function fetchDirectDerivedNews(
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<StatelessIntelligenceSignal[]> {
  const response = await fetchWithoutRedirectUsing(fetchImpl,GEOMACRO_DERIVED_JOURNAL_URL, {
    method: "GET",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 512_000) {
    throw Error("DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE");
  }
  const text = await response.text();
  if (text.length > 512_000) throw Error("DERIVED_NEWS_PUBLIC_TOO_LARGE");
  return checkedDerivedNews(JSON.parse(text), now);
}

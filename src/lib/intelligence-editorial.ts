import type { IntelEvent } from "./use-intelligence";
import { isHomepageShowcaseEligible } from "./homepage-intelligence-showcase";
import { dedupePublicIntelligenceRows } from "./public-intelligence-dedupe";

export const COMMERCIAL_DOMAINS = [
  { key: "geopolitics", label: "Geopolitical" },
  { key: "macro", label: "Macro & FX" },
  { key: "rare_earth", label: "Critical minerals" },
] as const;

function storyTime(event: IntelEvent): number {
  const published = Date.parse(event.publishedAt ?? "");
  return Number.isFinite(published) ? published : Date.parse(event.createdAt);
}

/** The UI must never present an upstream classifier observation as scored news. */
export function scoredNews(events: IntelEvent[], now = Date.now()): IntelEvent[] {
  const eligible = events
    .filter((event) => event.publicStatus === "verified_b2" && isHomepageShowcaseEligible(event, now))
    .sort((a, b) => storyTime(b) - storyTime(a) || (b.severity ?? 0) - (a.severity ?? 0) || a.id.localeCompare(b.id));
  // Edge API, same-origin SSR and the browser may receive independently
  // scored renditions of one event. Keep one customer-facing news story.
  // Do not collapse different countries, places, numbers or opposing actions.
  return dedupePublicIntelligenceRows(eligible.map(event => ({
    event,
    category: event.category,
    source_title: event.title,
    summary: event.summary,
    public_status: event.publicStatus,
    published_at: event.publishedAt,
    created_at: event.createdAt,
  }))).map(({ event }) => event);
}

/**
 * A canonical event title, NOT a verbatim news publisher title. Correct redundant
 * geographic granularity while preserving the source's factual meaning.
 */
export function publicHeadline(title: string): string {
  const withoutPrefix = title.replace(/^Geomacro (?:finds|observes)\s+/iu, "").trim();
  const lastLocation = /^(.*?\b(?:in|from|near|across)\s+)([^.!?]+)$/iu.exec(withoutPrefix);
  if (!lastLocation) return withoutPrefix;
  const location = lastLocation[2];
  if (!location.includes(",")) return withoutPrefix;
  const places = location.split(",").map((part) => part.trim());
  if (places.length < 2 || places.length > 5 || places.some((place) => place.length < 2)) return withoutPrefix;
  const normalized = places.map((place) => place.replace(/\s*\(general\)\s*$/iu, "").trim());
  const clean = normalized.filter((place, index) =>
    index === 0 || place.toLocaleLowerCase("en") !== normalized[index - 1].toLocaleLowerCase("en"),
  );
  return lastLocation[1] + clean.join(", ");
}

export function categoryLeads(events: IntelEvent[], now = Date.now()) {
  const safe = scoredNews(events, now);
  return COMMERCIAL_DOMAINS.map((domain) => {
    const category = safe.filter((event) => event.category === domain.key);
    const current = category.filter((event) => storyTime(event) >= now - 24 * 60 * 60 * 1000);
    const candidates = current.length ? current : category;
    const lead = [...candidates].sort((a, b) =>
      (b.severity ?? 0) - (a.severity ?? 0) ||
      storyTime(b) - storyTime(a) ||
      a.id.localeCompare(b.id),
    )[0] ?? null;
    return { ...domain, event: lead, isCurrent: Boolean(lead && storyTime(lead) >= now - 24 * 60 * 60 * 1000) };
  });
}

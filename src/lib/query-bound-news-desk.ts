/**
 * GeoMacro newsroom layer for a question-matched, ORIGINAL-DATED research item.
 *
 * This is a pure presentation projection of ALREADY qualified, derived
 * observations. It never fetches sources, fabricates an event, authorizes
 * commercial use, issues a quote, or certifies a risk/market outcome.
 * Keep source identities, raw article text and private provenance outside.
 */
export type NewsDeskCategory = "geopolitics" | "macro" | "rare_earth";
export type NewsDeskFocus = "what_happened" | "why_it_matters" | "market_relevance" | "what_to_watch";

export type NewsDeskSignal = Readonly<{
  id: string;
  category: NewsDeskCategory;
  topic: string;
  published_at: string;
  date_precision?: "exact" | "day";
  what_changed: string;
  why_it_matters: string;
}>;

const MAX_STORIES = 3;
const BLOCKED = /https?:\/\/|www\.|[<>]/iu;
const clean = (text: unknown, max: number): text is string =>
  typeof text === "string" && text.trim().length > 0 &&
  text.length <= max && !BLOCKED.test(text);

/** Focusing the direct answer does not change the facts or the selected SKU. */
export function questionNewsFocus(question: string | null | undefined): NewsDeskFocus {
  const q = (question ?? "").normalize("NFKC").toLowerCase();
  if (/\b(what next|next update|watch next|upcoming|follow.?up|monitor)\b|পরবর্তী|এরপর|আগামী|अगला|आगे/u.test(q))
    return "what_to_watch";
  if (/\b(market|trader|trading|forex|fx|price impact|stocks?|commodit(?:y|ies)|bonds?)\b|বাজার|ট্রেড|मार्केट|बाज़ार/u.test(q))
    return "market_relevance";
  if (/\b(why|impact|implication|affect|effect|matter|consequence)\b|কেন|প্রভাব|क्यों|प्रभाव/u.test(q))
    return "why_it_matters";
  return "what_happened";
}

export type QueryBoundNewsDesk = Readonly<{
  schema: "geomacro.query-bound-news-desk.v1";
  focus: NewsDeskFocus;
  direct_answer: string;
  coverage: "ORIGINAL_DATED_RESEARCH_ONLY";
  stories: readonly Readonly<{
    observation_id: string;
    category: NewsDeskCategory;
    topic: string;
    original_published_at: string | null;
    original_publication_day: string;
    date_precision: "exact" | "day";
    what_happened: string;
    potential_implication: string | null;
    requested_country_iso3: string;
    affected_country_independently_verified: false;
    original_page_date_verified: true;
    independent_same_event_corroboration_verified: false;
    market_direction: null;
    price_impact: null;
    next_confirmed_event_at: null;
  }>[];
  unique_story_count: number;
  unresolved: readonly string[];
  chargeable: false;
  commercial_rights_verified: false;
  execution_authorized: false;
}>;

/** Date-only publishers cannot acquire an invented UTC hour. */
function validPublicationClock(signal: NewsDeskSignal): boolean {
  const value = signal.published_at;
  const dayOnly = /^20\d{2}-\d{2}-\d{2}$/u.test(value);
  const exact = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value);
  const published = Date.parse(value);
  if ((!dayOnly && !exact) || !Number.isFinite(published) ||
      new Date(published).toISOString().slice(0, 10) !== value.slice(0, 10)) return false;
  if (signal.date_precision === "day")
    return dayOnly || value.endsWith("T00:00:00.000Z");
  if (signal.date_precision === "exact") return exact;
  return dayOnly || exact;
}

/** Dedupe exact publication/derived fact repeats, not merely identical topics.
 * Absence of impact analysis is represented by null, never boilerplate. */
export function buildQueryBoundNewsDesk(input: Readonly<{
  question?: string | null;
  country_iso3: string;
  signals: readonly NewsDeskSignal[];
}>): QueryBoundNewsDesk | null {
  if (!/^[A-Z]{3}$/u.test(input.country_iso3) ||
      !Array.isArray(input.signals)) return null;
  const seenIds = new Set<string>();
  const seenFacts = new Set<string>();
  const unique: NewsDeskSignal[] = [];
  for (const signal of input.signals) {
    if (!signal || !clean(signal.id, 120) || !clean(signal.topic, 120) ||
        !clean(signal.what_changed, 700) || !clean(signal.why_it_matters, 900) ||
        !/^(?:geopolitics|macro|rare_earth)$/u.test(signal.category) ||
        !validPublicationClock(signal)) continue;
    const factKey = [signal.published_at.slice(0, 10),
      signal.what_changed, signal.why_it_matters]
      .map(value => value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim()).join("|");
    if (seenIds.has(signal.id) || seenFacts.has(factKey)) continue;
    seenIds.add(signal.id);
    seenFacts.add(factKey);
    unique.push(signal);
    if (unique.length === MAX_STORIES) break;
  }
  if (!unique.length) return null;

  const focus = questionNewsFocus(input.question);
  const stories = unique.map(signal => ({
    observation_id: signal.id,
    category: signal.category,
    topic: signal.topic,
    original_published_at: signal.date_precision === "day" ||
      /^20\d{2}-\d{2}-\d{2}$/u.test(signal.published_at)
      ? null : signal.published_at,
    original_publication_day: signal.published_at.slice(0, 10),
    date_precision: signal.date_precision === "day" ||
      /^20\d{2}-\d{2}-\d{2}$/u.test(signal.published_at) ? "day" as const : "exact" as const,
    what_happened: signal.what_changed.trim(),
    potential_implication: signal.why_it_matters.trim() === signal.what_changed.trim()
      ? null : signal.why_it_matters.trim(),
    requested_country_iso3: input.country_iso3,
    affected_country_independently_verified: false as const,
    original_page_date_verified: true as const,
    independent_same_event_corroboration_verified: false as const,
    market_direction: null,
    price_impact: null,
    next_confirmed_event_at: null,
  }));
  // Prefer the actual specific finding, not "GeoMacro found N stories".
  // For the market/implications question, preserve the "may/could" wording
  // already in the derived interpretation. Never upgrade it to a prediction.
  const lead = stories[0];
  const direct = focus === "what_happened" ? lead.what_happened
    : focus === "what_to_watch"
      ? `No confirmed follow-up date is established for ${lead.topic}. ${lead.what_happened}`
      : lead.potential_implication ?? lead.what_happened;
  return {
    schema: "geomacro.query-bound-news-desk.v1",
    focus,
    direct_answer: direct,
    coverage: "ORIGINAL_DATED_RESEARCH_ONLY",
    stories,
    unique_story_count: stories.length,
    unresolved: [
      "UNDERLYING_EVENT_NOT_INDEPENDENTLY_CORROBORATED",
      "MARKET_DIRECTION_AND_PRICE_EFFECT_NOT_VERIFIED",
      "NEXT_EVENT_DATE_NOT_VERIFIED",
    ],
    chargeable: false,
    commercial_rights_verified: false,
    execution_authorized: false,
  };
}

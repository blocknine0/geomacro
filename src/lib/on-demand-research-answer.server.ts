import {
  matchesRequestedTopic,
  websiteCandidateFromCountryOriginal,
  type OnDemandCategory,
  type PrivatePageDateResult,
} from "./on-demand-global-discovery.server";
import { country195ByIso3 } from "./canonical-country-registry-195";
import { buildMineralStatisticalFivePart, type MineralStatisticalObservation } from "./mineral-statistical-baseline";
import { buildQueryBoundNewsDesk, type QueryBoundNewsDesk } from "./query-bound-news-desk";
import {
  deriveStatelessSignals,
  type StatelessIntelligenceSignal,
  type StatelessSourceCandidate,
} from "./stateless-intelligence-model";

const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_ANSWER_SIGNALS = 3;
const CATEGORY_LABEL: Readonly<Record<OnDemandCategory, string>> = {
  geopolitics: "Geopolitics",
  macro: "Macro/FX",
  rare_earth: "Critical Minerals",
};

const NON_NEWS_QUESTION = /\b(?:how much|inflation rate|gdp(?: growth)?|exchange rate|interest rate|unemployment rate|price|value|amount|percentage|percent|volume|output|production|reserves|historical|annual data|quarterly data|time series|data series|in\s+(?:19|20)\d{2}|risk score|risk index|gri|forecast|predict(?:ion)?)\b/iu;

/** Do not substitute news observations for a numeric, historical, forecast or scored request. */
export function supportsSourceGroundedResearchQuestion(question: string | null | undefined): boolean {
  return !question || !NON_NEWS_QUESTION.test(question);
}

export type SourceGroundedResearchAnswer = Readonly<{
  schema: "geomacro.source-grounded-research-answer.v1";
  status: "UNVERIFIED_RESEARCH_ONLY";
  query_plan_hash: string;
  query_scope: Readonly<{
    country_iso3: string;
    categories: readonly OnDemandCategory[];
    requested_topics: readonly string[];
    max_age_seconds: number;
  }>;
  answer: Readonly<{
    status: "ORIGINAL_DATED_OBSERVATIONS_ONLY";
    summary: string;
    news_desk: QueryBoundNewsDesk;
    observations: readonly Readonly<{
      category: OnDemandCategory;
      topic: string;
      observation: string;
      published_at: string;
      original_page_date_verified: true;
      claim_independently_verified: false;
    }>[];
    inference: readonly string[];
    what_changed: string;
    why_it_matters: string;
    geomacro_view: string;
  }>;
  evidence_summary: Readonly<{
    original_page_date_verified_count: number;
    latest_original_published_at: string;
    categories_observed: readonly OnDemandCategory[];
  }>;
  commercial_delivery: Readonly<{
    chargeable: false;
    payment_required_now: false;
    commercial_rights_verified: false;
    independent_same_event_corroboration_verified: false;
    signed: false;
    raw_upstream_delivered: false;
    source_identity_exposed: false;
    execution_authorized: false;
  }>;
  limitations: readonly string[];
}>;

type Dependencies = Readonly<{
  candidateFromPage?: typeof websiteCandidateFromCountryOriginal;
  deriveSignals?: typeof deriveStatelessSignals;
}>;

/**
 * Build a small derived-only research answer from the exact original pages
 * already verified during the canonical on-demand request. This is NOT a
 * paid product: it deliberately leaves independent fact review, item-specific
 * commercial rights and signing false. It never returns source URLs, names,
 * article titles, private evidence or raw upstream payloads.
 */
export function buildSourceGroundedResearchAnswer(input: Readonly<{
  country_iso3: string;
  categories: readonly OnDemandCategory[];
  topics: readonly string[];
  question?: string | null;
  max_age_seconds?: number;
  query_plan_hash: string;
  pageProof: PrivatePageDateResult;
  now?: Date;
}>, dependencies: Dependencies = {}): SourceGroundedResearchAnswer | null {
  const country = country195ByIso3(input.country_iso3);
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const maxAge = input.max_age_seconds ?? 86_400;
  if (
    !country ||
    !SHA256.test(input.query_plan_hash) ||
    !Number.isFinite(nowMs) ||
    !Number.isSafeInteger(maxAge) ||
    maxAge < 1 ||
    maxAge > 31 * 86_400 ||
    !Array.isArray(input.categories) ||
    input.categories.length < 1 ||
    input.categories.length > 3 ||
    new Set(input.categories).size !== input.categories.length ||
    input.categories.some(category => !Object.hasOwn(CATEGORY_LABEL, category)) ||
    !Array.isArray(input.topics) ||
    input.topics.length < 1 ||
    !supportsSourceGroundedResearchQuestion(input.question) ||
    !input.pageProof ||
    !Array.isArray(input.pageProof.verified_candidates)
  ) return null;

  const candidateFromPage = dependencies.candidateFromPage ?? websiteCandidateFromCountryOriginal;
  const derive = dependencies.deriveSignals ?? deriveStatelessSignals;
  const maxAgeMs = maxAge * 1_000;
  const pages = [...input.pageProof.verified_candidates]
    .filter(page => {
      const publishedAt = Date.parse(page.page_original_published_at);
      return page.country_iso3 === input.country_iso3 &&
        input.categories.includes(page.domain) &&
        page.first_party_article_url_verified === true &&
        page.publisher_article_page_date_verified === true &&
        Number.isFinite(publishedAt) &&
        publishedAt <= nowMs &&
        nowMs - publishedAt <= maxAgeMs &&
        matchesRequestedTopic(page.article_title, page.domain, input.topics);
    })
    .sort((a, b) =>
      Date.parse(b.page_original_published_at) - Date.parse(a.page_original_published_at));

  // Suppress the same original item across categories before deriving signals.
  // Keep the strongest exact identity (hash/URL/title) once, not once per feed.
  const seen = new Set<string>();
  const candidates: StatelessSourceCandidate[] = [];
  for (const page of pages) {
    const titleKey = page.article_title.normalize("NFKC")
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const keys = [
      page.article_identity_sha256,
      page.article_url.toLowerCase().replace(/\/+$/u, ""),
      `${titleKey}|${page.page_original_published_at.slice(0, 10)}`,
    ];
    if (keys.some(key => seen.has(key))) continue;
    const candidate = candidateFromPage(page, input.country_iso3, now);
    if (!candidate) continue;
    keys.forEach(key => seen.add(key));
    candidates.push(candidate);
  }
  if (!candidates.length) return null;

  const signals: StatelessIntelligenceSignal[] = derive(candidates, nowMs, {
    websiteDelay: false,
    maxSignals: 12,
  }).filter(signal => {
    const publishedAt = Date.parse(signal.published_at);
    return input.categories.includes(signal.category) &&
      Number.isFinite(publishedAt) &&
      publishedAt <= nowMs &&
      nowMs - publishedAt <= maxAgeMs &&
      Boolean(signal.what_changed.trim()) &&
      Boolean(signal.why_it_matters.trim());
  }).sort((a, b) =>
    Date.parse(b.published_at) - Date.parse(a.published_at) || a.id.localeCompare(b.id));

  if (!signals.length) return null;
  // Give every requested category with qualifying evidence one slot before
  // spending remaining slots on the newest observations. This makes a
  // multi-category question produce a genuinely multi-category structure,
  // while the fixed three-signal ceiling and evidence checks stay intact.
  const selected: StatelessIntelligenceSignal[] = [];
  const accepted = new Set<string>();
  const add = (signal: StatelessIntelligenceSignal) => {
    const key = signal.published_at.slice(0, 10) + "|" +
      signal.what_changed.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim() + "|" +
      signal.why_it_matters.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
    if (selected.length < MAX_ANSWER_SIGNALS && !accepted.has(key)) {
      accepted.add(key);
      selected.push(signal);
    }
  };
  for (const category of input.categories) {
    const signal = signals.find(item => item.category === category);
    if (signal) add(signal);
  }
  for (const signal of signals) add(signal);
  const newsDesk = buildQueryBoundNewsDesk({
    question: input.question, country_iso3: input.country_iso3, signals: selected,
  });
  if (!newsDesk || newsDesk.unique_story_count !== selected.length) return null; // Do not leak an excluded/unsafe derived signal elsewhere in the response.
  const latest = selected.reduce((a,b) =>
    Date.parse(a.published_at) >= Date.parse(b.published_at) ? a : b).published_at;
  const categoriesObserved = [...new Set(selected.map(signal => signal.category))];

  return {
    schema: "geomacro.source-grounded-research-answer.v1",
    status: "UNVERIFIED_RESEARCH_ONLY",
    query_plan_hash: input.query_plan_hash,
    query_scope: {
      country_iso3: input.country_iso3,
      categories: [...input.categories],
      requested_topics: [...input.topics],
      max_age_seconds: maxAge,
    },
    answer: {
      status: "ORIGINAL_DATED_OBSERVATIONS_ONLY",
      summary: newsDesk.direct_answer,
      news_desk: newsDesk,
      observations: selected.map(signal => ({
        category: signal.category,
        topic: signal.topic,
        observation: signal.what_changed,
        published_at: signal.published_at,
        original_page_date_verified: true as const,
        claim_independently_verified: false as const,
      })),
      inference: selected.map(signal => signal.why_it_matters),
      what_changed: selected.map(signal => signal.what_changed).join(" "),
      why_it_matters: selected.map(signal => signal.why_it_matters).join(" "),
      geomacro_view: "The original publication dates and first-party pages were checked. The underlying claims have not passed independent same-event review, item-specific commercial-rights review or signing.",
    },
    evidence_summary: {
      original_page_date_verified_count: selected.length,
      latest_original_published_at: latest,
      categories_observed: categoriesObserved,
    },
    commercial_delivery: {
      chargeable: false,
      payment_required_now: false,
      commercial_rights_verified: false,
      independent_same_event_corroboration_verified: false,
      signed: false,
      raw_upstream_delivered: false,
      source_identity_exposed: false,
      execution_authorized: false,
    },
    limitations: [
      "Research-only derived answer; not a signed Geomacro intelligence product.",
      "Independent factual corroboration and item-specific commercial-use rights are not verified.",
      "No risk score, forecast, FX direction or payment eligibility is inferred from a dated original alone.",
      "This response is non-chargeable; only the canonical verified delivery path may use the locked capability prices.",
    ],
  };
}

/** Safe public predicate used by the Agent and MCP wrappers. */
export function isSourceGroundedResearchAnswer(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const answer = row.research_answer;
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
  const research = answer as Record<string, unknown>;
  const commercial = research.commercial_delivery;
  if (!commercial || typeof commercial !== "object" || Array.isArray(commercial)) return false;
  const delivery = commercial as Record<string, unknown>;
  return research.schema === "geomacro.source-grounded-research-answer.v1" &&
    research.status === "UNVERIFIED_RESEARCH_ONLY" &&
    typeof research.query_plan_hash === "string" &&
    SHA256.test(research.query_plan_hash) &&
    delivery.chargeable === false &&
    delivery.payment_required_now === false &&
    delivery.commercial_rights_verified === false &&
    delivery.independent_same_event_corroboration_verified === false &&
    delivery.signed === false &&
    delivery.raw_upstream_delivered === false &&
    delivery.source_identity_exposed === false &&
    delivery.execution_authorized === false &&
    row.chargeable === false &&
    row.payment_required_now === false &&
    row.execution_authorized === false;
}

/** A stable JSON result for questions where the bounded source pass found no
 * qualified, country-matched observation. This is an explicit gap receipt,
 * not an invented factual answer or a signal that the event/data does not
 * exist. It lets human clients and agents handle every valid scoped query with
 * the same schema while the evidence is absent. */
export function buildStructuredEvidenceGap(input: Readonly<{
  country_iso3: string;
  categories: readonly OnDemandCategory[];
  topics: readonly string[];
  question?: string | null;
  query_plan_hash: string;
  checked_at: string;
  source_families_reached: number;
  gap_reason?: "MULTIPLE_MINERALS_REQUIRE_SEPARATE_SCOPED_QUERY";
  mineral_commodity?: string;
  mineral_statistical_observations?: readonly MineralStatisticalObservation[];
}>){
  const country=country195ByIso3(input.country_iso3);
  const checked=Date.parse(input.checked_at);
  if(!country||!SHA256.test(input.query_plan_hash)||!Number.isFinite(checked)||
    !Number.isSafeInteger(input.source_families_reached)||input.source_families_reached<0||
    !Array.isArray(input.categories)||input.categories.length<1||input.categories.length>3||
    new Set(input.categories).size!==input.categories.length||
    input.categories.some(category=>!Object.hasOwn(CATEGORY_LABEL,category))||
    !Array.isArray(input.topics)||input.topics.length<1)return null;
  const queryType=supportsSourceGroundedResearchQuestion(input.question)
    ?"CURRENT_EVENT_OR_RELEASE":"STATISTICAL_HISTORICAL_OR_FORECAST_SERIES";
  // Optional official annual bridge: usable only when a caller supplies an
  // actually parsed country/commodity/year observation. Empty annual evidence
  // remains an honest no-evidence gap; no production=0 or import dependency.
  const statistical=input.categories.length===1&&input.categories[0]==="rare_earth"&&
    typeof input.mineral_commodity==="string"&&
    Array.isArray(input.mineral_statistical_observations)&&
    !input.gap_reason
    ?buildMineralStatisticalFivePart({
      country_iso3:input.country_iso3,commodity:input.mineral_commodity,
      observations:input.mineral_statistical_observations})
    :null;
  if(statistical)return {
    schema:"geomacro.structured-answer.v1" as const,
    status:"OFFICIAL_STATISTICAL_REFERENCE_ONLY" as const,
    query_plan_hash:input.query_plan_hash,
    query_scope:{country_iso3:input.country_iso3,country_name:country.name,
      categories:[...input.categories],requested_topics:[...input.topics],
      query_type:"STRUCTURAL_MINERAL_BASELINE_NOT_CURRENT_NEWS" as const},
    answer:statistical,
    evidence_summary:{verified_observation_count:1,latest_original_published_at:null,
      country_attribution_verified:statistical.five_part.evidence_and_confidence.country_mapping_verified,
      independent_corroboration_verified:false,current_event_verified:false},
    source_check:{checked_at:input.checked_at,source_families_reached:input.source_families_reached,
      bounded_search_exhaustive:false},
    gaps:["NO_COUNTRY_MATCHED_CURRENT_ORIGINAL_DATED_NEWS_VERIFIED",
      "STATISTICAL_BASELINE_IS_NOT_A_CURRENT_EVENT"],
    delivery:{chargeable:false as const,payment_required_now:false as const,
      payment_authorized:false as const,raw_upstream_delivered:false as const,
      source_identity_exposed:false as const,signed:false as const,
      execution_authorized:false as const},
  };

  return {
    schema:"geomacro.structured-answer.v1" as const,
    status:"INSUFFICIENT_VERIFIED_EVIDENCE" as const,
    query_plan_hash:input.query_plan_hash,
    query_scope:{country_iso3:input.country_iso3,country_name:country.name,
      categories:[...input.categories],requested_topics:[...input.topics],query_type:queryType},
    answer:null,
    evidence_summary:{verified_observation_count:0,latest_original_published_at:null,
      country_attribution_verified:false,independent_corroboration_verified:false},
    source_check:{checked_at:input.checked_at,source_families_reached:input.source_families_reached,
      bounded_search_exhaustive:false},
    gaps:[...(input.gap_reason?[input.gap_reason]:[]),queryType==="CURRENT_EVENT_OR_RELEASE"
      ?"NO_COUNTRY_MATCHED_ORIGINAL_DATED_OBSERVATION_VERIFIED_IN_THIS_BOUNDED_SEARCH"
      :"A_QUALIFIED_COUNTRY_AND_PERIOD_SPECIFIC_STRUCTURAL_SERIES_IS_REQUIRED"],
    delivery:{chargeable:false,payment_required_now:false,payment_authorized:false,
      raw_upstream_delivered:false,source_identity_exposed:false,signed:false,
      execution_authorized:false},
  };
}

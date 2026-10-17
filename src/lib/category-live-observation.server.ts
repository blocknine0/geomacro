import {
  readStatelessWebsiteIntelligence,
  type StatelessIntelligenceResult,
} from "./stateless-public-intelligence.server";
import type { StatelessCategory } from "./stateless-intelligence-model";
import type { CommercialIntelligenceCategory } from "./public-intelligence-source-coverage";

/**
 * One bounded, free read-only observation path shared by the three existing
 * category endpoints. It is NOT a signed GRO, paid data, validated country
 * risk or a permission to bypass the existing x402 POST gate.
 */
export const CATEGORY_TO_ORIGINAL = {
  geopolitics: "geopolitics",
  "macro-fx": "macro",
  "critical-minerals": "rare_earth",
} as const satisfies Record<CommercialIntelligenceCategory, StatelessCategory>;

const CACHE_MS = 60_000;
const MAX_FINDINGS = 3;
const MAX_AGE_MS = 86_400_000;
const RELEASE_DELAY_MS = 15 * 60_000;

export type CategoryLiveFinding = {
  id: string;
  topic: string;
  what_changed: string;
  why_it_matters: string;
  published_at: string;
  date_precision: "exact" | "day";
  evidence_class: "original_publisher_release_unscored";
  same_event_corroborated: false;
  risk_score: null;
};

type Reader = typeof readStatelessWebsiteIntelligence;
type Cached = { expiresAt: number; promise: Promise<ReturnType<typeof buildCategoryLiveObservation>> };
const inMemory = new Map<CommercialIntelligenceCategory, Cached>();

export function buildCategoryLiveObservation(
  category: CommercialIntelligenceCategory,
  source: StatelessIntelligenceResult,
  now: number,
) {
  if (source.category !== CATEGORY_TO_ORIGINAL[category]) {
    throw Error("CATEGORY_LIVE_OBSERVATION_MISMATCH");
  }
  const signals = source.signals.filter(signal => {
    const nativeTime = Date.parse(signal.published_at);
    return signal.category === source.category &&
      Number.isFinite(nativeTime) &&
      nativeTime <= now - RELEASE_DELAY_MS &&
      nativeTime >= now - MAX_AGE_MS &&
      signal.status === "official_release_observed_unscored" &&
      signal.same_event_corrob_verified === false &&
      signal.severity === null &&
      !/(?:https?:\/\/|www\.)/iu.test(signal.what_changed + signal.why_it_matters);
  }).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const accepted = signals.slice(0, MAX_FINDINGS);
  // These are narrowly scoped statutory/open-data source credits where
  // applicable, never upstream document copies or URL/host inventories.
  // Some CC BY/OGL products require visible attribution. Never silently
  // omit legally required credit merely to claim source anonymity.
  const requiredCredits = [...new Set(accepted.flatMap(row =>
    row.sources_credited.filter(credit =>
      typeof credit === "string" && credit.length > 0 && credit.length <= 250 &&
      !/(?:https?:\/\/|www\.)/iu.test(credit))
  ))].slice(0, 4);
  return {
    schema_version: "geomacro.category-live-official-observation.v1" as const,
    ok: true,
    category,
    observation_mode: "UNSCORED_OFFICIAL_RELEASES" as const,
    status: accepted.length > 0
      ? "CURRENT_OFFICIAL_OBSERVATIONS_AVAILABLE" as const
      : source.healthy_feed_count > 0
        ? "NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H" as const
        : "OFFICIAL_SOURCES_UNAVAILABLE" as const,
    checked_at: source.checked_at,
    latest_original_published_at: accepted[0]?.published_at ?? null,
    max_original_age_hours: 24,
    publication_delay_minutes: 15,
    findings: accepted.map((signal): CategoryLiveFinding => ({
      id: signal.id,
      topic: signal.topic,
      what_changed: signal.what_changed,
      why_it_matters: signal.why_it_matters,
      published_at: signal.published_at,
      date_precision: signal.date_precision,
      evidence_class: "original_publisher_release_unscored",
      same_event_corroborated: false,
      risk_score: null,
    })),
    licensed_source_credits: requiredCredits,
    source_identity_disclosed_for_mandatory_credit_only: requiredCredits.length > 0,
    source_urls_disclosed: false,
    raw_publisher_content_delivered: false,
    current_signed_risk_intelligence_verified: false,
    independent_same_event_verification: false,
    signed_gro_generated: false,
    x402_payment_required: false,
    paid_delivery_authorized_by_observations: false,
    production_paid_result_verified: false,
    durable_storage_written: false,
  };
}

export async function readCategoryLiveObservation(
  category: CommercialIntelligenceCategory,
  { reader = readStatelessWebsiteIntelligence, now = Date.now() }: {
    reader?: Reader;
    now?: number;
  } = {},
) {
  if (!Object.prototype.hasOwnProperty.call(CATEGORY_TO_ORIGINAL, category) ||
      !Number.isFinite(now)) throw Error("CATEGORY_LIVE_REQUEST_INVALID");
  if (reader !== readStatelessWebsiteIntelligence) {
    return buildCategoryLiveObservation(category, await reader(CATEGORY_TO_ORIGINAL[category], now), now);
  }
  const cached = inMemory.get(category);
  if (cached && cached.expiresAt > now)
    return cached.promise;
  const promise = reader(CATEGORY_TO_ORIGINAL[category], now)
    .then(value => buildCategoryLiveObservation(category, value, now))
    .catch(error => {
      inMemory.delete(category);
      throw error;
    });
  inMemory.set(category, { expiresAt: now + CACHE_MS, promise });
  return promise;
}

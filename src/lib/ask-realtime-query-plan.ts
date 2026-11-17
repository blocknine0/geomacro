import { freshnessMaxAgeHours } from "./ask-freshness";
import { askDomains, type AskDomain } from "./ask-domain-guide";
import {
  GLOBAL_RISK_QUERY_BUCKETS,
  GLOBAL_RISK_QUERY_ROTATION_MS,
  selectGlobalRiskQueryBucket,
} from "../../scripts/lib/global-risk-query-taxonomy.mjs";

export type RealtimeAskCategory = "GEOPOLITICS" | "MACRO" | "CRITICAL_MINERALS";

const ALL_CATEGORIES: readonly RealtimeAskCategory[] =
  ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"];

const CATEGORY_FOR_DOMAIN: Record<AskDomain, RealtimeAskCategory> = {
  geopolitics: "GEOPOLITICS",
  macro: "MACRO",
  rare_earth: "CRITICAL_MINERALS",
};

const BROAD_CURRENT_RE =
  /\b(?:what changed|what happened|what(?: is|'s) changing|what(?: is|'s) happening|today|latest|current developments?|recent developments?|right now)\b/i;

/**
 * Separate the user's freshness requirement from the upstream GDELT search
 * window. A provider can return older rows inside "2d", but they MUST be
 * rejected by the original publication clock before answer generation.
 * A broad category question never becomes an unqualified all-sector answer.
 */
export function buildRealtimeSearchPlan(question: string, now = Date.now(), rotationIndex = 0) {
  const clean = String(question).replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/gu, " ").trim();
  const age = freshnessMaxAgeHours(question);
  const broad = BROAD_CURRENT_RE.test(question) || age !== null ||
    clean.split(/\s+/u).length <= 3;
  const targeted = askDomains(question).map(domain => CATEGORY_FOR_DOMAIN[domain]);
  const broadCategories = (targeted.length ? targeted : [...ALL_CATEGORIES]) as RealtimeAskCategory[];
  const slot = Math.floor(now / GLOBAL_RISK_QUERY_ROTATION_MS);
  const topicBuckets = broadCategories.map((category, index) => {
    const safeQuestion = ` ${clean.toLowerCase()} `;
    const taxonomyCategory = category === "MACRO" ? "MACRO_FX" : category;
    const buckets = GLOBAL_RISK_QUERY_BUCKETS[taxonomyCategory];
    // Match only fixed taxonomy terms. The user's wording is never added to
    // the upstream query; it only selects the closest allowlisted bucket.
    const relevant = buckets.filter(bucket => bucket.terms.some(term =>
      term.toLowerCase().split(/\\s+/u).some(word =>
        word.length >= 5 && safeQuestion.includes(` ${word} `),
      ),
    ));
    if (!relevant.length) {
      return selectGlobalRiskQueryBucket(taxonomyCategory, now, (rotationIndex + index) % 100_000);
    }
    const match = relevant[(slot + rotationIndex + index) % relevant.length];
    return Object.freeze({
      category: taxonomyCategory,
      slot,
      bucket_index: buckets.indexOf(match),
      bucket_id: match.id,
      topic_tags: match.topic_tags,
      terms: match.terms,
      affected_assets: match.affected_assets,
    });
  });
  return {
    broad,
    maxAgeHours: age ?? (broad ? 48 : 7 * 24),
    timespan: broad ? "2d" : "7d",
    broadCategories,
    topicBuckets,
    rotation_interval_ms: 20 * 60 * 1000,
  };
}

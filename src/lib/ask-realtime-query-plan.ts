import { freshnessMaxAgeHours } from "./ask-freshness";

export type RealtimeAskCategory = "GEOPOLITICS" | "MACRO" | "CRITICAL_MINERALS";

const ALL_CATEGORIES: readonly RealtimeAskCategory[] =
  ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"];

const CATEGORY_INTENT: ReadonlyArray<{ category: RealtimeAskCategory; match: RegExp }> = [
  { category: "GEOPOLITICS", match: /\b(?:geopolitic(?:s|al)?|diplomac(?:y|ies)|foreign policy|sanctions?|conflict|elections?)\b/i },
  { category: "MACRO", match: /\b(?:macro(?:economics?|economic)?|fx|foreign exchange|inflation|currency|interest rates?|central bank|gdp|recession)\b/i },
  { category: "CRITICAL_MINERALS", match: /\b(?:critical[- ]minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|copper|gallium|germanium)\b/i },
];

const BROAD_CURRENT_RE =
  /\b(?:what changed|what happened|what(?: is|'s) changing|what(?: is|'s) happening|today|latest|current developments?|recent developments?|right now)\b/i;

/**
 * Separate the user's freshness requirement from the upstream GDELT search
 * window. A provider can return older rows inside "2d", but they MUST be
 * rejected by the original publication clock before answer generation.
 * A broad category question never becomes an unqualified all-sector answer.
 */
export function buildRealtimeSearchPlan(question: string) {
  const clean = String(question).replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/gu, " ").trim();
  const age = freshnessMaxAgeHours(question);
  const broad = BROAD_CURRENT_RE.test(question) || age !== null ||
    clean.split(/\s+/u).length <= 3;
  const targeted = CATEGORY_INTENT.filter(rule => rule.match.test(question))
    .map(rule => rule.category);
  return {
    broad,
    maxAgeHours: age ?? (broad ? 48 : 7 * 24),
    timespan: broad ? "2d" : "7d",
    broadCategories: (targeted.length ? targeted : [...ALL_CATEGORIES]) as RealtimeAskCategory[],
  };
}

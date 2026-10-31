import { askDomains, domainGuideAnswer } from "./ask-domain-guide";
import {
  answerQuestion as answerHybridQuestion,
  type HybridAskAnswer,
} from "./hybrid-ask-intelligence.server";
import { realtimeSearchAnswer } from "./ask-realtime-search.server";
import { answerFromCurrentOriginals } from "./ask-on-demand-original.server";
import { answerOfficialNumeric, planAskOfficialNumeric } from "./ask-official-numeric.server";
import {collectSharedOfficialNews} from "./ask-shared-derived-journal.server";

/**
 * Canonical Ask Geomacro answer orchestration.
 *
 * 1. Prefer Geomacro's verified permanent/B2 intelligence when it is sufficient.
 * 2. Let the existing bounded live adapters answer when they can.
 * 3. If both paths remain insufficient, run a bounded current-public-evidence
 *    search and return a structured direct answer without exposing raw URLs,
 *    publisher/provider identity or internal retrieval payloads.
 *
 * A total search outage remains fail-closed: the original insufficient answer
 * is returned rather than manufacturing unsupported content.
 */

/**
 * Narrow, source-private first-party release fallback for broad category-news
 * requests. This is NOT independent event verification, risk scoring, signed
 * GRO delivery, or payment acceptance. Specific country, asset, numeric-risk,
 * causal, directional and investment questions remain on the governed path.
 */
type OfficialNewsCategory = "geopolitics" | "macro" | "rare_earth";

/**
 * Broad natural-language news questions can read the three-category D1
 * journal. Topic/country/asset-specific questions must continue to the
 * original-discovery / governed / realtime path: a category-level story is
 * never evidence for a narrowly scoped event.
 */
function selectOfficialNewsCategories(question: string): OfficialNewsCategory[] {
  const q = question.trim().toLowerCase().replace(/[’']/g, "");
  const current = /\b(?:latest|recent|current|today|news|updates?|developments?|changed|changing|new|last\s+(?:24|48|72)\s+hours?)\b/u.test(q);
  if (!current) return [];

  const categories = askDomains(q);
  const generic = /^(?:what\s+(?:has\s+)?changed\s+today|what\s+is\s+new\s+today|latest\s+(?:global\s+)?news|latest\s+developments|what\s+is\s+happening\s+today)\??$/u.test(q);
  const rest = q
    .replace(/\b(?:geopolitical|geopolitics?|diplomacy|diplomatic|foreign\s+policy|world\s+affairs|macro(?:economic|economics)?|fx|foreign\s+exchange|critical[- ]minerals?|rare[- ]earths?)\b/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
  const allowed = new Set([
    "what", "whats", "is", "are", "has", "have", "been", "the", "a", "an",
    "latest", "recent", "current", "new", "news", "update", "updates",
    "development", "developments", "release", "releases", "changed",
    "changing", "happening", "show", "me", "give", "tell", "about",
    "in", "on", "for", "any", "from", "today", "now", "please",
    "globally", "global", "world", "worldwide", "around", "across",
    "all", "three", "categories", "domains", "areas", "sectors",
    "summarize", "summary", "brief", "briefing", "overview",
    "headlines", "events", "during", "past", "last", "hours", "hour",
    "24", "48", "72", "this", "week", "and", "or",
  ]);
  if (!generic && rest.split(/\s+/u).some(token => token && !allowed.has(token)))
    return [];
  return categories.length ? categories : (generic ? ["geopolitics", "macro", "rare_earth"] : []);
}

/**
 * News-only observations must never be mistaken for a signed GRO or a
 * payment-eligible country/commodity/corridor risk assessment.
 */
async function officialUnscoredReleaseAnswer(question: string): Promise<HybridAskAnswer | null> {
  const categories = selectOfficialNewsCategories(question);
  if (!categories.length) return null;
  // The SAME source-neutral, native-dated D1 journal already powers website
  // and free API. Reuse it for covered categories instead of re-fetching
  // official publishers; missing categories still get bounded live checks.
  const selected=await collectSharedOfficialNews(categories);
  const signals=selected.signals;
  if (!signals.length) return null;
  // Report only categories that ACTUALLY yielded native-dated releases.
  // A healthy request for three categories is not evidence that all three
  // produced eligible stories today.
  const observed = Array.from(new Set(signals.map(signal => signal.category)));
  const categoryLabel = "in " + observed.map(category =>
    category === "rare_earth" ? "Critical Minerals"
      : category === "macro" ? "Macro/FX" : "Geopolitics"
  ).join(", ");
  const latestOriginal = signals.map(signal => signal.published_at).sort().at(-1)!;
  return {
    summary: "Geomacro observed " + signals.length + " recent official release" +
      (signals.length === 1 ? "" : "s") + " " + categoryLabel +
      "; these are unscored observations, not independently corroborated risk assessments.",
    what_changed: signals.map(signal => signal.what_changed).join(" "),
    why_it_matters: signals.map(signal => signal.why_it_matters).join(" "),
    geomacro_view: "First-party publication dates were checked. No independent same-event corroboration, risk score or signed GRO is claimed.",
    evidence: signals.map(signal => ({
      eventId: "live:official:" + signal.id,
      title: signal.title,
      relevance: 100,
    })),
    insufficient_evidence: false,
    mean_relevance: null,
    low_confidence: true,
    gri: null,
    generatedAt: new Date().toISOString(),
    latest_original_published_at: latestOriginal,
    data_mode: selected.live_categories_queried.length===0 ? "short_cache":"ephemeral_live",
    cache_status: selected.live_categories_queried.length===0 ? "hit":"bypassed",
    source_identity_exposed: false,
    durable_live_storage_write: false,
    real_time_message: selected.live_categories_queried.length===0
      ? "Reused original-dated Geomacro D1 news. No new issuer request or signed risk claim."
      : "Reused qualified D1 news; checked missing categories via bounded live originals. No signed risk claim.",
    intelligence_tier: "official_observation_unscored",
    signed_gro_generated: false,
    independent_same_event_verification: false,
  };
}

function noCurrentPublisherNewsAnswer(): HybridAskAnswer {
  return {
    summary: "Geomacro cannot confirm a new original-dated official release from the checked feeds in the past 24 hours.",
    what_changed: "No qualifying fresh original release was verified from the bounded first-party sources checked for this request.",
    why_it_matters: "This does not mean no developments occurred globally. Unavailable, delayed or out-of-scope publications may exist.",
    geomacro_view: "Geomacro will not substitute stale historical scores or manufacture a fresh signed intelligence claim.",
    evidence: [], insufficient_evidence: true, mean_relevance: null,
    low_confidence: true, gri: null, generatedAt: new Date().toISOString(),
    data_mode: "ephemeral_live", cache_status: "bypassed",
    source_identity_exposed: false, durable_live_storage_write: false,
    real_time_message: "First-party source freshness unconfirmed; no scored or signed result.",
    signed_gro_generated: false, independent_same_event_verification: false,
  };
}

// Only the three exact scored-index queries. Other risk questions retain the
// governed intelligence engine. No new score, fake source or paid entitlement.
function canonicalScoredIndexQuestion(question: string): string | null {
  const q=question.trim();
  if (/^What is the latest geopolitical risk index\??$/iu.test(q))
    return "Geopolitical Risk Index";
  if (/^What is the latest macroeconomic risk index\??$/iu.test(q))
    return "Macroeconomic Risk Index";
  if (/^What is the latest critical minerals risk index\??$/iu.test(q))
    return "Critical Minerals Risk Index";
  return null;
}
function unavailableScoredIndex(label: string): HybridAskAnswer {
  return {
    summary: label+" has no verified current signed reading available.",
    what_changed: "No current signed index value passed the existing retrieval and freshness checks for this request.",
    why_it_matters: "An official news item, historical snapshot or annual dataset is not a substitute for a current signed risk index.",
    geomacro_view: "Geomacro will not generate a numeric score or describe stale index values as live. Retry when verified current data is available.",
    evidence: [],insufficient_evidence:true,mean_relevance:null,
    low_confidence:true,gri:null,generatedAt:new Date().toISOString(),
    data_mode:"ephemeral_live",cache_status:"bypassed",
    source_identity_exposed:false,durable_live_storage_write:false,
    real_time_message:"CURRENT_SIGNED_RISK_INDEX_UNAVAILABLE",
    signed_gro_generated:false,independent_same_event_verification:false
  };
}

export async function answerAskQuestion(question: string): Promise<HybridAskAnswer> {
  const guide = domainGuideAnswer(question);
  if (guide) return guide;
  // Explicit named index questions are never answered by keyword-matched
  // news or B2 articles. First try the existing signed/verified Risk Indices
  // reader; if unavailable or label-mismatched, give a useful, truthful
  // category-specific unavailable answer, not a blank chat or wrong category.
  const scopedIndex=canonicalScoredIndexQuestion(question);
  if(scopedIndex){
    try{
      const matched=await answerHybridQuestion(question);
      const text=[matched.summary,matched.what_changed,matched.geomacro_view].join(" ");
      if(matched.insufficient_evidence===false &&
         matched.low_confidence===false &&
         text.includes(scopedIndex) &&
         /verified Risk Indices package/iu.test(matched.summary))
        return matched;
    }catch{/* Missing B2/edge cannot become an invented current score. */}
    return unavailableScoredIndex(scopedIndex);
  }
  // For explicit precise official measurements, either answer with a verified
  // source period or fail closed: an indexed headline is never a numeric value.
  if (planAskOfficialNumeric(question)) {
    let safeFailureCode = "ASK_OFFICIAL_NUMERIC_SOURCE_NO_VERIFIED_DATA";
    const official = await answerOfficialNumeric(question, {
      onFailure: code => { safeFailureCode = code; },
    });
    if (official) return official;
    return {
      summary: "The requested exact official observation could not be verified from the live source.",
      what_changed: "No matching original numerical series was safely retrieved for this request.",
      why_it_matters: "A missing release or API timeout does not establish a zero value or an unchanged rate.",
      geomacro_view: "Geomacro will not invent numerical data or substitute news-index timestamps for a statistical reporting period.",
      evidence: [], insufficient_evidence: true, mean_relevance: null,
      low_confidence: true, gri: null, generatedAt: new Date().toISOString(),
      data_mode: "ephemeral_live", cache_status: "bypassed",
      source_identity_exposed: false, durable_live_storage_write: false,
      real_time_message: "Official numeric retrieval status: " + safeFailureCode,
      signed_gro_generated: false, independent_same_event_verification: false,
    };
  }
  // Broad free-news requests use original releases and bounded index discovery.
  // Country, corridor and scored questions keep the governed path below.
  if (selectOfficialNewsCategories(question).length > 0) {
    try {
      const official = await officialUnscoredReleaseAnswer(question);
      if (official) return official;
    } catch (error) {
      console.error("[ask-answer] official release lookup unavailable",
        error instanceof Error ? error.message : "unknown error");
    }
    const unavailable = noCurrentPublisherNewsAnswer();
    try {
      return (await realtimeSearchAnswer(question, unavailable, { deterministicOnly: true }))
        ?? unavailable;
    } catch {
      return unavailable;
    }
  }
  // Narrow first-party source reads are separate from signed/payable intelligence.
  try {
    const original = await answerFromCurrentOriginals(question);
    if (original) return original;
  } catch (error) {
    console.error("[ask-answer] original retrieval unavailable",
      error instanceof Error ? error.message : "unknown error");
  }
  const primary = await answerHybridQuestion(question);
  if (!primary.insufficient_evidence) return primary;
  // An unverified general web search cannot manufacture a requested exact
  // numerical risk index. Give a category-specific unavailable answer instead.
  try {
    const realtime = await realtimeSearchAnswer(question, primary);
    return realtime ?? primary;
  } catch (error) {
    console.error(
      "[ask-answer] realtime fallback unavailable; preserving fail-closed answer",
      error instanceof Error ? error.message : "unknown error",
    );
    return primary;
  }
}

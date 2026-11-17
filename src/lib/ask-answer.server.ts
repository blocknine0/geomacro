import {readCurrentReviewedSignedIndices,signedCategoryReading} from "./reviewed-risk-index-retrieval.server";
import { domainGuideAnswer } from "./ask-domain-guide";
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

function selectOfficialNewsCategories(question: string): OfficialNewsCategory[] {
  const q = question.trim().toLowerCase();
  const patterns: readonly { category: OfficialNewsCategory; test: RegExp }[] = [
    { category: "geopolitics", test: /\b(geopolitic(?:s|al)?|diplomac(?:y|ies)|foreign policy)\b/i },
    { category: "macro", test: /\b(macro(?:economics?|economic)?|fx|foreign exchange)\b/i },
    { category: "rare_earth", test: /\b(critical minerals?|rare earths?|rare-earths?)\b/i },
  ];
  const matches = patterns.filter(item => item.test.test(q));
  const genericNews = /^(?:what (?:has )?changed today|what (?:is|'s) new today|what happened today|what(?: is|'s) happening today|latest news|latest developments|(?:give me )?(?:the )?(?:news|updates) today)\??$/i.test(q);
  const looksLikeNews = /\b(latest|recent|current|new|updates?|developments?|releases?|news|changed|changing|happened|happening|today)\b/i.test(q);
  if (!looksLikeNews || matches.length > 1 || (matches.length === 0 && !genericNews))
    return [];
  const rest = q
    .replace(/\b(?:geopolitics?|geopolitical|diplomacy|foreign policy|macro\/fx|macroeconomics?|macroeconomic|macro|fx|foreign exchange|critical minerals?|rare[- ]earths?)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const allowed = new Set([
    "what", "whats", "s", "is", "are", "has", "the", "latest", "recent",
    "current", "new", "news", "update", "updates", "development",
    "developments", "release", "releases", "changed", "changing",
    "show", "me", "give", "tell", "about", "in", "on", "for", "any",
    "from", "today", "now", "please", "us", "there", "have", "been",
    "globally", "global", "world",
  ]);
  if (rest.split(/\s+/).some(token => token && !allowed.has(token))) return [];
  return matches.length === 1
    ? [matches[0].category]
    : ["geopolitics", "macro", "rare_earth"];
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
    summary: "I found " + signals.length + " recent official release" +
      (signals.length === 1 ? "" : "s") + " " + categoryLabel +
      "; this is observed news, not a corroborated risk assessment.",
    what_changed: signals.map(signal => signal.what_changed).join(" "),
    why_it_matters: signals.map(signal => signal.why_it_matters).join(" "),
    geomacro_view: "I checked the original release dates. These items haven't been independently matched to the same event, scored or signed as a Risk Gate.",
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
    summary: "I couldn't confirm a fresh original release in the feeds checked over the past 24 hours.",
    what_changed: "The checked first-party feeds didn't return a qualifying new release for this question.",
    why_it_matters: "That doesn't mean nothing happened; some sources may be delayed, unavailable or outside this check.",
    geomacro_view: "I won't replace the gap with an old score or a newly invented claim.",
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
    summary: "I don't have a current signed "+label+" reading to share.",
    what_changed: "No reading passed the current signature and freshness checks.",
    why_it_matters: "News, an old snapshot or an annual statistic can't stand in for a current signed index.",
    geomacro_view: "I won't present an old value as live or fill the gap with a made-up score. Try again later.",
    evidence: [],insufficient_evidence:true,mean_relevance:null,
    low_confidence:true,gri:null,generatedAt:new Date().toISOString(),
    data_mode:"ephemeral_live",cache_status:"bypassed",
    source_identity_exposed:false,durable_live_storage_write:false,
    real_time_message:"CURRENT_SIGNED_RISK_INDEX_UNAVAILABLE",
    signed_gro_generated:false,independent_same_event_verification:false
  };
}


type AskAdapterLabel="reviewed_indices"|"official_numeric"|"official_news"|"current_originals"|"derived_intelligence"|"indexed_discovery";
async function boundedAskAdapter<T>(label:AskAdapterLabel,run:()=>Promise<T>,timeoutMs:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   run(),
   new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error("ASK_ADAPTER_"+label.toUpperCase()+"_TIMEOUT")),timeoutMs);}),
  ]);
 }catch{
  // Keep diagnostics to fixed adapter labels; never log provider errors or user content.
  console.warn("[ask-answer] adapter unavailable",label);
  throw new Error("ASK_ADAPTER_"+label.toUpperCase()+"_UNAVAILABLE");
 }finally{if(timer!==undefined)clearTimeout(timer);}
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
    const domain=scopedIndex==="Geopolitical Risk Index"?"geopolitics":
      scopedIndex==="Macroeconomic Risk Index"?"macro":"critical_minerals";
    // This is a bounded direct read of a CURRENT, reviewer-gated GRI v1.2
    // with verified Ed25519 issuer delivery. No prompt, Groq call or
    // self-certified news-severity score is used for numeric index answers.
    const signed=await boundedAskAdapter("reviewed_indices",readCurrentReviewedSignedIndices,5_500).catch(()=>null);
    const matched=signed?signedCategoryReading(signed,domain):null;
    if(matched&&signed){
      return {
        summary:scopedIndex+": "+matched.score+"/100 (reviewed GRI v1.2, as of "+
          signed.snapshotAsOf+").",
        what_changed:"A current, authenticated reviewer-gated signed index reading was retrieved. No historical movement or event attribution is inferred.",
        why_it_matters:"The reading is sourced from the existing independently reviewed scoring and B2/D1 publication lineage, rather than news-feed triage.",
        geomacro_view:"Source-native timestamp: "+signed.snapshotAsOf+
          ". Issuer Ed25519 delivery was verified; the result is advisory and never execution authorization.",
        evidence:[],insufficient_evidence:false,mean_relevance:null,
        low_confidence:false,gri:null,generatedAt:new Date().toISOString(),
        data_mode:"ephemeral_live",cache_status:"bypassed",
        answer_kind:"public_info",source_identity_exposed:false,
        durable_live_storage_write:false,
        real_time_message:"CURRENT_SIGNED_REVIEWED_RISK_INDEX",
        signed_gro_generated:false,independent_same_event_verification:false
      };
    }
    return unavailableScoredIndex(scopedIndex);
  }
  // For explicit precise official measurements, either answer with a verified
  // source period or fail closed: an indexed headline is never a numeric value.
  if (planAskOfficialNumeric(question)) {
    let safeFailureCode = "ASK_OFFICIAL_NUMERIC_SOURCE_NO_VERIFIED_DATA";
    const official = await boundedAskAdapter("official_numeric",()=>answerOfficialNumeric(question, {
      onFailure: code => { safeFailureCode = code; },
    }),5_500).catch(()=>null);
    if (official) return official;
    return {
      summary: "I couldn't verify the requested official number.",
      what_changed: "The check didn't return a matching original data series.",
      why_it_matters: "A missing release or a slow source doesn't mean the value is zero or unchanged.",
      geomacro_view: "I won't guess the number or treat a news-index timestamp as the statistical period.",
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
    const unavailable=noCurrentPublisherNewsAnswer();
    const [officialResult,indexedResult]=await Promise.allSettled([
      boundedAskAdapter("official_news",()=>officialUnscoredReleaseAnswer(question),5_500),
      boundedAskAdapter("indexed_discovery",()=>realtimeSearchAnswer(question,unavailable,
        {deterministicOnly:true,allowBrowserFallback:false}),7_500),
    ]);
    if(officialResult.status==="fulfilled"&&officialResult.value)return officialResult.value;
    if(indexedResult.status==="fulfilled"&&indexedResult.value)return indexedResult.value;
    return unavailable;
  }

  // These readers are independent. Start them together and bound each one so
  // a stalled original feed or adapter cannot consume the 14-second request cap.
  const [originalResult,derivedResult,indexedResult]=await Promise.allSettled([
    boundedAskAdapter("current_originals",()=>answerFromCurrentOriginals(question),5_500),
    boundedAskAdapter("derived_intelligence",()=>answerHybridQuestion(question),6_500),
    boundedAskAdapter("indexed_discovery",()=>realtimeSearchAnswer(question,
      noCurrentPublisherNewsAnswer(),{deterministicOnly:true,allowBrowserFallback:false}),7_500),
  ]);
  const original=originalResult.status==="fulfilled"?originalResult.value:null;
  const derived=derivedResult.status==="fulfilled"?derivedResult.value:null;
  const indexed=indexedResult.status==="fulfilled"?indexedResult.value:null;
  if(original&&!original.insufficient_evidence)return original;
  if(derived&&!derived.insufficient_evidence)return derived;
  // A real indexed lead can add context when stronger GeoMacro reads are
  // unavailable, but it remains explicitly provisional and never becomes a score.
  const candidates=[original,derived,indexed].filter((answer):answer is HybridAskAnswer=>Boolean(answer));
  candidates.sort((a,b)=>
    Number(a.insufficient_evidence)-Number(b.insufficient_evidence)||
    b.evidence.length-a.evidence.length||
    Number(a.low_confidence)-Number(b.low_confidence));
  return candidates[0]??noCurrentPublisherNewsAnswer();
}

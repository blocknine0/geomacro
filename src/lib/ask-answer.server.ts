import {readCurrentReviewedSignedIndices,signedCategoryReading} from "./reviewed-risk-index-retrieval.server";
import { domainGuideAnswer } from "./ask-domain-guide";
import {
  answerQuestion as answerHybridQuestion,
  type HybridAskAnswer,
} from "./hybrid-ask-intelligence.server";
import { realtimeSearchAnswer } from "./ask-realtime-search.server";
import { answerFromCurrentOriginals } from "./ask-on-demand-original.server";
import { COUNTRIES_195, type Country195 } from "./canonical-country-registry-195";
import { answerOfficialNumeric, planAskOfficialNumeric } from "./ask-official-numeric.server";
import {collectSharedOfficialNews} from "./ask-shared-derived-journal.server";
import {fetchHomeDerivedNews} from "./home-derived-news-client";

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
type OfficialNewsRequest={categories:OfficialNewsCategory[];countryTerms:string[];corridorTerms:string[];scopeLabel:string};
const ASK_CORRIDORS:ReadonlyArray<{label:string;terms:readonly string[]}>= [
 {label:"Red Sea",terms:["Red Sea"]},
 {label:"Bab el-Mandeb",terms:["Bab el-Mandeb","Bab al-Mandab"]},
 {label:"Strait of Hormuz",terms:["Strait of Hormuz","Hormuz Strait","Hormuz"]},
 {label:"Strait of Malacca",terms:["Strait of Malacca","Malacca Strait","Malacca"]},
 {label:"Suez Canal",terms:["Suez Canal"]},
 {label:"Panama Canal",terms:["Panama Canal"]},
 {label:"Bosporus",terms:["Bosporus","Bosphorus"]},
 {label:"GIUK Gap",terms:["GIUK Gap"]},
 {label:"Cape of Good Hope",terms:["Cape of Good Hope"]},
 {label:"Bering Strait",terms:["Bering Strait"]},
];
function escapeRegExp(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function phraseOccurs(text:string,phrase:string,caseSensitive=false):boolean{
 const flags=caseSensitive?"u":"iu";
 return new RegExp("(?:^|[^\\p{L}\\p{N}])"+escapeRegExp(phrase)+"(?:$|[^\\p{L}\\p{N}])",flags).test(text);
}
function countryMentions(question:string):Country195[]{
 return COUNTRIES_195.filter(country=>{
   const names=[country.name,...country.aliases,country.iso3];
   if(country.iso3==="USA")names.push("US","U.S.");
   if(country.iso3==="GBR")names.push("UK","U.K.");
   return names.some(name=>name.length>=2&&phraseOccurs(question,name,name.length<=3));
 });
}
function removePhrases(text:string,phrases:readonly string[]):string{
 return phrases.filter(Boolean).reduce((result,phrase)=>result.replace(
   new RegExp(escapeRegExp(phrase),"giu")," "),text);
}

function selectOfficialNewsRequest(question: string): OfficialNewsRequest|null {
  const q = question.trim().toLowerCase();
  const patterns: readonly { category: OfficialNewsCategory; test: RegExp }[] = [
    { category: "geopolitics", test: /\b(geopolitic(?:s|al)?|diplomac(?:y|ies)|foreign policy)\b/i },
    { category: "macro", test: /\b(macro(?:economics?|economic)?|fx|foreign exchange)\b/i },
   { category: "rare_earth", test: /\b(critical minerals?|rare earths?|rare-earths?|lithium|cobalt|nickel|graphite|copper|uranium|tungsten|gallium|germanium)\b/i },
  ];
  const matches = patterns.filter(item => item.test.test(q));
  const countries=countryMentions(question);
  const corridorMatches=ASK_CORRIDORS.filter(row=>row.terms.some(term=>phraseOccurs(question,term)));
  const countryScope=countries;
  const corridorScope=corridorMatches.length===1?corridorMatches[0]:null;
  const genericNews = /^(?:what (?:has )?changed today|what (?:is|'s) new today|what happened today|what(?: is|'s) happening today|latest news|latest developments|(?:give me )?(?:the )?(?:news|updates) today)\??$/i.test(q);
  const looksLikeNews = /\b(latest|recent|current|new|updates?|developments?|releases?|news|changed|changing|happened|happening|today)\b/i.test(q);
  if (!looksLikeNews || corridorMatches.length>1 || countries.length>3 ||
      (matches.length===0&&!genericNews&&!countryScope.length&&!corridorScope))return null;
  const entities=[...countryScope.flatMap(country=>[country.name,...country.aliases,country.iso3]),
    ...(corridorScope?.terms??[])];
  const rest = removePhrases(q,entities)
    .replace(/\b(?:geopolitics?|geopolitical|diplomac(?:y|ies)|foreign policy|macro\/fx|macroeconomics?|macroeconomic|macro|fx|foreign exchange|critical minerals?|rare[- ]earths?)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const allowed = new Set([
    "what", "whats", "s", "is", "are", "has", "the", "latest", "recent",
    "current", "new", "news", "update", "updates", "development",
    "developments", "release", "releases", "changed", "changing",
    "show", "me", "give", "tell", "about", "in", "on", "for", "any",
    "from", "today", "now", "please", "us", "there", "have", "been",
    "globally", "global", "world", "risk", "around", "regarding",
  ]);
  if (rest.split(/\s+/).some(token => token && !allowed.has(token))) return null;
  const categories:OfficialNewsCategory[]=matches.length?matches.map(item=>item.category):["geopolitics","macro","rare_earth"];
  const countryTerms=countryScope.flatMap(country=>[country.name,...country.aliases,country.iso3]);
  const scopeLabel=[...countryScope.map(country=>country.name),corridorScope?.label].filter(Boolean).join(" and ");
  return {categories,countryTerms,corridorTerms:corridorScope?.terms.slice()??[],scopeLabel};
}

/**
 * News-only observations must never be mistaken for a signed GRO or a
 * payment-eligible country/commodity/corridor risk assessment.
 */
async function officialUnscoredReleaseAnswer(question: string): Promise<HybridAskAnswer | null> {
  const request=selectOfficialNewsRequest(question);
  if(!request)return null;
  const {categories,countryTerms,corridorTerms,scopeLabel}=request;
  // The SAME source-neutral, native-dated D1 journal already powers website
  // and free API. Reuse it for covered categories instead of re-fetching
  // official publishers. A missing D1 category stays missing in this answer,
  // so the deterministic composer has no upstream rate limit or provider dependency.
  const selected=await collectSharedOfficialNews(categories,{allowLiveFallback:false,
    scope:{countryNames:countryTerms,corridorTerms}});
  const signals=selected.signals;
  if (!signals.length) return noCurrentPublisherNewsAnswer(scopeLabel);
  // Report only categories that ACTUALLY yielded native-dated releases.
  // A healthy request for three categories is not evidence that all three
  // produced eligible stories today.
  const observed = Array.from(new Set(signals.map(signal => signal.category)));
  const categoryLabel = "in " + observed.map(category =>
    category === "rare_earth" ? "Critical Minerals"
      : category === "macro" ? "Macro/FX" : "Geopolitics"
  ).join(", ");
  const latestOriginal = signals.map(signal => signal.published_at).sort().at(-1)!;
  const scopeCopy=scopeLabel?" for "+scopeLabel:"";
  return {
    summary: "I found " + signals.length + " recent official release" +
      (signals.length === 1 ? "" : "s") + scopeCopy+" " + categoryLabel +
      "; this is observed news, not a corroborated risk assessment.",
    what_changed: signals.map(signal => signal.what_changed).join(" "),
    why_it_matters: signals.map(signal => signal.why_it_matters).join(" "),
    geomacro_view: "I checked the original release dates. These observations are not independently matched to the same event, scored or signed as a Risk Gate. Decision support only. This answer is not execution authorization.",
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
    real_time_message: "Read the canonical source-free D1 journal once. No issuer request or signed risk claim.",
    intelligence_tier: "official_observation_unscored",
    signed_gro_generated: false,
    independent_same_event_verification: false,
    execution_authorized:false,
    decision_support_boundary:"Decision support only. This answer is not execution authorization or a signed Risk Gate.",
  };
}

function noCurrentPublisherNewsAnswer(scopeLabel=""): HybridAskAnswer {
  const scopeCopy=scopeLabel?" for "+scopeLabel:"";
  return {
    summary: "I couldn't confirm a fresh qualifying official observation"+scopeCopy+" in the last 24 hours.",
    what_changed: "The canonical source-free journal has no matching observation for this question.",
    why_it_matters: "This is a data gap, not evidence that nothing happened or that conditions are unchanged.",
    geomacro_view: "I won't replace the gap with an old score or an invented claim. Decision support only. This answer is not execution authorization.",
    evidence: [], insufficient_evidence: true, mean_relevance: null,
    low_confidence: true, gri: null, generatedAt: new Date().toISOString(),
    data_mode: "ephemeral_live", cache_status: "bypassed",
    source_identity_exposed: false, durable_live_storage_write: false,
    real_time_message: "Canonical D1 observation unavailable for the requested scope; no score or signed result.",
    signed_gro_generated: false, independent_same_event_verification: false,
    execution_authorized:false,
    decision_support_boundary:"Decision support only. This answer is not execution authorization or a signed Risk Gate.",
  };
}


const ASK_STOP_WORDS = new Set([
  "what","whats","how","why","when","where","who","which","the","and","for","are","was","were",
  "will","would","could","should","can","with","from","that","this","these","those","about",
  "into","over","last","past","recent","latest","current","today","now","tell","show","give",
  "please","any","there","have","has","been","they","their","our","your","affect","impact",
  "effect","mean","means","explain","describe","observation","observations","date","dates",
  "evidence","basis","concrete","hour","hours","24h","news","update","updates","development",
  "developments","risk","risks","happened","happening","changed","changing","right","globally","global"
]);

async function websiteIntelligenceBriefAnswer(question: string): Promise<HybridAskAnswer | null> {
  const homeSignals = await fetchHomeDerivedNews().catch(() => []);
  if (!homeSignals.length) return null;

  const q = question.trim();
  const countries = countryMentions(q);
  const countryTerms = countries.flatMap(c => [c.name, ...c.aliases, c.iso3]).map(t => t.toLowerCase());
  const corridorTerms = ASK_CORRIDORS
    .filter(row => row.terms.some(t => phraseOccurs(q, t)))
    .flatMap(row => row.terms)
    .map(t => t.toLowerCase());

  const wantCats: OfficialNewsCategory[] = [];
  if (/\b(geopolitic|diplomac|foreign policy|conflict|war|sanction|tariff|security|election|border|shipping|maritime|strait|canal)\b/i.test(q)) wantCats.push("geopolitics");
  if (/\b(macro|fx|foreign exchange|inflation|rate|rates|interest|central bank|gdp|cpi|currency|usd|bond|yield|fiscal|trade)\b/i.test(q)) wantCats.push("macro");
  if (/\b(critical mineral|rare earth|lithium|cobalt|nickel|graphite|copper|uranium|tungsten|gallium|germanium|mining|mineral|battery)\b/i.test(q)) wantCats.push("rare_earth");

  const tokens = q.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter(t => t.length >= 3 && !ASK_STOP_WORDS.has(t));

  const hasFilters = countryTerms.length > 0 || corridorTerms.length > 0 || wantCats.length > 0 || tokens.length > 0;
  const scored = homeSignals.map(sig => {
    const geo = String(sig.geography ?? "").toLowerCase();
    const iso3 = String((sig as Record<string, unknown>).country_iso3 ?? "").toLowerCase();
    const hay = [geo, iso3, sig.title, sig.what_changed, sig.why_it_matters].join(" ").toLowerCase();
    let score = 0;
    if (countryTerms.some(t => t === iso3 || geo === t || hay.includes(t))) score += 12;
    if (corridorTerms.some(t => hay.includes(t))) score += 10;
    if (wantCats.includes(sig.category)) score += 6;
    for (const tok of tokens) {
      if (hay.includes(tok)) score += 4;
    }
    return { sig, score };
  });

  const filtered = (hasFilters ? scored.filter(x => x.score > 0) : scored)
    .sort((a, b) => b.score - a.score || String(b.sig.published_at).localeCompare(String(a.sig.published_at)))
    .slice(0, 5);

  if (!filtered.length) return null;
  const top = filtered.map(x => x.sig);
  const latestAt = top.map(x => String(x.published_at)).sort().at(-1) ?? new Date().toISOString();
  const scopeLabel = countries.map(c => c.name).join(" and ");
  const scopeCopy = scopeLabel ? " for " + scopeLabel : "";

  return {
    summary: "Based on " + top.length + " recent GeoMacro intelligence brief" + (top.length === 1 ? "" : "s") + scopeCopy + " (latest: " + latestAt + "): " + top[0].title + ".",
    what_changed: top.map(x => "[" + String(x.published_at).slice(0, 16).replace("T", " ") + " UTC] " + x.what_changed).join(" "),
    why_it_matters: top.slice(0, 3).map(x => x.why_it_matters).join(" "),
    geomacro_view: "Grounded in GeoMacro live website intelligence briefs. These observations are not independently corroborated or signed as a Risk Gate. Decision support only. This answer is not execution authorization.",
    evidence: filtered.map(({ sig, score }) => ({
      eventId: "live:intelligence:" + sig.id,
      title: sig.title + " (" + sig.published_at + ")",
      relevance: Math.min(100, 60 + score * 3),
    })),
    insufficient_evidence: false,
    mean_relevance: null,
    low_confidence: true,
    gri: null,
    generatedAt: new Date().toISOString(),
    latest_original_published_at: latestAt,
    data_mode: "ephemeral_live",
    cache_status: "hit",
    source_identity_exposed: false,
    durable_live_storage_write: false,
    real_time_message: "Grounded in live website intelligence archive.",
    intelligence_tier: "website_intelligence_brief",
    signed_gro_generated: false,
    independent_same_event_verification: false,
    execution_authorized: false,
    decision_support_boundary: "Decision support only. This answer is not execution authorization or a signed Risk Gate.",
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
  const newsRequest=selectOfficialNewsRequest(question);
  if (newsRequest) {
    const officialAns = (await boundedAskAdapter("official_news",()=>officialUnscoredReleaseAnswer(question),5_500)
      .catch(()=>null));
    if (officialAns && !officialAns.insufficient_evidence) return officialAns;
    const briefAns = await boundedAskAdapter("website_briefs",()=>websiteIntelligenceBriefAnswer(question),4_000).catch(()=>null);
    if (briefAns) return briefAns;
    return officialAns ?? noCurrentPublisherNewsAnswer(newsRequest.scopeLabel);
  }

  // These readers are independent. Start them together and bound each one so
  // a stalled original feed or adapter cannot consume the 14-second request cap.
  const [originalResult,derivedResult,indexedResult]=await Promise.allSettled([
    boundedAskAdapter("current_originals",()=>answerFromCurrentOriginals(question),5_500),
    boundedAskAdapter("derived_intelligence",()=>answerHybridQuestion(question),6_000),
    boundedAskAdapter("indexed_discovery",()=>realtimeSearchAnswer(question,
      noCurrentPublisherNewsAnswer(),{deterministicOnly:true,allowBrowserFallback:false}),6_000),
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
  if (candidates[0] && !candidates[0].insufficient_evidence) return candidates[0];
  const briefFallback = await boundedAskAdapter("website_briefs",()=>websiteIntelligenceBriefAnswer(question),4_000).catch(()=>null);
  if (briefFallback) return briefFallback;
  return candidates[0]??noCurrentPublisherNewsAnswer();
}

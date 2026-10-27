import {isSafeMonitoredFeedCredit} from "../../scripts/lib/derived-news-readback-policy.mjs";
import {macroEventContext} from "../../scripts/lib/macro-fx-metals.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import type {StatelessIntelligenceSignal,StatelessCategory} from "./stateless-intelligence-model";

/**
 * One deterministic, source-neutral news -> structural observation projection.
 * Inputs are ONLY existing first-party, already-derived D1 news signals, not
 * article titles or raw feeds. No scoring, commercial admission or signing.
 */
export const NEWS_STRUCTURAL_SCHEMA = "geomacro.derived-news-structural.v1" as const;
const HOURS_72=72*60*60_000;
const CATEGORIES:readonly StatelessCategory[]=["geopolitics","macro","rare_earth"];
const EVENT_FAMILIES:Record<StatelessCategory,string>={
  geopolitics:"geopolitical_development",
  macro:"macro_fx_development",
  rare_earth:"critical_minerals_development",
};
// Known first-party labels emitted by the bounded official collectors. This
// preserves attribution for private factual research; it is NOT a source
// licence, commercial rights certification or permission to reproduce articles.
const RESEARCH_SOURCE_CREDITS=new Set<string>([
  "Contains public sector information licensed under the Open Government Licence v3.0.",
  "Statistics Canada",
  "Natural Resources Canada",
  "Global Affairs Canada",
  "Eurostat",
  "U.S. Energy Information Administration",
  "Bank for International Settlements",
  "Federal Reserve Board",
  "European Central Bank",
  "European Commission",
  "Bank of Japan",
  "Bank of England",
  "Swiss National Bank",
  "Reserve Bank of India",
  "World Gold Council",
  "LBMA",
  "Commodity Futures Trading Commission",
  "CME Group",
  "The Silver Institute",
  "Bank of Canada",
  "New Zealand Government (Beehive)",
  "WTO news",
  "United Nations Office at Geneva",
  "United Nations",
  "UN News",
  "Province of British Columbia",
  "U.S. Department of Energy",
  "U.S. Department of Energy; first-party U.S. government original; external materials still require individual rights review.",
  "International Energy Agency",
  "© European Union, 2026. Source attribution required."
]);
export type DerivedNewsStructural={
  macro_context?:ReturnType<typeof macroEventContext>;
  schema:typeof NEWS_STRUCTURAL_SCHEMA;
  sources_credited?:readonly string[];
  attribution_required?:true;
  attribution_notices?:readonly string[];
  id:string;category:StatelessCategory;
  event_family:string;development_type:string;topic:string;
  original_published_at:string;date_precision:"day"|"exact";
  geography_mentioned:string|null;
  headline:string;observed_change:string;potential_relevance:string;
  confidence_state:"OFFICIAL_RELEASE_OBSERVED_UNSCORED"|
    "DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED"|"MONITORED_SOURCE_REPORT_UNVERIFIED";
  topical_match_verified:boolean;
  qualifying_topic_release_verified:boolean;
  further_validation_required:true;
  event_detail_verified:false;country_subject_verified:false;
  independent_same_event_verified:false;commercial_derived_rights_verified:false;
  signed_product_verified:false;numeric_impact_established:false;
  raw_upstream_delivered:false;chargeable:false;payable:false;
};
export function buildDerivedNewsStructural(
  signals:readonly StatelessIntelligenceSignal[],now=Date.now(),
  projection:"source_neutral"|"attributed_research"="source_neutral",
):DerivedNewsStructural[]{
  if(!Number.isFinite(now)||!Array.isArray(signals)||signals.length>600||
     !["source_neutral","attributed_research"].includes(projection))
    throw Error("DERIVED_NEWS_STRUCTURAL_INPUT_INVALID");
  const seen=new Map<string,string>();
  const rows:DerivedNewsStructural[]=[];
  for(const signal of signals){
    if(!CATEGORIES.includes(signal.category)||
       !verifyDerivedStory(signal,now))continue;
    const at=Date.parse(signal.published_at);
    if(!Number.isFinite(at)||at>now||at<now-HOURS_72)continue;
    // The source-neutral view cannot fulfill required attribution. Only the
    // authenticated research projection carries known source notices visibly.
    if(signal.sources_credited.length!==0 &&
       (projection!=="attributed_research" ||
        !signal.sources_credited.every(c=>RESEARCH_SOURCE_CREDITS.has(c)||(signal.status==="osint_feed_observed_unverified"&&isSafeMonitoredFeedCredit(c)))))continue;
    const canonical=JSON.stringify(signal);
    const previous=seen.get(signal.id);
    if(previous!==undefined){
      if(previous!==canonical)throw Error("DERIVED_NEWS_ID_COLLISION");
      continue;
    }
    seen.set(signal.id,canonical);
    const monitored=signal.status==="osint_feed_observed_unverified";
    const candidateOnly=signal.status==="official_feed_candidate_unscored";
    rows.push(Object.freeze({
      schema:NEWS_STRUCTURAL_SCHEMA,id:signal.id,category:signal.category,
      ...(signal.sources_credited.length?{
        sources_credited:Object.freeze([...signal.sources_credited]),attribution_required:true as const,
        attribution_notices:Object.freeze(signal.sources_credited.map(c=>c==="Statistics Canada"?
          "Adapted from Statistics Canada, The Daily, "+signal.published_at.slice(0,10)+
          ". This does not constitute an endorsement by Statistics Canada of this product.":
          c==="Contains public sector information licensed under the Open Government Licence v3.0."?
          c+" https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/":c)),
      }:{}),
      ...(projection==="attributed_research"&&macroEventContext(signal)?{macro_context:macroEventContext(signal)}:{}),
      event_family:EVENT_FAMILIES[signal.category],
      development_type:signal.development_type,topic:signal.topic,
      original_published_at:signal.published_at,date_precision:signal.date_precision,
      geography_mentioned:signal.geography,
      headline:monitored?"Monitored "+signal.topic+" report observed":candidateOnly?"Official-source candidate; relevance not verified":
        "Official "+signal.topic+" release observed",
      // Already Geomacro-authored bounded derived prose, NOT upstream text.
      observed_change:signal.what_changed,
      potential_relevance:signal.why_it_matters,
      confidence_state:monitored?"MONITORED_SOURCE_REPORT_UNVERIFIED":candidateOnly?
        "DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED":
        "OFFICIAL_RELEASE_OBSERVED_UNSCORED",
      topical_match_verified:!candidateOnly,
      qualifying_topic_release_verified:!candidateOnly&&!monitored,
      further_validation_required:true,
      event_detail_verified:false,country_subject_verified:false,
      independent_same_event_verified:false,
      commercial_derived_rights_verified:false,signed_product_verified:false,
      numeric_impact_established:false,raw_upstream_delivered:false,
      chargeable:false,payable:false,
    }));
  }
  return rows.sort((a,b)=>b.original_published_at.localeCompare(a.original_published_at)||
    a.id.localeCompare(b.id));
}

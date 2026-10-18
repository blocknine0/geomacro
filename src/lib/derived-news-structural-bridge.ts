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
export type DerivedNewsStructural={
  schema:typeof NEWS_STRUCTURAL_SCHEMA;
  id:string;category:StatelessCategory;
  event_family:string;development_type:string;topic:string;
  original_published_at:string;date_precision:"day"|"exact";
  geography_mentioned:string|null;
  headline:string;observed_change:string;potential_relevance:string;
  confidence_state:"OFFICIAL_RELEASE_OBSERVED_UNSCORED";
  event_detail_verified:false;country_subject_verified:false;
  independent_same_event_verified:false;commercial_derived_rights_verified:false;
  signed_product_verified:false;numeric_impact_established:false;
  raw_upstream_delivered:false;chargeable:false;payable:false;
};
export function buildDerivedNewsStructural(
  signals:readonly StatelessIntelligenceSignal[],now=Date.now(),
):DerivedNewsStructural[]{
  if(!Number.isFinite(now)||!Array.isArray(signals)||signals.length>600)
    throw Error("DERIVED_NEWS_STRUCTURAL_INPUT_INVALID");
  const seen=new Map<string,string>();
  const rows:DerivedNewsStructural[]=[];
  for(const signal of signals){
    if(!CATEGORIES.includes(signal.category)||
       !verifyDerivedStory(signal,now))continue;
    const at=Date.parse(signal.published_at);
    if(!Number.isFinite(at)||at>now||at<now-HOURS_72)continue;
    // Source credit in a hidden-source commercial/free API cannot fulfill an
    // attribution obligation. Keep that event in the private intake only.
    if(signal.sources_credited.length!==0)continue;
    const canonical=JSON.stringify(signal);
    const previous=seen.get(signal.id);
    if(previous!==undefined){
      if(previous!==canonical)throw Error("DERIVED_NEWS_ID_COLLISION");
      continue;
    }
    seen.set(signal.id,canonical);
    rows.push(Object.freeze({
      schema:NEWS_STRUCTURAL_SCHEMA,id:signal.id,category:signal.category,
      event_family:EVENT_FAMILIES[signal.category],
      development_type:signal.development_type,topic:signal.topic,
      original_published_at:signal.published_at,date_precision:signal.date_precision,
      geography_mentioned:signal.geography,
      headline:"Official "+signal.topic+" release observed",
      // Already Geomacro-authored bounded derived prose, NOT upstream text.
      observed_change:signal.what_changed,
      potential_relevance:signal.why_it_matters,
      confidence_state:"OFFICIAL_RELEASE_OBSERVED_UNSCORED",
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

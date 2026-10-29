#!/usr/bin/env node
/**
 * Ukraine presidential original-news RSS: bounded, source-only observation.
 * Exactly one pinned first-party GET; no headline/body/URL export, no paid
 * evidence, country-event attribution, risk score, D1/B2 or partner writes.
 */
import { collectRegisteredReusableNews } from "../lib/registered-reusable-news-source-collector.mjs";

export const UKR_PRESIDENT_ORIGINAL_RSS =
  "https://www.president.gov.ua/en/rss/news/all.rss";
const SOURCE_ID = "ukr_president_original_government_news_rss";
const registry=Object.freeze([Object.freeze({
  id:SOURCE_ID,url:UKR_PRESIDENT_ORIGINAL_RSS,
  categories:["geopolitics"],type:"rss",supported:true,
  priority:false,officialDocument:false,
})]);
const normalize = ({category,published_at})=>({
  schema:"geomacro.reusable-news-json.v1",
  category,country_iso3:null,
  source:{publisher_name:null,original_url:null,original_published_at:published_at},
  usage_rights:{commercial_reuse_authorized:false},
  delivery:{raw_article_included:false},
});
export async function probeUkrainePresidentialRss({now=new Date(),fetchImpl=fetch}={}) {
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("UKR_OFFICIAL_RSS_CLOCK_INVALID");
  const receipt={
    schema:"geomacro.ukraine-first-party-geopolitics-rss-observer.v1",
    checked_at:now.toISOString(),publisher_country_iso3:"UKR",
    category:"geopolitics",official_source_family:"UKRAINIAN_PRESIDENT_OFFICIAL_RSS",
    upstream_requests_budget:1,
    original_article_body_stored:false,raw_headlines_logged:false,
    issuer_country_is_event_country:false,independent_event_verification:false,
    commercial_source_rights_approved:false,canonical_paid_module_verified:false,
    signed_gro_or_risk_object_verified:false,payment_authorized:false,
    d1_writes:0,b2_requests:0,predge_modified:false,
  };
  try{
    const result=await collectRegisteredReusableNews({
      now,fetchImpl,registry,normalize,resolveCountry:()=>null,
      networkConcurrency:1,perCategory:1,maxFeedBytes:192*1024,
    });
    if(result.summary.selected_source_endpoints!==1||result.checks.length!==1)
      throw Error("UKR_OFFICIAL_SOURCE_SCOPE_INVALID");
    const state=result.checks[0].state;
    const observed=result.items.filter(x=>x.category==="geopolitics"&&
      x.source?.original_published_at&&x.country_iso3===null);
    const latest=observed.map(x=>x.source.original_published_at).sort().at(-1)??null;
    return {...receipt,
      status:state,
      native_dated_geopolitical_keyword_discovery_candidates:observed.length,
      latest_issuer_item_native_publication_clock:latest,
      country_event_attribution_verification:false,
      // A source with no risk-keyword match may still carry valid government
      // news. No relevant event is invented for that condition.
      candidate_is_not_paid_intelligence:true,
    };
  }catch{
    return {...receipt,status:"UNAVAILABLE",
      native_dated_geopolitical_keyword_discovery_candidates:0,
      latest_issuer_item_native_publication_clock:null,
      country_event_attribution_verification:false,
      candidate_is_not_paid_intelligence:true,
    };
  }
}
if(process.argv[1]?.endsWith("/probe-ukraine-presidential-rss-original.mjs")){
  const result=await probeUkrainePresidentialRss();
  process.stdout.write(JSON.stringify(result)+"\n");
}

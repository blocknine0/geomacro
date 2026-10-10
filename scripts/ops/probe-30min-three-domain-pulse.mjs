#!/usr/bin/env node
/**
 * Best-effort 30-minute original publisher intake, three domains in parallel.
 * This is a real transport/date observation, NOT a signed commercial event.
 * Probe one independent original publisher per domain, with one failover
 * publisher on transport failure. Never bypass 401/403/429 or publisher rights.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
  EXPANDED_OFFICIAL_SOURCES, probeExpandedSource,
} from "./probe-expanded-official-source-mesh.mjs";
import {classifyPrivateOriginalCandidateDuplicates} from "../lib/private-original-publisher-candidates.mjs";

const INTERVAL_MS=30*60*1000;
export const THIRTY_MIN_PUBLISHER_PAIRS=Object.freeze({
  geopolitics:Object.freeze([
    "un_news_security_original_rss_review",
    "uk_fcdo_original_foreign_policy_atom_review",
  ]),
  macro:Object.freeze([
    "fed_monetary_original_press_rss_review",
    "statcan_prices_original_atom_review",
  ]),
  rare_earth:Object.freeze([
    "nrcan_government_news_original_atom_review",
    "usgs_minerals_original_news_rss_review",
    "australia_industry_minister_original_rss_review",
  ]),
});
const DOMAINS=Object.keys(THIRTY_MIN_PUBLISHER_PAIRS);
const lookup=Object.fromEntries(EXPANDED_OFFICIAL_SOURCES.map(s=>[s.id,s]));

export function select30MinPublishers(now=new Date()) {
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("30M_MONITOR_INVALID_CLOCK");
  const slot=Math.floor(now.getTime()/INTERVAL_MS);
  return Object.fromEntries(DOMAINS.map(domain=>{
    const pair=THIRTY_MIN_PUBLISHER_PAIRS[domain];
    if(![2,3].includes(pair.length)||
       pair.some(id=>lookup[id]?.domain!==domain||!lookup[id]?.original_hosts?.length)||
       new Set(pair).size!==pair.length)
      throw Error("30M_MONITOR_PUBLISHER_PAIR_INVALID");
    // Two sources per 30m window. A third independent minerals publisher
    // rotates into the pair, rather than tripling per-run origin GET traffic.
    const idx=slot%pair.length;
    return [domain,[lookup[pair[idx]],lookup[pair[(idx+1)%pair.length]]];
  }));
}
function safeInt(x) {return Number.isSafeInteger(x)&&x>=0?x:null}
export async function probe30MinThreeDomainPulse({now=new Date(),probe=probeExpandedSource}={}) {
  const pairs=select30MinPublishers(now);
  const slot=Math.floor(now.getTime()/INTERVAL_MS);
  const rows=await Promise.all(DOMAINS.map(async domain=>{
    const [primary,standby]=pairs[domain];
    const attempted=[];
    async function observe(source){
      attempted.push(source.id);
      // Source-specific transport failure is an unknown, not zero news.
      try { return await probe(source,{now,collectPrivateCandidates:true}); }
      catch { return {source_id:source.id,domain,format_valid:false,primary_http_status:null}; }
    }
    const valid=(result,source)=>result?.format_valid===true &&
      result?.publisher_reachable===true && result?.domain===domain &&
      result?.source_id===source.id &&
      [result.original_publisher_topical_30m,
       result.original_publisher_topical_90m,
       result.original_publisher_topical_6h].every(x=>safeInt(x)!==null) &&
      result.original_publisher_topical_30m<=result.original_publisher_topical_90m &&
      result.original_publisher_topical_90m<=result.original_publisher_topical_6h;
    const first=await observe(primary);
    const firstValid=valid(first,primary);
    let second=null,secondValid=false;
    // Previously a healthy publisher with 0 articles suppressed inspection
    // of an entirely different original publisher until the next hour.
    // Check that publisher in the SAME 30m window for better discovery.
    // Do not re-route access-denied or throttled upstream (401/403/429).
    if((firstValid && first.original_publisher_topical_30m===0) ||
       (!firstValid && ![401,403,429].includes(first.primary_http_status))) {
      second=await observe(standby);
      secondValid=valid(second,standby);
    }
    const observed=[...(firstValid?[first]:[]),...(secondValid?[second]:[])];
    const healthy=observed.length>0;
    const count=healthy?observed.reduce((n,x)=>n+x.original_publisher_topical_30m,0):null;
    const ninety=healthy?observed.reduce((n,x)=>n+x.original_publisher_topical_90m,0):null;
    const sixh=healthy?observed.reduce((n,x)=>n+x.original_publisher_topical_6h,0):null;
    const complete=firstValid&&secondValid;
    if(healthy && (!Number.isSafeInteger(count) || !Number.isSafeInteger(ninety) ||
       !Number.isSafeInteger(sixh) || count>1000 || ninety>1000 || sixh>1000))
      throw Error("30M_MONITOR_AGGREGATE_INVALID");
    return {
      domain,
      status:healthy?"ORIGINAL_PUBLISHER_DATE_OBSERVED":"SOURCE_TRANSPORT_DEGRADED",
      original_publisher_id:healthy?observed[0].source_id:null,
      primary_publisher_id:primary.id,
      publisher_failover_attempted:attempted.length===2&&!firstValid,
      publisher_zero_result_expansion_attempted:attempted.length===2&&firstValid,
      original_publishers_attempted:attempted.length,
      original_publishers_successful:observed.length,
      publisher_pair_sample_complete:complete,
      // Counts refer to originating publisher ITEMS, never de-duplicated
      // same-event intelligence. Do not promote counts to news or GRO.
      original_publisher_30m_topic_count:count,
      original_publisher_90m_topic_count:ninety,
      original_publisher_6h_topic_count:sixh,
      no_new_30m_original_topic_item_observed:healthy&&complete&&count===0,
      checked_at:now.toISOString(),
      // Private hashed article identities; never the raw news or a GRO.
      private_original_article_candidates:observed.flatMap(r=>r.private_original_article_candidates??[]).slice(0,80),
      event_same_subject_independent_corroboration_verified:false,
      commercial_rights_verified:false,
      signed_current_gro_verified:false,
      chargeable_intelligence_ready:false,
    };
  }));
  const status=rows.every(row=>row.status==="ORIGINAL_PUBLISHER_DATE_OBSERVED")
    ?"THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED":"THREE_DOMAIN_SOURCE_TRANSPORT_DEGRADED";
  const candidates=rows.flatMap(row=>row.private_original_article_candidates);
  if(candidates.length>240) throw Error("PRIVATE_ORIGINAL_CANDIDATE_BURST_INVALID");
  const privateCandidateDedup=classifyPrivateOriginalCandidateDuplicates(candidates);
  return {
    schema:"geomacro.private-three-domain-source-pulse-30m.v1",
    observed_at:now.toISOString(),
    target_poll_minutes:30,
    schedule_guaranteed:false,
    utc_slot_start:new Date(slot*INTERVAL_MS).toISOString(),
    status,
    source_domains_observed:DOMAINS,
    actual_original_publisher_rows:rows,
    private_original_candidate_dedup:privateCandidateDedup,
    source_catalog_entries_are_not_events:true,
    independently_verified_current_intelligence_count:0,
    user_api_delivery_verified:false,
    publisher_rights_verified:false,
    b2_reads:0,b2_writes:0,d1_writes:0,supabase_requests:0,
    payments_performed:0,
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const result=await probe30MinThreeDomainPulse();
    mkdirSync("artifacts/private-intake",{recursive:true});
    writeFileSync("artifacts/private-intake/three-domain-30m-source-pulse.json",
      JSON.stringify(result,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(result));
    if(result.status!=="THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED")
      process.exitCode=3;
  }catch{
    console.error("::error::THREE_DOMAIN_30M_SOURCE_PULSE_INTERNAL_FAILURE");
    process.exitCode=2;
  }
}

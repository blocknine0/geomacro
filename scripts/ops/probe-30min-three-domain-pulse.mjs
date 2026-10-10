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
  ]),
});
const DOMAINS=Object.keys(THIRTY_MIN_PUBLISHER_PAIRS);
const lookup=Object.fromEntries(EXPANDED_OFFICIAL_SOURCES.map(s=>[s.id,s]));

export function select30MinPublishers(now=new Date()) {
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("30M_MONITOR_INVALID_CLOCK");
  const slot=Math.floor(now.getTime()/INTERVAL_MS);
  return Object.fromEntries(DOMAINS.map(domain=>{
    const pair=THIRTY_MIN_PUBLISHER_PAIRS[domain];
    if(pair.length!==2||pair.some(id=>lookup[id]?.domain!==domain||!lookup[id]?.original_hosts?.length))
      throw Error("30M_MONITOR_PUBLISHER_PAIR_INVALID");
    const idx=slot%2;
    return [domain,[lookup[pair[idx]],lookup[pair[1-idx]]]];
  }));
}
function safeInt(x) {return Number.isSafeInteger(x)&&x>=0?x:null}
export async function probe30MinThreeDomainPulse({now=new Date(),probe=probeExpandedSource}={}) {
  const pairs=select30MinPublishers(now);
  const slot=Math.floor(now.getTime()/INTERVAL_MS);
  const rows=await Promise.all(DOMAINS.map(async domain=>{
    const [primary,standby]=pairs[domain];
    let result=await probe(primary,{now});
    let failoverUsed=false;
    // Do not repeatedly probe rate-limited, auth-denied or blocked publishers.
    if(!result.format_valid && ![401,403,429].includes(result.primary_http_status)) {
      result=await probe(standby,{now});
      failoverUsed=true;
    }
    const valid=result?.format_valid===true &&
      result?.publisher_reachable===true &&
      result?.domain===domain &&
      (result?.source_id===primary.id||result?.source_id===standby.id);
    const count=valid?safeInt(result?.original_publisher_topical_30m):null;
    const ninety=valid?safeInt(result?.original_publisher_topical_90m):null;
    const sixh=valid?safeInt(result?.original_publisher_topical_6h):null;
    const healthy=valid&&count!==null&&ninety!==null&&sixh!==null&&
      count<=ninety&&ninety<=sixh;
    return {
      domain,
      status:healthy?"ORIGINAL_PUBLISHER_DATE_OBSERVED":"SOURCE_TRANSPORT_DEGRADED",
      original_publisher_id:healthy?result.source_id:null,
      primary_publisher_id:primary.id,
      publisher_failover_attempted:failoverUsed,
      original_publisher_30m_topic_count:healthy?count:null,
      original_publisher_90m_topic_count:healthy?ninety:null,
      original_publisher_6h_topic_count:healthy?sixh:null,
      no_new_30m_original_topic_item_observed:healthy&&count===0,
      checked_at:now.toISOString(),
      // Original 30m count is a discovery observation, not event intelligence.
      event_same_subject_independent_corroboration_verified:false,
      commercial_rights_verified:false,
      signed_current_gro_verified:false,
      chargeable_intelligence_ready:false,
    };
  }));
  const status=rows.every(row=>row.status==="ORIGINAL_PUBLISHER_DATE_OBSERVED")
    ?"THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED":"THREE_DOMAIN_SOURCE_TRANSPORT_DEGRADED";
  return {
    schema:"geomacro.private-three-domain-source-pulse-30m.v1",
    observed_at:now.toISOString(),
    target_poll_minutes:30,
    schedule_guaranteed:false,
    utc_slot_start:new Date(slot*INTERVAL_MS).toISOString(),
    status,
    source_domains_observed:DOMAINS,
    actual_original_publisher_rows:rows,
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

#!/usr/bin/env node
/**
 * #1827: bounded 90-minute source-cadence + three-domain D1 country-MATRIX
 * census. D1 data is aggregated by SQL. No country names, raw articles,
 * titles, URLs, hashes, raw fragments, credentials or risk contents are read.
 *
 * A D1 country_domain_state cell is a readiness METADATA row only; never
 * commercial proof of original published event, verified signed GRO, fresh
 * B2/D1 hot snapshot or a real-time alert for that country.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CATEGORIES=["geopolitics","macro","rare_earth"];
const SCHEDULES=Object.freeze([
  "17 0,3,6,9,12,15,18,21 * * *",
  "47 1,4,7,10,13,16,19,22 * * *",
]);
const ALIASES=Object.freeze({
  geopolitics:"geopolitics",geopolitical:"geopolitics",
  macro:"macro",macro_fx:"macro",
  rare_earth:"rare_earth",critical_minerals:"rare_earth",
});
const DAY=86400000;
const NONNEG=(n,max=100000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const safeIso=(value,now)=> {
  const text=String(value??"");
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/u.test(text))
    return null;
  const time=Date.parse(text);
  return Number.isFinite(time)&&time<=now+5*60000&&time>=0?time:null;
};

// Recompute the exact most recent expected UTC cron slot. Schedules run
// through the UTC day; never use a process start timestamp as publisher time.
export function latestScheduledSlot(nowMs) {
  if(!Number.isFinite(nowMs))throw Error("CADENCE_TIME_INVALID");
  const time=new Date(nowMs);
  time.setUTCSeconds(0,0);
  const today=Date.UTC(time.getUTCFullYear(),time.getUTCMonth(),time.getUTCDate());
  const slots=[];
  for(const offset of [-DAY,0]){
    for(const hour of [0,3,6,9,12,15,18,21])
      slots.push(today+offset+(hour*60+17)*60000);
    for(const hour of [1,4,7,10,13,16,19,22])
      slots.push(today+offset+(hour*60+47)*60000);
  }
  return Math.max(...slots.filter(t=>t<=nowMs));
}
export function assessCadence({nowMs=Date.now(),eventName="unknown",scheduledCron=""}={}){
  if(!Number.isFinite(nowMs))throw Error("CADENCE_TIME_INVALID");
  if(eventName==="schedule"){
    if(!SCHEDULES.includes(scheduledCron)) throw Error("CADENCE_UNKNOWN_CRON");
    const slot=latestScheduledSlot(nowMs);
    const lag=Math.max(0,Math.floor((nowMs-slot)/60000));
    return {cadence:"NINETY_MINUTES_CONFIGURED",schedule_utc:"UTC",
      expected_slot:new Date(slot).toISOString(),
      start_lag_minutes:lag,scheduler_late:lag>45,
      exactly_on_time_guaranteed:false};
  }
  if(!["pull_request","push","workflow_dispatch"].includes(eventName))
    throw Error("CADENCE_EVENT_INVALID");
  return {cadence:"ADHOC_NO_RECURRING_INTERVAL_PROOF",schedule_utc:"UTC",
    expected_slot:null,start_lag_minutes:null,scheduler_late:null,
    exactly_on_time_guaranteed:false};
}
export function classifyCountryMatrixAggregate(output,{
  nowMs=Date.now(),eventName="push",scheduledCron="",
}={}) {
  let parsed;
  try{parsed=JSON.parse(String(output));}catch{throw Error("D1_COUNTRY_MATRIX_JSON_INVALID");}
  const blocks=Array.isArray(parsed)?parsed:parsed?.result;
  if(!Array.isArray(blocks)||blocks.length!==1||blocks[0]?.success!==true||
    !Array.isArray(blocks[0]?.results)||blocks[0].results.length>90)
    throw Error("D1_COUNTRY_MATRIX_QUERY_INVALID");
  const matrix=Object.fromEntries(CATEGORIES.map(d=>[d,{
    metadata_country_cells:0,certified_source_cells:0,
    verified_within_90m_metadata_cells:0,latest_verification_at:null,
    projection_rows_healthy:false,readiness_status_counts:{},
  }]));
  const domainSpellings=new Map();
  for(const item of blocks[0].results){
    if(!item||typeof item!=="object"||Array.isArray(item)||
      Object.keys(item).length>7)throw Error("D1_COUNTRY_MATRIX_ROW_INVALID");
    const raw=String(item.domain??"").trim().toLowerCase();
    const domain=ALIASES[raw];
    // Real-world D1 can contain special-area categories. Never re-map them
    // into a claimed 195-country category.
    if(!domain)continue;
    const prior=domainSpellings.get(domain);
    if(prior&&prior!==raw)throw Error("D1_COUNTRY_MATRIX_DOMAIN_ALIAS_AMBIGUOUS");
    domainSpellings.set(domain,raw);
    const status=String(item.readiness_status??"");
    if(!/^[A-Za-z][A-Za-z0-9_ -]{0,49}$/u.test(status))
      throw Error("D1_COUNTRY_MATRIX_STATUS_INVALID");
    const n=Number(item.row_count),cert=Number(item.certified_source_cells),
      recent=Number(item.recent_verified_cells);
    if(!NONNEG(n,1000)||!NONNEG(cert,1000)||!NONNEG(recent,1000)||
      cert>n||recent>n)throw Error("D1_COUNTRY_MATRIX_COUNTER_INVALID");
    const cell=matrix[domain];
    if(Object.hasOwn(cell.readiness_status_counts,status))
      throw Error("D1_COUNTRY_MATRIX_DUPLICATE_GROUP");
    cell.readiness_status_counts[status]=n;
    cell.metadata_country_cells+=n;
    cell.certified_source_cells+=cert;
    cell.verified_within_90m_metadata_cells+=recent;
    const iso=safeIso(item.last_verified_at,nowMs);
    if(iso!==null&&(!cell.latest_verification_at||
       iso>Date.parse(cell.latest_verification_at)))
      cell.latest_verification_at=new Date(iso).toISOString();
  }
  for(const domain of CATEGORIES){
    const cell=matrix[domain];
    cell.projection_rows_healthy=cell.metadata_country_cells>=195 &&
      cell.metadata_country_cells<=250;
    // Even a full D1 state matrix cannot authenticate events from news.
  }
  return {
    schema:"geomacro.three-domain-90min-readonly-country-census.v1",
    observed_at:new Date(nowMs).toISOString(),
    ...assessCadence({nowMs,eventName,scheduledCron}),
    target_country_floor:195,target_country_domain_cells:585,
    required_categories:CATEGORIES,
    coverage_matrix:matrix,
    metadata_matrix_floor_met:CATEGORIES.every(d=>matrix[d].projection_rows_healthy),
    current_verified_195x3_risk_intelligence:false,
    all_new_global_developments_detected:false,
    freshness_of_each_country_risk_verified:false,
    rights_corroboration_and_signed_gro_verified:false,
    paid_coverage_accepted:false,
    customer_raw_news_exported:false,customer_source_urls_exported:false,
    private_original_provenance_retained_only_for_audit:true,
    d1_read_only:true,d1_writes:0,b2_requests:0,supabase_reads:0,
    supabase_writes:0,model_calls:0,payment_performed:false,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let raw="";
  try{
    for await (const chunk of process.stdin){
      raw+=chunk.toString("utf8");
      if(raw.length>128*1024)throw Error("D1_COUNTRY_MATRIX_OUTPUT_OVERSIZE");
    }
    const result=classifyCountryMatrixAggregate(raw,{
      eventName:process.env.GITHUB_EVENT_NAME??"workflow_dispatch",
      scheduledCron:process.env.GEOMACRO_EXPECTED_CRON??"",
    });
    mkdirSync("artifacts/expanded-official-source",{recursive:true});
    writeFileSync("artifacts/expanded-official-source/90min-country-census.json",
      JSON.stringify(result,null,2)+"\n",{mode:0o600});
    // only whitelisted aggregate; never the unfiltered remote SQL output.
    console.log(JSON.stringify(result));
    if(result.scheduler_late===true||!result.metadata_matrix_floor_met)
      process.exitCode=3;
  }catch{
    console.error("::error::D1_COUNTRY_MATRIX_AGGREGATED_AUDIT_NOT_VERIFIED");
    process.exitCode=3;
  }
}

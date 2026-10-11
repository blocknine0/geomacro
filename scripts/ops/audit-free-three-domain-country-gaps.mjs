#!/usr/bin/env node
/**
 * #1827 low-cost exact-ISO3 × 3 category D1 *metadata* gap ledger.
 * No news text, publisher URLs, hashes, credentials, B2, Supabase or x402.
 * D1 source metadata is NEVER same-event, signed-GRO or paid-product proof.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const DOMAINS = Object.freeze(["geopolitics","macro","rare_earth"]);
const ALIASES = Object.freeze({
  geopolitics:"geopolitics",geopolitical:"geopolitics",
  macro:"macro",macro_fx:"macro",
  rare_earth:"rare_earth",critical_minerals:"rare_earth",
});
const CLASSIFICATIONS = Object.freeze([
  ["SOVEREIGN_ISO3","SOVEREIGN",194],
  ["TERRITORY_ISO3","TERRITORY",53],
  ["SPECIAL_ENTITY_ISO3","SPECIAL_ENTITY",3],
]);
const ISO=/^[A-Z]{3}$/u;
const MAX_ROWS=800;
const NINETY_MINUTES=90*60000;
const FUTURE_SKEW=5*60000;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/u;
function fail(code){throw Error("FREE_COUNTRY_GAP_"+code);}
function nonneg(n){return Number.isSafeInteger(n)&&n>=0&&n<=1000;}

export function canonicalGeographicDenominator(text){
  if(typeof text!=="string"||text.length>200*1024)fail("CLASSIFICATION_SOURCE_INVALID");
  const result = new Map();
  for(const [marker,classification,expected] of CLASSIFICATIONS){
    const start=text.indexOf("const "+marker+" = new Set([");
    if(start<0 || text.indexOf("const "+marker+" = new Set([",start+1)!==-1)
      fail("CLASSIFICATION_MARKER_INVALID");
    const end=text.indexOf("]);",start);
    if(end<0||end-start>8000)fail("CLASSIFICATION_BLOCK_INVALID");
    const part=text.slice(start,end);
    const iso=[...part.matchAll(/"([A-Z]{3})"/gu)].map(x=>x[1]);
    if(iso.length!==expected||new Set(iso).size!==expected)fail("CLASSIFICATION_COUNT_DRIFT");
    for(const code of iso){
      if(result.has(code))fail("CLASSIFICATION_DUPLICATE_ISO3");
      result.set(code,classification);
    }
  }
  if(result.size!==250)fail("CLASSIFICATION_GLOBAL_DRIFT");
  return result;
}
function originalTime(value,nowMs){
  if(value==null || value==="")return null;
  if(typeof value!=="string" || !TIME.test(value))fail("INVALID_METADATA_TIMESTAMP");
  const ms=Date.parse(value);
  if(!Number.isFinite(ms) || ms>nowMs+FUTURE_SKEW)fail("FUTURE_OR_INVALID_TIMESTAMP");
  return ms;
}

export function auditFreeCountryGaps({
  d1Json,classificationSource,now=new Date(),
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail("CLOCK_INVALID");
  const canon=canonicalGeographicDenominator(classificationSource);
  let parsed;
  try{parsed=typeof d1Json==="string"?JSON.parse(d1Json):d1Json;}catch{fail("D1_JSON_INVALID");}
  const blocks=Array.isArray(parsed)?parsed:parsed?.result;
  if(!Array.isArray(blocks)||blocks.length!==1||blocks[0]?.success!==true||
     !Array.isArray(blocks[0].results)||blocks[0].results.length>MAX_ROWS)
    fail("D1_READBACK_INVALID");
  const provided=new Map();
  for(const raw of blocks[0].results){
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).length>9)
      fail("D1_ROW_INVALID");
    const code=raw.country_code,spell=raw.domain;
    if(typeof code!=="string"||!ISO.test(code)||!canon.has(code)||
       typeof spell!=="string"||!Object.hasOwn(ALIASES,spell))
      fail("D1_COUNTRY_DOMAIN_INVALID");
    const domain=ALIASES[spell],key=code+":"+domain;
    if(provided.has(key))fail("D1_DUPLICATE_DOMAIN");
    const counters=["certified_source_count","review_source_count","unavailable_source_count"]
      .map(field=>Number(raw[field]));
    if(!counters.every(nonneg))fail("D1_COUNTS_INVALID");
    const status=raw.readiness_status;
    if(typeof status!=="string"||!/^[A-Z][A-Z0-9_ -]{0,49}$/u.test(status))
      fail("D1_READINESS_STATUS_INVALID");
    const timestamp=originalTime(raw.last_verified_at,now.getTime());
    provided.set(key,{certified:counters[0],review:counters[1],
      unavailable:counters[2],timestamp,status});
  }
  const classTotals=Object.fromEntries(CLASSIFICATIONS.map(([,c])=>[c,0]));
  const domainCounts=Object.fromEntries(DOMAINS.map(d=>[d,{
    expected_geographies:250,metadata_rows_present:0,
    with_certified_source_metadata:0,recent_verified_metadata_90m:0,
    review_only_or_missing:0,stale_or_missing_timestamp:0,
    missing_metadata_rows:0,
  }]));
  const missing = [];
  for(const [code,classification] of [...canon].sort((a,b)=>a[0].localeCompare(b[0]))){
    classTotals[classification]++;
    for(const domain of DOMAINS){
      const state=provided.get(code+":"+domain);
      const counts=domainCounts[domain];
      let blocker=null;
      if(!state){
        counts.missing_metadata_rows++;
        blocker="NO_COUNTRY_DOMAIN_METADATA";
      }else{
        counts.metadata_rows_present++;
        if(state.certified>0)counts.with_certified_source_metadata++;
        else{
          counts.review_only_or_missing++;
          blocker="NO_CERTIFIED_SOURCE_METADATA";
        }
        const recent=state.timestamp!==null &&
          state.timestamp<=now.getTime() &&
          now.getTime()-state.timestamp<=NINETY_MINUTES;
        if(!recent)counts.stale_or_missing_timestamp++;
        if(recent&&state.certified>0)counts.recent_verified_metadata_90m++;
        if(!blocker&&!recent)blocker="SOURCE_METADATA_NOT_RECENT_90M";
      }
      if(blocker)missing.push({iso3:code,scope:classification,domain,blocker});
    }
  }
  const covered=Object.fromEntries(DOMAINS.map(d=>[d,domainCounts[d].recent_verified_metadata_90m]));
  const allMetadataFloor=DOMAINS.every(d=>domainCounts[d].metadata_rows_present>=195);
  const minMetadata=DOMAINS.every(d=>domainCounts[d].recent_verified_metadata_90m>=195);
  return {
    schema:"geomacro.free-three-domain-geography-gap-ledger.v1",
    observed_at:now.toISOString(),
    geographic_scope:{sovereign:classTotals.SOVEREIGN,territory:classTotals.TERRITORY,
      special_entity:classTotals.SPECIAL_ENTITY,total:canon.size},
    target_country_floor:195,
    target_geography_category_cells:canon.size*DOMAINS.length,
    domains:domainCounts,
    metadata_country_floor_met:allMetadataFloor,
    recent_source_metadata_floor_met:minMetadata,
    missing_or_stale_source_metadata_cells:missing,
    gap_count:missing.length,
    // D1 readiness is not publisher/original article evidence, nor a signed GRO.
    rights_verified_per_country:false,
    independent_same_event_corroboration_per_country:false,
    original_article_native_time_per_country_verified:false,
    current_signed_risk_intelligence_195x3_verified:false,
    x402_global_coverage_chargeable:false,
    recent_metadata_cells_by_domain:covered,
    collection_method:"ONE_READONLY_D1_METADATA_QUERY",
    d1_writes:0,b2_requests:0,supabase_reads:0,
    supabase_writes:0,telegram_requests:0,model_calls:0,
    payment_performed:false,
    note:"ISO3 geography/source metadata gap triage only; catalog and D1 verification timestamps cannot replace native article times, original publisher independence, rights, reviewer signature or signed GRO.",
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    let text="";
    for await(const chunk of process.stdin){
      text+=String(chunk);
      if(text.length>256*1024)fail("D1_INPUT_TOO_LARGE");
    }
    const classificationSource=readFileSync("src/lib/global-entity-classification.ts","utf8");
    const result=auditFreeCountryGaps({d1Json:text,classificationSource});
    mkdirSync("artifacts/free-three-domain-gaps",{recursive:true});
    writeFileSync("artifacts/free-three-domain-gaps/iso3-metadata-gaps.json",
      JSON.stringify(result,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify({
      schema:result.schema, observed_at:result.observed_at,
      geographic_scope:result.geographic_scope,
      domains:result.domains,gap_count:result.gap_count,
      recent_source_metadata_floor_met:result.recent_source_metadata_floor_met,
      current_signed_risk_intelligence_195x3_verified:false,
      d1_writes:0,b2_requests:0,payment_performed:false,
    }));
    // This audit is diagnostic, not a CI source transport check.
    // An incomplete metadata census is visible in the receipt, not fabricated.
  }catch{
    console.error("::error::FREE_THREE_DOMAIN_D1_GAP_AUDIT_INVALID_OR_UNAVAILABLE");
    process.exitCode=3;
  }
}

#!/usr/bin/env node
/**
 * Privacy-preserving *exact* attribution of Cloudflare D1 Query Insights.
 * The provider's raw SQL stays in a runner-local file; never print it or
 * table names. A query is only assigned an exact callsite when its fully
 * canonicalized SQL matches an explicit checked-in statement. Otherwise
 * report TABLE_FAMILY_ONLY/UNATTRIBUTED, never invent a source location.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const sha=q=>createHash("sha256").update(q).digest("hex");
const safe=n=>Number.isSafeInteger(n)&&n>=0;
export const CURRENT_HIGH_READ_FINGERPRINTS=Object.freeze([
  "0764ca64f15d44b662177d17e56e1f5625269b9a61953cad77e6f161ca426514",
  "8cf08019a90c99c6d3561c7182dce14c1cffac3490d60536b6622ab459a48e02"
]);
const normalize=s=>s.toLowerCase().trim().replace(/\s+/gu," ")
  .replace(/\s*([(),=<>])\s*/gu,"$1")
  .replace(/;$/u,"");
const EXACT=Object.freeze([
  {id:"PUBLIC_WEBSITE_DERIVED_PAGE_V1",
   location:"workers/control-plane/src/website-derived-intelligence.mjs:readDerivedStories",
   statement:"SELECT story_json, first_seen_at FROM website_derived_intelligence WHERE published_at>=? AND first_seen_at>=? ORDER BY published_at DESC, id DESC LIMIT 251 OFFSET ?"},
  {id:"PUBLIC_WEBSITE_DERIVED_ONE_BUNDLE_V1",
   location:"workers/control-plane/src/website-derived-intelligence.mjs:readDerivedStoriesBundle",
   statement:"SELECT story_json,first_seen_at FROM website_derived_intelligence WHERE published_at>=? AND first_seen_at>=? ORDER BY published_at DESC,id DESC LIMIT 601"},
  {id:"PRIVATE_OSINT_INDEXED_RING_COMPACTION_V2",
   location:"workers/control-plane/src/private-osint-15m.mjs:privateOsint15mWrite",
   statement:"DELETE FROM private_osint_news_25h WHERE item_id IN (SELECT item_id FROM private_osint_news_25h ORDER BY native_feed_published_at ASC,item_id ASC LIMIT MAX(0,(SELECT item_count FROM private_osint_ring_cardinality_v1 WHERE single=1)-4000))"},
  {id:"PRIVATE_OSINT_RING_COUNT_SCAN_LEGACY_V1",
   location:"workers/control-plane/src/private-osint-15m.mjs:privateOsint15mWrite (pre-0032)",
   statement:"DELETE FROM private_osint_news_25h WHERE item_id IN (SELECT item_id FROM private_osint_news_25h ORDER BY native_feed_published_at ASC,item_id ASC LIMIT MAX(0,(SELECT COUNT(*) FROM private_osint_news_25h)-4000))"},
  {id:"CONTROL_PLANE_D1_HEALTH_V1",
   location:"workers/control-plane/src/index.mjs:health",
   statement:"SELECT version, updated_at FROM schema_meta WHERE name = ?"},
  {id:"PRIVATE_SOURCE_RUNTIME_STATUS_V1",
   location:"workers/control-plane/src/source-runtime-status.mjs:getSourceRuntimeStatus",
   statement:"SELECT metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope=? LIMIT 1"},
  {id:"PUBLIC_SOURCE_PULSE_V1",
   location:"workers/control-plane/src/index.mjs:getPublicThreeDomain30MinSourcePulse",
   statement:"SELECT scope,status,last_attempt_at,metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope IN ('geopolitics','macro','rare_earth') LIMIT 4"},
  {id:"PRIVATE_OSINT_FIND_EXISTING_IDS_V1",
   location:"workers/control-plane/src/private-osint-15m.mjs:handlePrivateOsint15m",
   statement:"SELECT item_id FROM private_osint_news_25h WHERE item_id IN (?)"},
  {id:"COUNTRY_195_SOURCE_GAP_AUDIT_V1",
   location:"workflows/free-three-domain-country-gap-ledger.yml:production-readonly-gap-census",
   statement:"SELECT country_code, lower(domain) AS domain, readiness_status, certified_source_count, review_source_count, unavailable_source_count, last_verified_at FROM country_domain_state ORDER BY country_code,domain LIMIT 801"}
].map(({statement,...entry})=>Object.freeze({...entry,canonical:normalize(statement)})));
const FAMILIES=Object.freeze([
  {needle:"website_derived_intelligence",id:"WEBSITE_DERIVED_JOURNAL"},
  {needle:"private_osint_news_25h",id:"PRIVATE_OSINT_EVENT_JOURNAL"},
  {needle:"private_osint_source_checks_24h",id:"PRIVATE_OSINT_SOURCE_CHECKS"},
  {needle:"pipeline_checkpoint",id:"PIPELINE_CHECKPOINT"},
  {needle:"country_domain_state",id:"COUNTRY_DOMAIN_METADATA"},
  {needle:"reusable_source_news",id:"PUBLIC_REUSABLE_SOURCE_NEWS"},
  {needle:"public_b2_hot_snapshot",id:"B2_HOT_POINTER_METADATA"},
  {needle:"schema_meta",id:"WORKER_SCHEMA_HEALTH"},
  {needle:"private_source_handoff",id:"PRIVATE_SOURCE_HANDOFF"}
]);
function classify(q){
 const canonical=normalize(q);
 const matches=EXACT.filter(x=>x.canonical===canonical);
 if(matches.length===1)return {
   status:"EXACT_SOURCE_STATEMENT",query_id:matches[0].id,
   callsite:matches[0].location
 };
 const tables=FAMILIES.filter(x=>new RegExp("(?<![a-z0-9_])"+x.needle+"(?![a-z0-9_])","u").test(canonical));
 return {status:tables.length===1?"TABLE_FAMILY_ONLY":"UNATTRIBUTED",
   query_id:tables.length===1?tables[0].id:null,callsite:null};
}
export function attributeD1ReadInsights(input,{top=20}={}){
 if(!Array.isArray(input)||input.length<1||input.length>200||!safe(top)||top<1||top>25)
  throw Error("D1_ATTRIBUTION_PROVIDER_SCHEMA_INVALID");
 const hashes=new Set();
 const readings=input.map(row=>{
  if(typeof row?.query!=="string"||row.query.length<1||row.query.length>32000||
     !safe(row.totalRowsRead)||!safe(row.totalRowsWritten)||!safe(row.numberOfTimesRun))
    throw Error("D1_ATTRIBUTION_PROVIDER_SCHEMA_INVALID");
  const fingerprint=sha(row.query);
  if(hashes.has(fingerprint))throw Error("D1_ATTRIBUTION_DUPLICATE_PROVIDER_FINGERPRINT");
  hashes.add(fingerprint);
  const owner=classify(row.query);
  return {query_sha256:fingerprint,...owner,
   total_rows_read:row.totalRowsRead,
   total_rows_written:row.totalRowsWritten,
   executions:row.numberOfTimesRun,
   rows_read_per_execution:row.numberOfTimesRun>0?
     Math.round(row.totalRowsRead/row.numberOfTimesRun):null};
 }).sort((a,b)=>b.total_rows_read-a.total_rows_read||
   a.query_sha256.localeCompare(b.query_sha256)).slice(0,top);
 const known=readings.filter(x=>CURRENT_HIGH_READ_FINGERPRINTS.includes(x.query_sha256));
 return Object.freeze({
  schema:"geomacro.d1-read-hotspot-exact-attribution.v1",
  raw_query_sql_logged:false,raw_sql_exported:false,
  parameters_logged:false,provider_billing_window_not_utc_daily_quota:true,
  query_count_observed:input.length,
  observed_prior_hotspot_fingerprints:known.length,
  old_hotspot_absence_does_not_prove_elimination:true,
  exact_sql_callsite_matches:readings.filter(x=>x.status==="EXACT_SOURCE_STATEMENT").length,
  top_rows_read:readings
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)throw Error("D1_ATTRIBUTION_PROVIDER_FILE_REQUIRED");
  const raw=JSON.parse(readFileSync(process.argv[2],"utf8"));
  const audit=attributeD1ReadInsights(raw);
  console.log(JSON.stringify(audit));
  const top2=audit.top_rows_read.slice(0,2);
  if(top2.some(x=>x.status!=="EXACT_SOURCE_STATEMENT"))
   console.log("::warning::D1_TOP_TWO_EXACT_CALLSITE_NOT_YET_PROVEN; table-family hints must not be called exact SQL attribution");
 }catch{
  console.error("D1_HOT_QUERY_ATTRIBUTION_UNVERIFIED");
  process.exitCode=2;
 }
}

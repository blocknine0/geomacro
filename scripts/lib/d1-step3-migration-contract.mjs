/**
 * Immutable migration review scope for GeoMacro Step 3.
 * Never allow a wildcard migration apply or a table-scan-based cost guess.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
export const STEP3_MAX_EXISTING_ROWS_PER_TABLE=3000;
export const STEP3_MIGRATIONS=Object.freeze([
 Object.freeze({
  id:"0204",file:"workers/control-plane/migrations/0204_d1_read_hotspot_optimization.sql",
  objects:Object.freeze({
   materialized_cache:"table",
   idx_private_osint_country_category_clock_v2:"index",
   idx_private_osint_check_category_status_v2:"index",
   idx_website_derived_hot_order_v2:"index"
  }),
  integrityTables:Object.freeze([
   "private_osint_news_25h","private_osint_source_checks_24h",
   "website_derived_intelligence"]),
  sizeTables:Object.freeze([
   "private_osint_news_25h","private_osint_source_checks_24h",
   "website_derived_intelligence"])
 }),
 Object.freeze({
  id:"0211",file:"workers/control-plane/migrations/0211_p0b_daily_committed_count.sql",
  objects:Object.freeze({
   p0b_committed_day_totals:"table",
   trg_p0b_day_committed_insert:"trigger",
   trg_p0b_day_committed_delete:"trigger",
   trg_p0b_day_committed_clock_change:"trigger"
  }),
  integrityTables:Object.freeze(["p0b_committed_day_totals","ingestion_spool_queue"]),
  sizeTables:Object.freeze(["ingestion_spool_queue"])
 }),
 Object.freeze({
  id:"0212",file:"workers/control-plane/staged-migrations/0212_d1_keyset_hourly_pending_census.sql",
  objects:Object.freeze({
   phase2h_pending_hourly_v1:"table",
   trg_phase2h_hourly_pending_insert_v1:"trigger",
   trg_phase2h_hourly_pending_delete_v1:"trigger",
   trg_phase2h_hourly_pending_ack_v1:"trigger",
   trg_phase2h_hourly_pending_reversal_v1:"trigger",
   trg_phase2h_hourly_first_seen_immutable_v1:"trigger",
   idx_private_osint_country_clock_v3:"index",
   idx_website_derived_category_clock_v3:"index"
  }),
  integrityTables:Object.freeze([
   "phase2h_pending_hourly_v1","phase2h_private_raw_news",
   "private_osint_news_25h","website_derived_intelligence"]),
  sizeTables:Object.freeze(["phase2h_private_raw_news"])
 }),
 Object.freeze({
  id:"0213",file:"workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql",
  objects:Object.freeze({
   phase2h_raw_object_refs_v1:"table",
   idx_phase2h_ref_object_key_v1:"index",
   idx_phase2h_ref_country_category_clock_v1:"index",
   idx_phase2h_ref_ingest_clock_v1:"index"
  }),
  integrityTables:Object.freeze(["phase2h_raw_object_refs_v1"]),
  sizeTables:Object.freeze([])
 })
]);
const safeName=s=>/^[a-z][a-z0-9_]{1,75}$/u.test(s);
const fail=code=>{throw Error("STEP3_MIGRATION_"+code)};
const hash=x=>createHash("sha256").update(x).digest("hex");
export function step3SqlManifests({read=readFileSync}={}){
 return STEP3_MIGRATIONS.map(p=>{
  const sql=read(p.file,"utf8");
  if(typeof sql!=="string"||sql.length<200||sql.length>20000||
     !/^--/u.test(sql))fail("SQL_SOURCE_INVALID");
  return {...p,sql_sha256:hash(sql),filename:p.file.split("/").at(-1)};
 });
}

/** Native D1 history reports names and timestamps, NOT SQL checksums. */
export function step3NativeHistorySQL(){
 return "SELECT id,name,applied_at FROM d1_migrations WHERE "+
  STEP3_MIGRATIONS.map(m=>"name LIKE '"+m.id+"%'").join(" OR ")+
  " ORDER BY id";
}
export function classifyStep3NativeHistory(manifests,rows){
 if(!Array.isArray(manifests)||manifests.length!==4||
    manifests.map(m=>m.id).join(",")!=="0204,0211,0212,0213"||
    manifests.some(m=>typeof m.filename!=="string"||
      m.filename!==m.file.split("/").at(-1))||
    !Array.isArray(rows)||rows.length>4)
  fail("NATIVE_HISTORY_INPUT_INVALID");
 const names=new Map(manifests.map(m=>[m.id,m.filename]));
 const found=new Set();let lastId=0;
 for(const row of rows){
  const prefix=typeof row?.name==="string"?row.name.slice(0,4):"";
  if(!Number.isSafeInteger(row?.id)||row.id<=lastId||
     !names.has(prefix)||row.name!==names.get(prefix)||
     found.has(prefix)||typeof row.applied_at!=="string"||
     !/^20\d\d-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(row.applied_at))
   fail("NATIVE_HISTORY_AMBIGUOUS_OR_CHANGED");
  found.add(prefix);lastId=row.id;
 }
 // This is an ordered-only migration family: a later applied migration
 // with an earlier missing migration is inconsistent, not proof of PASS.
 const firstMissing=manifests.findIndex(m=>!found.has(m.id));
 if(firstMissing!==-1&&manifests.slice(firstMissing).some(m=>found.has(m.id)))
  fail("NATIVE_HISTORY_GAPPED");
 return Object.freeze({
  status:"OBSERVED_NATIVE_NAMES_ONLY_NOT_SQL_CHECKSUM",
  native_applied_ids:manifests.filter(m=>found.has(m.id)).map(m=>m.id),
  pending_ids:manifests.filter(m=>!found.has(m.id)).map(m=>m.id),
  native_history_rows:rows.length,
  sql_checksum_verified:false,
  full_index_or_counter_integrity_verified:false,
  production_release_authorized:false
 });
}

export function step3SizeProbeSQL(tables,cap=STEP3_MAX_EXISTING_ROWS_PER_TABLE){
 if(!Array.isArray(tables)||tables.length===0||
    tables.length>5||tables.some(x=>!safeName(x))||
    !Number.isSafeInteger(cap)||cap<100||cap>3000)
  fail("TABLE_SIZE_SCOPE_INVALID");
 return "SELECT "+tables.map((t,i)=>
  "EXISTS(SELECT 1 FROM "+t+" LIMIT 1 OFFSET "+cap+
  ") AS over_"+i).join(", ");
}
export function validateStep3SizeProbe(tables,results,cap=STEP3_MAX_EXISTING_ROWS_PER_TABLE){
 if(!Array.isArray(results)||results.length!==1)fail("SIZE_PROOF_MISSING");
 const r=results[0];
 for(let i=0;i<tables.length;i++){
  if(!(r["over_"+i]===0||r["over_"+i]===1))
   fail("SIZE_PROOF_INVALID");
  if(r["over_"+i]===1)fail("SOURCE_ROWS_EXCEED_STAGED_INDEX_BUDGET");
 }
 return {status:"PASS",tables,maximum_existing_rows_per_table:cap,
  bounded_ddl_cost_proven_for_this_instant:true};
}

/**
 * A one-time expansion of the reviewed pending 0212 migration budget,
 * never a general override of the 3000-row ordinary DDL ceiling.
 * Each subquery is physically bounded. The grouped UTC-hour preflight
 * is needed because the 0212 counter auditor has a separate bin limit.
 * Provider cost is measured and re-admitted by the protected caller.
 */
export const STEP3_0212_PENDING_SOURCE_CAP=24000;
export function step30212PendingSourcePreflightSQL(){
 const raw="phase2h_private_raw_news";
 const limited=(table,cap,condition="")=>
  "(SELECT COUNT(*) FROM (SELECT 1 FROM "+table+
  condition+" LIMIT "+(cap+1)+"))";
 return "SELECT "+
  limited(raw,STEP3_0212_PENDING_SOURCE_CAP)+
   " AS raw_rows,"+
  limited(raw,STEP3_0212_PENDING_SOURCE_CAP,
   " WHERE b2_object_sha256 IS NULL")+" AS pending_rows,"+
  "(SELECT COUNT(*) FROM (SELECT 1 FROM "+raw+
   " WHERE b2_object_sha256 IS NULL "+
   "GROUP BY category,substr(first_ingested_at,1,13) LIMIT 3001)) AS hour_bins,"+
  limited("private_osint_news_25h",3000)+" AS osint_rows,"+
  limited("website_derived_intelligence",3000)+" AS website_rows";
}
export function validateStep30212PendingSourcePreflight(results){
 if(!Array.isArray(results)||results.length!==1||
    Object.keys(results[0]??{}).sort().join(",")!==
    "hour_bins,osint_rows,pending_rows,raw_rows,website_rows")
  fail("0212_PENDING_SOURCE_PROOF_MISSING");
 const v=results[0];
 if(Object.values(v).some(x=>!Number.isSafeInteger(x)||x<0)||
    v.raw_rows>STEP3_0212_PENDING_SOURCE_CAP||
    v.pending_rows>v.raw_rows||v.hour_bins>3000||
    v.osint_rows>3000||v.website_rows>3000)
  fail("0212_REVIEWED_LARGE_SOURCE_BUDGET_EXCEEDED");
 if((v.pending_rows===0)!==(v.hour_bins===0))
  fail("0212_PENDING_HOUR_BIN_CONTRADICTION");
 // Conservatively budget source seed + two reviewed index builds; this
 // estimate is an admission reservation, NOT a promise of physical billing.
 const estimated_rows_read=100000+v.raw_rows*25+
  v.pending_rows*10+(v.osint_rows+v.website_rows)*15;
 const estimated_rows_written=10000+v.raw_rows*20+
  v.pending_rows*8+(v.osint_rows+v.website_rows)*12;
 if(estimated_rows_read>10000000||estimated_rows_written>500000)
  fail("0212_REVIEWED_MONTHLY_MIGRATION_ESTIMATE_EXCEEDED");
 return Object.freeze({
  status:"PASS_READ_ONLY_BOUNDED_0212_COST_ENVELOPE_NOT_PRODUCTION_APPROVAL",
  source_rows_verified:v.raw_rows,
  original_pending_rows_observed:v.pending_rows,
  canonical_hour_buckets_observed:v.hour_bins,
  existing_osint_rows_verified:v.osint_rows,
  existing_website_rows_verified:v.website_rows,
  estimated_rows_read,estimated_rows_written,
  no_guaranteed_account_wide_hard_cap:true,
  source_index_integrity_verified:false,
  no_sql_writes_performed:true,
  production_release_authorized:false
 });
}

export function step3SchemaSQL(objects){
 const names=Object.keys(objects);
 if(!names.length||names.length>30||names.some(x=>!safeName(x)))
  fail("SCHEMA_OBJECT_LIST_INVALID");
 return "SELECT type,name,sql FROM sqlite_schema WHERE name IN ("+
  names.map(n=>"'"+n+"'").join(",")+") ORDER BY name";
}
export function verifyStep3Schema(objects,rows){
 if(!Array.isArray(rows)||rows.length!==Object.keys(objects).length)
  fail("SCHEMA_OBJECT_COUNT_MISMATCH");
 const names=new Set();
 for(const row of rows){
  if(names.has(row.name)||objects[row.name]!==row.type||
     typeof row.sql!=="string"||row.sql.length<15)
   fail("SCHEMA_OBJECT_TYPE_OR_DEFINITION_INVALID");
  names.add(row.name);
 }
 if(Object.keys(objects).some(n=>!names.has(n)))
  fail("SCHEMA_EXPECTED_OBJECT_MISSING");
 return {status:"PASS",schema_objects_verified:names.size};
}
export function verifyStep3Integrity(results,table){
 if(!safeName(table)||!Array.isArray(results)||
   results.length!==1||Object.keys(results[0]).length!==1||
   Object.values(results[0])[0]!=="ok")
  fail("INDEX_TREE_INTEGRITY_NOT_OK");
 return {table,index_tree_integrity:"PASS"};
}
export function verifyStep3Explain(rows,index){
 if(!safeName(index)||!Array.isArray(rows)||rows.length===0||
    !rows.some(r=>typeof r.detail==="string"&&
      r.detail.includes(index)))
  fail("INDEX_SEARCH_PLAN_NOT_VERIFIED");
 return {index,index_search_plan:"PASS"};
}
export function compareImmutableBaseline(before,after){
 if(typeof before!=="string"||!/^([a-f0-9]{64})$/u.test(before)||
    before!==after)fail("LEGACY_IMMUTABLE_SAMPLE_CHANGED");
 return {status:"PASS",before_sha256:before,unchanged:true};
}

/**
 * Phase2H 0213 is an EXPAND-only schema operation. A table/index existence
 * proof is not a signed original, authenticated R2 byte proof, or B2 archive.
 */
export function classifyStep3ReferenceOnlyAcceptance({
 schemaVerified=false,pointerProof=null,b2Proof=null,legacyWorkerProof=null,
 newWorkerProof=null,checkpoint=null
}={}){
 const valid=schemaVerified===true&&
  pointerProof?.cryptographic_readback_verified===true&&
  Number.isSafeInteger(pointerProof?.verified_count)&&pointerProof.verified_count>0&&
  pointerProof.status==="PASS_REAL_WORKER_HMAC_R2_POINTER_BYTES_ONLY"&&
  b2Proof?.status==="PASS_REAL_B2_BYTE_READBACK"&&
  b2Proof?.provider_verified===true&&
  legacyWorkerProof?.status==="PASS_REAL_SHADOW_WORKER_COMPATIBILITY"&&
  newWorkerProof?.status==="PASS_REAL_SHADOW_WORKER_COMPATIBILITY"&&
  checkpoint?.status==="PASS_REAL_PROVIDER_R2_BYTE_READBACK"&&
  checkpoint?.private_r2_encrypted_readback_verified===true&&
  checkpoint?.signed_manifest_readback_verified===true;
 return Object.freeze({
  status:valid?"PASS":"NOT_YET_VERIFIED",
  pointer_rows_cryptographically_verified:pointerProof?.verified_count??0,
  b2_physical_archive_verified:b2Proof?.provider_verified===true,
  legacy_worker_real_compatibility_verified:
   legacyWorkerProof?.status==="PASS_REAL_SHADOW_WORKER_COMPATIBILITY",
  new_worker_real_compatibility_verified:
   newWorkerProof?.status==="PASS_REAL_SHADOW_WORKER_COMPATIBILITY",
  durable_recovery_verified:checkpoint?.private_r2_encrypted_readback_verified===true,
  schema_presence_alone_is_insufficient:true,
  grant_production_traffic:valid,
 });
}

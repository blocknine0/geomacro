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
/**
 * Cloudflare D1 supports table-scoped PRAGMA quick_check, but that alone does
 * not establish SQLite's full index-content integrity. Every NEW index must
 * separately pass a full bounded table-versus-covering-index keyset parity.
 * Never brand quick_check itself as full B-tree integrity acceptance.
 */
export function verifyStep3D1SupportedQuickCheck(results,table){
 if(!safeName(table)||!Array.isArray(results)||
    results.length!==1||Object.keys(results[0]??{}).length!==1||
    Object.values(results[0])[0]!=="ok")
  fail("D1_SUPPORTED_QUICK_CHECK_NOT_OK");
 return Object.freeze({
  table,d1_supported_quick_check:"PASS",
  full_sqlite_integrity_check_claimed:false,
  all_new_index_keys_still_require_independent_parity:true
 });
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

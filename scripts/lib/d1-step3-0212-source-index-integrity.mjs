/**
 * Complete reviewed phase2h raw-source index proof for Step3 0212.
 * Verifies ALL 7 existing indexes: 5 full covering-index row/key scans and
 * both reviewed exact partial predicates, never a blanket partial waiver.
 * The isolated Shadow can be empty; zero rows are only structural evidence.
 */
import {step3AllIndexDescriptor,verifyStep3AllIndex}
 from "./d1-step3-supported-integrity.mjs";
import {auditStep30212ExactPartialIndex}
 from "./d1-step3-0212-partial-index-integrity.mjs";
import {step3BuildIndexSetSQL,verifyStep3IndexSetResult,
 STEP3_SET_MAX_SOURCE_ROWS}
 from "./d1-step3-large-index-set-proof.mjs";

const TABLE="phase2h_private_raw_news";
const EXPECTED=Object.freeze({
 idx_phase2h_native_category:0,
 idx_phase2h_pending_recent_ingested_category:1,
 idx_phase2h_retention_first_ingested:0,
 idx_phase2h_risk_country_category_clock:0,
 idx_phase2h_risk_country_unindexed_recent:1,
 idx_phase2h_unarchived:0,
 sqlite_autoindex_phase2h_private_raw_news_1:0
});
const fail=s=>{throw Error("STEP3_0212_SOURCE_"+s)};
function read(query,sql,cap){
 const x=query(sql,cap);
 if(!Array.isArray(x)||x.length>cap)fail("BOUNDED_PROVIDER_READ_UNVERIFIED");
 return x;
}
function catalogRows(query){
 const x=read(query,'PRAGMA index_list("phase2h_private_raw_news")',48);
 const observed=x.map(i=>i.name).sort();
 if(x.length!==7||JSON.stringify(observed)!==
   JSON.stringify(Object.keys(EXPECTED).sort())||
   x.some(i=>i.partial!==EXPECTED[i.name]||
     i.unique!==(i.name.startsWith("sqlite_autoindex_")?1:0)||
     i.origin!==(i.name.startsWith("sqlite_autoindex_")?"pk":"c"))||
   new Set(observed).size!==7)
  fail("SEVEN_REVIEWED_FULL_AND_PARTIAL_INDEX_REGISTRY_DRIFT");
 return x;
}

/**
 * Large canonical source: full membership with bounded SQL EXCEPT snapshots.
 * The exact two reviewed partial-index schemas are validated independently;
 * no partial predicate can be silently exempted or treated as signed proof.
 */
function largeSourceAudit(query,oldIndexList){
 const cap=read(query,
  'SELECT COUNT(*) AS n FROM (SELECT 1 FROM "phase2h_private_raw_news" NOT INDEXED LIMIT '+
  (STEP3_SET_MAX_SOURCE_ROWS+1)+')',1);
 if(cap.length!==1||!Number.isSafeInteger(cap[0]?.n)||
    cap[0].n<=3000||cap[0].n>STEP3_SET_MAX_SOURCE_ROWS)
  fail("LARGE_RAW_SOURCE_SIZE_OR_BUDGET_UNVERIFIED");
 const sourceRows=cap[0].n,full=[],partial=[];
 const specs=Object.freeze({
  idx_phase2h_pending_recent_ingested_category:Object.freeze({
   predicate:'"b2_object_sha256" IS NULL',
   columns:["first_ingested_at","category"],
   ddl:/^CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'\x60]?idx_phase2h_pending_recent_ingested_category["'\x60]?\s+ON\s+["'\x60]?phase2h_private_raw_news["'\x60]?\s*\(\s*["'\x60]?first_ingested_at["'\x60]?\s*,\s*["'\x60]?category["'\x60]?\s*\)\s*WHERE\s+["'\x60]?b2_object_sha256["'\x60]?\s+IS\s+NULL\s*;?\s*$/iu
  }),
  idx_phase2h_risk_country_unindexed_recent:Object.freeze({
   predicate:'"risk_country_iso3" IS NULL',
   columns:["first_ingested_at","record_id"],
   ddl:/^CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'\x60]?idx_phase2h_risk_country_unindexed_recent["'\x60]?\s+ON\s+["'\x60]?phase2h_private_raw_news["'\x60]?\s*\(\s*["'\x60]?first_ingested_at["'\x60]?\s*,\s*["'\x60]?record_id["'\x60]?\s*\)\s*WHERE\s+["'\x60]?risk_country_iso3["'\x60]?\s+IS\s+NULL\s*;?\s*$/iu
  })
 });
 for(const idx of oldIndexList){
  const meta=read(query,'PRAGMA index_xinfo("'+idx.name+'")',32);
  const keys=meta.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
  if(keys.length<1||keys.length>16||keys.some((x,i)=>
      x.seqno!==i||!Number.isSafeInteger(x.cid)||x.cid<0||
      typeof x.name!=="string"||
      !/^[a-z_][a-z0-9_]{1,95}$/u.test(x.name)||
      !["BINARY","NOCASE","RTRIM"].includes(x.coll)||
      ![0,1].includes(x.desc)))fail("LARGE_INDEX_XINFO_INVALID");
  const spec=idx.partial===1?specs[idx.name]:null;
  if(idx.partial===1){
   if(!spec||keys.length!==2||
      keys.some((x,i)=>x.name!==spec.columns[i]||x.coll!=="BINARY"||x.desc!==0)||
      idx.unique!==0)fail("LARGE_PARTIAL_INDEX_KEYS_INVALID");
   const ddl=read(query,"SELECT name,type,sql FROM sqlite_schema WHERE "+
     "name='"+idx.name+"' AND type='index' LIMIT 2",2);
   if(ddl.length!==1||ddl[0]?.name!==idx.name||
      ddl[0]?.type!=="index"||
      typeof ddl[0]?.sql!=="string"||
      !spec.ddl.test(ddl[0].sql.replace(/\s+/gu," ").trim()))
    fail("LARGE_PARTIAL_INDEX_DDL_DRIFT");
  }else{
   step3AllIndexDescriptor(TABLE,idx,meta);
  }
  const sql=step3BuildIndexSetSQL({table:TABLE,index:idx.name,
   columns:keys.map(x=>({name:x.name,coll:x.coll})),
   predicate:spec?.predicate??null});
  const plan=read(query,sql.plan,20);
  if(!plan.some(x=>typeof x.detail==="string"&&
      (x.detail.includes("USING INDEX "+idx.name)||
       x.detail.includes("USING COVERING INDEX "+idx.name))))
   fail("LARGE_FORCED_INDEX_PLAN_UNVERIFIED");
  const bounded=read(query,sql.bounded,1);
  if(bounded.length!==1||!Number.isSafeInteger(bounded[0]?.n)||
     bounded[0].n<0||bounded[0].n>STEP3_SET_MAX_SOURCE_ROWS)
   fail("LARGE_INDEX_PREDICATE_SOURCE_CAP_EXCEEDED");
  const count=bounded[0].n;
  // Full and partial cases both use the exact, reviewed predicate. Empty
  // partial indexes are structural only, not invented nonvacuous evidence.
  verifyStep3IndexSetResult(read(query,sql.equality,1),{
   sourceRows:count,minRows:0});
  if(idx.unique===1&&read(query,sql.uniqueness,1).length!==0)
   fail("LARGE_SOURCE_UNIQUE_INDEX_VIOLATION");
  if(spec){
   partial.push({index:idx.name,qualified_rows_verified:count});
  }else{
   if(count!==sourceRows)fail("LARGE_FULL_INDEX_ROW_COUNT_DRIFT");
   full.push({index:idx.name,
    status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY",
    compared_rows:count});
  }
 }
 if(full.length!==5||partial.length!==2)fail("LARGE_SEVEN_INDEX_COUNT_DRIFT");
 const latest=catalogRows(query);
 if(JSON.stringify(latest)!==JSON.stringify(oldIndexList))
  fail("CONCURRENT_LARGE_INDEX_CATALOG_DRIFT");
 const final=read(query,
  'SELECT COUNT(*) AS n FROM (SELECT 1 FROM "phase2h_private_raw_news" NOT INDEXED LIMIT '+
  (STEP3_SET_MAX_SOURCE_ROWS+1)+')',1);
 if(final.length!==1||final[0]?.n!==sourceRows)
  fail("CONCURRENT_LARGE_CANONICAL_SOURCE_COUNT_DRIFT");
 const pending=partial.find(x=>x.index===
  "idx_phase2h_pending_recent_ingested_category")?.qualified_rows_verified??0;
 const country=partial.find(x=>x.index===
  "idx_phase2h_risk_country_unindexed_recent")?.qualified_rows_verified??0;
 const nonvacuous=pending>0&&country>0;
 const partialProof=Object.freeze({
  status:nonvacuous?
   "PASS_D1_0212_BOTH_REVIEWED_PARTIAL_PREDICATE_INDEX_PARITY":
   "OBSERVED_AT_LEAST_ONE_REVIEWED_PARTIAL_INDEX_EMPTY",
  reviewed_partial_index_count:2,
  reviewed_partial_predicate_verified:true,
  unreviewed_partial_indexes_permitted:false,
  qualified_rows_verified:pending,
  secondary_partial_index_proof:{
   index:"idx_phase2h_risk_country_unindexed_recent",
   qualified_rows_verified:country},
  nonvacuous_index_membership_proven:nonvacuous,
  each_partial_index_exhaustive_provider_sqlite_set_comparison:true,
  stage2_authorized:false,canary_promoted:false
 });
 return Object.freeze({
  status:nonvacuous?
   "PASS_0212_ALL_SEVEN_SOURCE_FULL_AND_PARTIAL_INDEX_KEYS":
   "OBSERVED_0212_SOURCE_EMPTY_OR_PARTIAL_PREDICATE_UNPOPULATED",
  index_count:7,full_index_count:5,reviewed_partial_index_count:2,
  raw_source_has_rows:true,full_index_proofs:full,
  two_exact_partial_predicates_observed:true,
  partial_index_proof:partialProof,
  fully_nonvacuous_data_memberships_proven:nonvacuous,
  no_unknown_partial_indexes:true,
  complete_sqlite_file_integrity_claimed:false,
  original_B2_archive_proven_by_this_step:false,
  source_rights_proven_by_this_step:false,
  production_release_authorized:false,canary_promoted:false,
  private_rows_or_digest_exposed:false
 });
}

export function auditStep30212AllRawSourceIndexes(query){
 if(typeof query!=="function")fail("FRESH_PROVIDER_READER_MISSING");
 const presence=read(query,
  'SELECT EXISTS(SELECT 1 FROM "phase2h_private_raw_news" LIMIT 1) AS has_any',1);
 if(presence.length!==1||Object.keys(presence[0]??{}).join()!=="has_any"||
    ![0,1].includes(presence[0].has_any))
  fail("SOURCE_NONEMPTY_STATE_UNVERIFIED");
 const hasData=presence[0].has_any===1;
 const indexList=catalogRows(query);
 const largeProbe=read(query,
  'SELECT COUNT(*) AS n FROM (SELECT 1 FROM "phase2h_private_raw_news" LIMIT 3001)',1);
 if(largeProbe.length!==1||!Number.isSafeInteger(largeProbe[0]?.n)||
    largeProbe[0].n<0||largeProbe[0].n>3001)
  fail("SOURCE_SIZE_PROBE_INVALID");
 if(largeProbe[0].n>3000)return largeSourceAudit(query,indexList);
 const quick=read(query,'PRAGMA quick_check("phase2h_private_raw_news")',2);
 if(quick.length!==1||Object.keys(quick[0]??{}).length!==1||
    Object.values(quick[0])[0]!=="ok")fail("D1_QUICK_CHECK_NOT_OK");
 if(read(query,'PRAGMA foreign_key_check("phase2h_private_raw_news")',1).length!==0)
  fail("D1_FOREIGN_KEYS_UNVERIFIED");
 const partial=auditStep30212ExactPartialIndex(query);
 if(partial.reviewed_partial_index_count!==2||
    partial.reviewed_partial_predicate_verified!==true||
    partial.unreviewed_partial_indexes_permitted!==false||
    !["PASS_D1_0212_BOTH_REVIEWED_PARTIAL_PREDICATE_INDEX_PARITY",
      "OBSERVED_AT_LEAST_ONE_REVIEWED_PARTIAL_INDEX_EMPTY"].includes(partial.status))
  fail("TWO_REVIEWED_PARTIAL_PREDICATES_UNVERIFIED");
 const full=[];
 for(const i of indexList.filter(i=>i.partial===0)){
  const desc=step3AllIndexDescriptor(TABLE,i,read(query,
   'PRAGMA index_xinfo("'+i.name+'")',32));
  const baselinePlan=read(query,desc.baselinePlan,20);
  const indexedPlan=read(query,desc.indexedPlan,20);
  const before=read(query,desc.tableQuery,3001);
  const byIndex=read(query,desc.indexQuery,3001);
  const after=read(query,desc.tableQuery,3001);
  const duplicates=desc.uniqueSQL?read(query,desc.uniqueSQL,1):[];
  if(!hasData){
   if(before.length||byIndex.length||after.length||duplicates.length)
    fail("CONCURRENT_EMPTY_SOURCE_OR_INDEX_POPULATION");
   // Strict DDL/plan checking still applies, but empty index membership is
   // explicitly not counted as nonvacuous parity.
   const name=i.name;
   if(!baselinePlan.some(x=>typeof x.detail==="string"&&
      x.detail.includes("SCAN "+TABLE)&&!x.detail.includes("USING INDEX"))||
      !indexedPlan.some(x=>typeof x.detail==="string"&&
       x.detail.includes("USING COVERING INDEX "+name)))
    fail("EMPTY_SOURCE_REVIEWED_INDEX_PLAN_UNVERIFIED");
   full.push({index:name,status:"OBSERVED_EMPTY_SOURCE_INDEX_STRUCTURE",
     compared_rows:0});
  }else{
   const proof=verifyStep3AllIndex({descriptor:desc,tableBefore:before,
    indexRows:byIndex,tableAfter:after,tablePlan:baselinePlan,
    indexPlan:indexedPlan,uniqueViolations:duplicates});
   if(proof.status!=="PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"||
      proof.rows_compared<1)
    fail("NONEMPTY_SOURCE_FULL_INDEX_PARITY_UNVERIFIED");
   full.push({index:i.name,status:proof.status,
    compared_rows:proof.rows_compared});
  }
 }
 if(full.length!==5)fail("FIVE_REVIEWED_FULL_INDEXES_REQUIRED");
 const again=catalogRows(query);
 if(JSON.stringify(indexList)!==JSON.stringify(again))
  fail("CONCURRENT_SOURCE_INDEX_SCHEMA_DRIFT");
 const finalPresence=read(query,
  'SELECT EXISTS(SELECT 1 FROM "phase2h_private_raw_news" LIMIT 1) AS has_any',1);
 if(finalPresence.length!==1||finalPresence[0]?.has_any!==presence[0].has_any)
  fail("CONCURRENT_SOURCE_NONEMPTY_DRIFT");
 const nonvacuous=hasData&&partial.nonvacuous_index_membership_proven===true;
 return Object.freeze({
  status:nonvacuous?
   "PASS_0212_ALL_SEVEN_SOURCE_FULL_AND_PARTIAL_INDEX_KEYS":
   "OBSERVED_0212_SOURCE_EMPTY_OR_PARTIAL_PREDICATE_UNPOPULATED",
  index_count:7,full_index_count:5,reviewed_partial_index_count:2,
  raw_source_has_rows:hasData,
  full_index_proofs:full,
  two_exact_partial_predicates_observed:true,
  partial_index_proof:partial,
  fully_nonvacuous_data_memberships_proven:nonvacuous,
  no_unknown_partial_indexes:true,
  complete_sqlite_file_integrity_claimed:false,
  original_B2_archive_proven_by_this_step:false,
  source_rights_proven_by_this_step:false,
  production_release_authorized:false,canary_promoted:false,
  private_rows_or_digest_exposed:false
 });
}

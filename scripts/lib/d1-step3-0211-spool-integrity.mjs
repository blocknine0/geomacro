/**
 * Fresh Shadow/production D1-supported proof of 0211's existing source table.
 * 0114/0116 source may legitimately be EMPTY in the isolated Shadow database.
 * In that case exact schema/index/quick/FK observations are structural ONLY;
 * no synthetic original, B2 ACK, signed decision or paid evidence is created.
 */
import {auditStep3AllIndexes} from "./d1-step3-supported-integrity.mjs";
import {auditStep3AllIndexesSet}
 from "./d1-step3-large-index-set-proof.mjs";
const TABLE="ingestion_spool_queue";
export const STEP3_0211_REVIEWED_SPOOL_INDEXES=Object.freeze([
 "idx_p0b_bundle_items",
 "idx_spool_candidate_sha",
 "idx_spool_committed_day",
 "idx_spool_source_id",
 "idx_spool_state_locked",
 "sqlite_autoindex_ingestion_spool_queue_1",
 "sqlite_autoindex_ingestion_spool_queue_2"
]);
const fail=x=>{throw Error("STEP3_0211_SPOOL_"+x)};
function read(q,sql,cap){
 const r=q(sql,cap);
 if(!Array.isArray(r)||r.length>cap)fail("PROVIDER_READ_CAP_OR_RESULT_UNVERIFIED");
 return r;
}
function isEmpty(query){
 const x=read(query,'SELECT EXISTS(SELECT 1 FROM "ingestion_spool_queue" LIMIT 1) AS present',1);
 if(x.length!==1||Object.keys(x[0]??{}).join()!=="present"||
    ![0,1].includes(x[0].present))
  fail("SOURCE_NONEMPTY_STATE_UNVERIFIED");
 return x[0].present===0;
}
function checkIndexNames(rows){
 if(rows.length!==STEP3_0211_REVIEWED_SPOOL_INDEXES.length||
    new Set(rows.map(x=>x?.name)).size!==rows.length||
    STEP3_0211_REVIEWED_SPOOL_INDEXES.some(name=>
     !rows.some(x=>x?.name===name))||
    rows.some(x=>x?.partial!==0||
     !["c","pk","u"].includes(x.origin)||
     x.unique!==(x.name.startsWith("sqlite_autoindex_")?1:0)))
   fail("SEVEN_REVIEWED_INDEX_REGISTRY_DRIFT");
}
export function auditStep30211SpoolSource(query){
 if(typeof query!=="function")fail("PROVIDER_READER_REQUIRED");
 const beforeEmpty=isEmpty(query);
 const indexList=read(query,'PRAGMA index_list("ingestion_spool_queue")',16);
 checkIndexNames(indexList);
 if(!beforeEmpty){
  // A nonempty source requires complete real key/row membership across ALL
  // seven existing indexes; do not substitute schema-only evidence for data.
  // The legacy per-row verifier has a strict 3000-row result cap.
  // For larger live sources use a D1-side complete bidirectional EXCEPT
  // set proof, never a 3000-row sample misrepresented as full integrity.
  const probe=read(query,
   'SELECT COUNT(*) AS n FROM (SELECT 1 FROM "ingestion_spool_queue" LIMIT 3001)',1);
  if(probe.length!==1||!Number.isSafeInteger(probe[0]?.n)||
     probe[0].n<1||probe[0].n>3001)
   fail("LARGE_SOURCE_SIZE_PROBE_UNVERIFIED");
  const proof=probe[0].n>3000?
   auditStep3AllIndexesSet(TABLE,query):
   auditStep3AllIndexes(TABLE,query);
  if(proof.status!=="PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF"||
     proof.total_existing_indexes!==STEP3_0211_REVIEWED_SPOOL_INDEXES.length||
     proof.index_proofs.length!==STEP3_0211_REVIEWED_SPOOL_INDEXES.length||
     STEP3_0211_REVIEWED_SPOOL_INDEXES.some(n=>
      !proof.index_proofs.some(x=>x.index===n&&
       x.status==="PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY"&&
       x.rows_compared>0)))
   fail("NONEMPTY_SOURCE_ALL_INDEX_PARITY_UNVERIFIED");
  return Object.freeze({
   status:"PASS_0211_NONEMPTY_SPOOL_ALL_SEVEN_INDEX_KEYS",
   index_count:7,nonempty_source:true,
   source_rows_verified:proof.index_proofs[0].rows_compared,
   sqlite_full_integrity_check_claimed:false,
   stage2_authorized:false,canary_promoted:false,
   source_private_rows_logged:false
  });
 }
 const schema=read(query,
  "SELECT type,name,sql FROM sqlite_schema WHERE name='ingestion_spool_queue' LIMIT 2",2);
 if(schema.length!==1||schema[0].type!=="table"||
    schema[0].name!==TABLE||typeof schema[0].sql!=="string"||
    !["candidate_sha256","d1_committed_at","b2_spool_uri","source_id"].every(x=>
      schema[0].sql.includes(x)))
   fail("REVIEWED_SOURCE_TABLE_SCHEMA_UNVERIFIED");
 const quick=read(query,'PRAGMA quick_check("ingestion_spool_queue")',2);
 if(quick.length!==1||Object.keys(quick[0]).length!==1||
    Object.values(quick[0])[0]!=="ok")
   fail("D1_QUICK_CHECK_FAILED");
 if(read(query,'PRAGMA foreign_key_check("ingestion_spool_queue")',1).length!==0)
   fail("SOURCE_FOREIGN_KEYS_UNVERIFIED");
 for(const name of STEP3_0211_REVIEWED_SPOOL_INDEXES){
  const xinfo=read(query,'PRAGMA index_xinfo("'+name+'")',20);
  const keys=xinfo.filter(x=>x.key===1);
  if(!keys.length||keys.length>8||
     keys.some((x,i)=>x.seqno!==i||!Number.isSafeInteger(x.cid)||
      x.cid<0||typeof x.name!=="string"||
      !/^[a-z_][a-z0-9_]{1,95}$/.test(x.name)||
      !["BINARY","NOCASE","RTRIM"].includes(x.coll)||
      ![0,1].includes(x.desc)))
   fail("SOURCE_INDEX_COLUMNS_UNVERIFIED");
  const sql='SELECT id FROM "ingestion_spool_queue" INDEXED BY "'+name+'" LIMIT 1';
  const plan=read(query,"EXPLAIN QUERY PLAN "+sql,15);
  if(!plan.some(x=>typeof x?.detail==="string"&&x.detail.includes(name)))
   fail("SOURCE_FORCED_INDEX_PLAN_UNVERIFIED");
  if(read(query,sql,1).length!==0)
   fail("CONCURRENT_EMPTY_SOURCE_POPULATION");
 }
 if(!isEmpty(query))fail("CONCURRENT_EMPTY_SOURCE_DRIFT");
 return Object.freeze({
  status:"OBSERVED_EMPTY_SOURCE_ALL_SEVEN_INDEX_STRUCTURE",
  index_count:7,nonempty_source:false,
  source_rows_verified:0,nonvacuous_original_evidence:false,
  source_to_b2_physical_parity_verified:false,
  sqlite_full_integrity_check_claimed:false,
  stage2_authorized:false,canary_promoted:false,
  source_private_rows_logged:false
 });
}

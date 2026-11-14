/**
 * Production D1 read-only full membership verification for large ROWID tables.
 * Unlike a 3,000-row sample, EXCEPT scans the COMPLETE bounded source and
 * forced-index projection in one SQLite statement/snapshot. All private
 * values remain inside D1; exactly one aggregate result returns per index.
 *
 * Provider rows_read is measured by the caller and must be fail-closed.
 * Cross-index statements are NOT one shared transactional snapshot, and this
 * does not replace signing, native ledger, durable checkpoint or B2 proof.
 */
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,95}$/u;
const fail=s=>{throw Error("STEP3_SET_INDEX_"+s)};
const q=x=>{if(typeof x!=="string"||!IDENT.test(x))fail("IDENTIFIER_INVALID");return '"'+x+'"';};
export const STEP3_SET_MAX_SOURCE_ROWS=100000;
// Reviewed only for the 0211 spool ROWID join. At most 150k rows; the caller
// still enforces the 3M provider rows-read cap across every verifier query.
export const STEP3_JOIN_MAX_SOURCE_ROWS=150000;
const PREDICATES=Object.freeze({
 phase2h_private_raw_news:Object.freeze({
  idx_phase2h_pending_recent_ingested_category:'"b2_object_sha256" IS NULL',
  idx_phase2h_risk_country_unindexed_recent:'"risk_country_iso3" IS NULL'
 })
});
function predicateFor(table,index,predicate){
 if(predicate===null)return "";
 if(PREDICATES[table]?.[index]!==predicate)fail("UNREVIEWED_PARTIAL_PREDICATE");
 return " WHERE "+predicate;
}
function read(query,sql,max){
 const value=query(sql,max);
 if(!Array.isArray(value)||value.length>max)fail("PROVIDER_READ_INVALID");
 return value;
}
export function step3BuildIndexSetSQL({table,index,columns,predicate=null}={}){
 const t=q(table),ix=q(index);
 if(!Array.isArray(columns)||columns.length===0||columns.length>16||
    new Set(columns.map(x=>x?.name)).size!==columns.length||
    columns.some(x=>!IDENT.test(x?.name??"")||
      !["BINARY","NOCASE","RTRIM"].includes(x?.coll)))fail("INDEX_COLUMNS_INVALID");
 const where=predicateFor(table,index,predicate);
 const projection="rowid,"+columns.map(x=>q(x.name)).join(",");
 const plain="SELECT "+projection+" FROM "+t+" NOT INDEXED"+where;
 const indexed="SELECT "+projection+" FROM "+t+" INDEXED BY "+ix+where;
 const bounded="SELECT COUNT(*) AS n FROM (SELECT 1 FROM "+t+
  " NOT INDEXED"+where+" LIMIT "+(STEP3_SET_MAX_SOURCE_ROWS+1)+")";
 const equality="SELECT "+
  "EXISTS("+plain+" EXCEPT "+indexed+") AS canonical_minus_index,"+
  "EXISTS("+indexed+" EXCEPT "+plain+") AS index_minus_canonical,"+
  "(SELECT COUNT(*) FROM "+t+" NOT INDEXED"+where+") AS canonical_rows,"+
  "(SELECT COUNT(*) FROM "+t+" INDEXED BY "+ix+where+") AS index_rows";
 const predicates=columns.map(x=>q(x.name)+" IS NOT NULL").join(" AND ");
 const grouping=columns.map(x=>q(x.name)+" COLLATE "+x.coll).join(",");
 const uniqueness="SELECT 1 AS duplicate FROM "+t+" WHERE "+predicates+
  (where?" AND "+where.slice(7):"")+" GROUP BY "+grouping+
  " HAVING COUNT(*)>1 LIMIT 1";
 return Object.freeze({table,index,columns,predicate,bounded,equality,uniqueness,
  plan:"EXPLAIN QUERY PLAN "+indexed});
}
export function verifyStep3IndexSetResult(proof,{sourceRows,minRows=1}={}){
 if(!Array.isArray(proof)||proof.length!==1||
    Object.keys(proof[0]??{}).sort().join(",")!==
     "canonical_minus_index,canonical_rows,index_minus_canonical,index_rows")
  fail("EQUALITY_PROOF_SHAPE_UNVERIFIED");
 if(!Number.isSafeInteger(sourceRows)||sourceRows<minRows||
    sourceRows>STEP3_SET_MAX_SOURCE_ROWS)
  fail("SOURCE_ROWS_OUTSIDE_REVIEWED_BOUND");
 const row=proof[0];
 if(![row.canonical_minus_index,row.canonical_rows,
      row.index_minus_canonical,row.index_rows].every(Number.isSafeInteger))
  fail("EQUALITY_PROOF_COUNTER_INVALID");
 if(row.canonical_rows!==sourceRows||row.index_rows!==sourceRows)
  fail("CONCURRENT_ROW_COUNT_MISMATCH");
 if(row.canonical_minus_index!==0||row.index_minus_canonical!==0)
  fail("COMPLETE_SET_MEMBERSHIP_MISMATCH");
 return Object.freeze({verified_rows:sourceRows,complete_set_membership:true});
/**
 * Reads only provider aggregates. Exact index registry and projected xinfo
 * are checked, and every index must be a supported full ROWID index.
 * No raw row payloads or hashes are included in receipts.
 */
export function auditStep3AllIndexesSet(table,query){
 q(table);
 if(typeof query!=="function")fail("PROVIDER_READER_REQUIRED");
 const boundedSQL="SELECT COUNT(*) AS n FROM (SELECT 1 FROM "+q(table)+
  " NOT INDEXED LIMIT "+(STEP3_SET_MAX_SOURCE_ROWS+1)+")";
 const bound=read(query,boundedSQL,1);
 if(bound.length!==1||!Number.isSafeInteger(bound[0]?.n)||
    bound[0].n<1||bound[0].n>STEP3_SET_MAX_SOURCE_ROWS)
  fail("SOURCE_ROWS_OUTSIDE_REVIEWED_BOUND");
 const rows=bound[0].n;
 const quick=read(query,"PRAGMA quick_check("+q(table)+")",2);
 if(quick.length!==1||Object.values(quick[0]??{}).length!==1||
    Object.values(quick[0])[0]!=="ok")fail("QUICK_CHECK_NOT_OK");
 if(read(query,"PRAGMA foreign_key_check("+q(table)+")",1).length!==0)
  fail("FOREIGN_KEYS_UNVERIFIED");
 const indexes=read(query,"PRAGMA index_list("+q(table)+")",49);
 if(indexes.length<1||indexes.length>48||
    new Set(indexes.map(x=>x.name)).size!==indexes.length)
  fail("INDEX_CATALOG_INVALID");
 const proofs=[];
 for(const idx of indexes){
  if(idx.partial!==0||![0,1].includes(idx.unique)||
     !["c","u","pk"].includes(idx.origin))fail("UNREVIEWED_INDEX_TYPE");
  const xinfo=read(query,"PRAGMA index_xinfo("+q(idx.name)+")",32);
  const columns=xinfo.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
  if(columns.length<1||columns.length>16||
     columns.some((x,i)=>x.seqno!==i||
       !Number.isSafeInteger(x.cid)||x.cid<0||
       !IDENT.test(x.name??"")||![0,1].includes(x.desc)))
   fail("INDEX_XINFO_UNVERIFIED");
  const statements=step3BuildIndexSetSQL({table,index:idx.name,
   columns:columns.map(x=>({name:x.name,coll:x.coll}))});
  const plan=read(query,statements.plan,20);
  if(!plan.some(x=>typeof x.detail==="string"&&
    x.detail.includes("USING COVERING INDEX "+idx.name)))
   fail("FORCED_COVERING_INDEX_PLAN_UNVERIFIED");
  const set=verifyStep3IndexSetResult(read(query,statements.equality,1),
   {sourceRows:rows});
  if(idx.unique===1&&read(query,statements.uniqueness,1).length!==0)
   fail("UNIQUE_LOGICAL_CONSTRAINT_UNVERIFIED");
  proofs.push({index:idx.name,rows_compared:set.verified_rows,
   unique_verified:idx.unique===1,
   status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY",
   proof_kind:"EXACT_CANONICAL_MINUS_INDEX_AND_REVERSE_EXCEPT"});
 }
 const final=read(query,"PRAGMA index_list("+q(table)+")",49);
 if(JSON.stringify(indexes)!==JSON.stringify(final))
  fail("CONCURRENT_INDEX_SCHEMA_DRIFT");
 const fresh=read(query,boundedSQL,1);
 if(fresh.length!==1||fresh[0]?.n!==rows)
  fail("CONCURRENT_SOURCE_ROW_COUNT_DRIFT");
 return Object.freeze({
  table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
  total_existing_indexes:proofs.length,index_proofs:proofs,
  all_indexes_including_unique_considered:true,
  full_source_row_count_observed:rows,
  per_index_single_statement_snapshot:true,
  cross_index_transactional_snapshot_proven:false,
  real_sqlite_integrity_check_claimed:false,
  physical_file_integrity_claimed:false,
  raw_private_content_exposed:false
 });
}


/**
 * Equivalent complete key/row set proof for large ROWID spool sources with
 * lower read amplification than two full bidirectional EXCEPTs per index.
 *
 * Each index is scanned ONCE as a covering index, joined by its ROWID back
 * to the canonical unindexed table. Full source/index/distinct-ROWID counts
 * must all match, and EVERY indexed key must equal its canonical table key.
 * This is sufficient for bidirectional row/key membership: no missing row,
 * duplicate ROWID, orphan entry, or wrong-key entry can be admitted.
 *
 * Both halves are read inside ONE SQLite statement per index. The explicit
 * plan check prevents the optimizer from silently replacing the forced index
 * with an ordinary table scan. No raw source values leave the provider.
 * Cross-index transactional isolation and physical B2 parity are NOT claimed.
 */
export function step3BuildIndexJoinSQL({table,index,columns}={}){
 const t=q(table),ix=q(index);
 if(!Array.isArray(columns)||columns.length===0||columns.length>16||
    new Set(columns.map(x=>x?.name)).size!==columns.length||
    columns.some(x=>!IDENT.test(x?.name??"")||
      !["BINARY","NOCASE","RTRIM"].includes(x.coll)))
  fail("JOIN_INDEX_COLUMNS_INVALID");
 const equal=columns.map(x=>
  "i."+q(x.name)+" IS s."+q(x.name)).join(" AND ");
 const joined=" FROM "+t+" AS i INDEXED BY "+ix+
  " LEFT JOIN "+t+" AS s NOT INDEXED ON s.rowid=i.rowid";
 const equality="SELECT COUNT(*) AS index_rows,"+
  "COUNT(DISTINCT i.rowid) AS distinct_rowids,"+
  "COALESCE(SUM(CASE WHEN s.rowid IS NULL OR NOT ("+equal+
  ") THEN 1 ELSE 0 END),0) AS mismatched_rows"+joined;
 const predicates=columns.map(x=>q(x.name)+" IS NOT NULL").join(" AND ");
 const grouping=columns.map(x=>q(x.name)+" COLLATE "+x.coll).join(",");
 const uniqueness="SELECT 1 AS duplicate FROM "+t+" WHERE "+predicates+
  " GROUP BY "+grouping+" HAVING COUNT(*)>1 LIMIT 1";
 return Object.freeze({equality,plan:"EXPLAIN QUERY PLAN "+equality,
  uniqueness});
}
export function verifyStep3IndexJoinResult(proof,{sourceRows}={}){
 if(!Array.isArray(proof)||proof.length!==1||
    Object.keys(proof[0]??{}).sort().join(",")!==
      "distinct_rowids,index_rows,mismatched_rows"||
    !Number.isSafeInteger(sourceRows)||sourceRows<1||
    sourceRows>STEP3_JOIN_MAX_SOURCE_ROWS||
    !Number.isSafeInteger(proof[0].index_rows)||
    !Number.isSafeInteger(proof[0].distinct_rowids)||
    !Number.isSafeInteger(proof[0].mismatched_rows)||
    proof[0].index_rows!==sourceRows||
    proof[0].distinct_rowids!==sourceRows||
    proof[0].mismatched_rows!==0)
  fail("COMPLETE_ROWID_AND_KEY_PARITY_UNVERIFIED");
 return Object.freeze({verified_rows:sourceRows,
  complete_set_membership:true});
}
export function auditStep3AllIndexesJoin(table,query){
 // This optimized audit is authorized only for the reviewed 0211 ROWID
 // spool. Other tables retain their original full EXCEPT verification.
 if(table!=="ingestion_spool_queue")fail("JOIN_TABLE_NOT_REVIEWED");
 q(table);
 if(typeof query!=="function")fail("PROVIDER_READER_REQUIRED");
 const boundedSQL="SELECT COUNT(*) AS n FROM (SELECT 1 FROM "+q(table)+
  " NOT INDEXED LIMIT "+(STEP3_JOIN_MAX_SOURCE_ROWS+1)+")";
 const bound=read(query,boundedSQL,1);
 if(bound.length!==1||!Number.isSafeInteger(bound[0]?.n)||
    bound[0].n<1||bound[0].n>STEP3_JOIN_MAX_SOURCE_ROWS)
  fail("JOIN_SOURCE_ROWS_OUTSIDE_REVIEWED_BOUND");
 const rows=bound[0].n;
 const quick=read(query,"PRAGMA quick_check("+q(table)+")",2);
 if(quick.length!==1||Object.values(quick[0]??{}).length!==1||
    Object.values(quick[0])[0]!=="ok")fail("JOIN_QUICK_CHECK_NOT_OK");
 if(read(query,"PRAGMA foreign_key_check("+q(table)+")",1).length!==0)
  fail("JOIN_FOREIGN_KEYS_UNVERIFIED");
 const indexes=read(query,"PRAGMA index_list("+q(table)+")",49);
 if(indexes.length<1||indexes.length>48||
    new Set(indexes.map(x=>x.name)).size!==indexes.length)
  fail("JOIN_INDEX_CATALOG_INVALID");
 const proofs=[];
 for(const idx of indexes){
  if(idx.partial!==0||![0,1].includes(idx.unique)||
     !["c","u","pk"].includes(idx.origin))
   fail("JOIN_UNREVIEWED_INDEX_TYPE");
  const xinfo=read(query,"PRAGMA index_xinfo("+q(idx.name)+")",32);
  const columns=xinfo.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
  if(columns.length<1||columns.length>16||
     columns.some((x,i)=>x.seqno!==i||
       !Number.isSafeInteger(x.cid)||x.cid<0||
       !IDENT.test(x.name??"")||![0,1].includes(x.desc)||
       !["BINARY","NOCASE","RTRIM"].includes(x.coll)))
   fail("JOIN_INDEX_XINFO_UNVERIFIED");
  const statements=step3BuildIndexJoinSQL({table,index:idx.name,
   columns:columns.map(x=>({name:x.name,coll:x.coll}))});
  const plan=read(query,statements.plan,20);
  if(!plan.some(x=>typeof x?.detail==="string"&&
      x.detail.includes("SCAN i USING COVERING INDEX "+idx.name))||
     !plan.some(x=>typeof x?.detail==="string"&&
      x.detail.includes("SEARCH s USING INTEGER PRIMARY KEY")))
   fail("JOIN_FORCED_INDEX_AND_CANONICAL_ROWID_PLAN_UNVERIFIED");
  const proved=verifyStep3IndexJoinResult(
   read(query,statements.equality,1),{sourceRows:rows});
  if(idx.unique===1&&read(query,statements.uniqueness,1).length!==0)
   fail("JOIN_UNIQUE_LOGICAL_CONSTRAINT_UNVERIFIED");
  proofs.push({index:idx.name,rows_compared:proved.verified_rows,
   unique_verified:idx.unique===1,
   status:"PASS_BOUNDED_FULL_INDEX_KEY_AND_ROW_PARITY",
   proof_kind:"COMPLETE_FORCED_INDEX_ROWID_JOIN_AND_KEY_COMPARISON"});
 }
 const final=read(query,"PRAGMA index_list("+q(table)+")",49);
 if(JSON.stringify(indexes)!==JSON.stringify(final))
  fail("JOIN_CONCURRENT_INDEX_SCHEMA_DRIFT");
 const fresh=read(query,boundedSQL,1);
 if(fresh.length!==1||fresh[0]?.n!==rows)
  fail("JOIN_CONCURRENT_SOURCE_ROW_COUNT_DRIFT");
 return Object.freeze({
  table,status:"PASS_D1_SUPPORTED_QUICK_FK_ALL_INDEX_LOGICAL_PROOF",
  total_existing_indexes:proofs.length,index_proofs:proofs,
  all_indexes_including_unique_considered:true,
  full_source_row_count_observed:rows,
  per_index_single_statement_snapshot:true,
  cross_index_transactional_snapshot_proven:false,
  real_sqlite_integrity_check_claimed:false,
  physical_file_integrity_claimed:false,
  raw_private_content_exposed:false
 });
}

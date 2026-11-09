/**
 * Exact, D1-supported logical integrity proof for 0212's pre-existing
 * partial index. Never waive partial indexes or treat schema presence as
 * evidence of complete index keys; this examines predicate-qualified rows.
 *
 * Cloudflare D1 does not support table-scoped PRAGMA integrity_check.
 * This checks only a specific canonical predicate/index and does not claim
 * the physical SQLite file, signing, B2 parity, 0212 application, or canary.
 */
import {createHash} from "node:crypto";
const TABLE="phase2h_private_raw_news";
const INDEX="idx_phase2h_pending_recent_ingested_category";
const PREDICATE='"b2_object_sha256" IS NULL';
const COLS=["first_ingested_at","category"];
const LIMIT=3001;
const fail=reason=>{throw Error("STEP3_0212_PARTIAL_"+reason)};
const q=x=>'"'+x+'"';
const base="SELECT rowid AS __audit_rowid,"+COLS.map((c,i)=>
 q(c)+" AS __audit_key_"+i).join(",")+" FROM "+q(TABLE);
const tableSQL=base+" NOT INDEXED WHERE "+PREDICATE+" LIMIT "+LIMIT;
const indexedSQL=base+" INDEXED BY "+q(INDEX)+
 " WHERE "+PREDICATE+" LIMIT "+LIMIT;
const schemaSQL="SELECT name,type,sql FROM sqlite_schema WHERE name='"+INDEX+
 "' AND type='index' LIMIT 2";
const schemaPattern=/^CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'\`]?idx_phase2h_pending_recent_ingested_category["'\`]?\s+ON\s+["'\`]?phase2h_private_raw_news["'\`]?\s*\(\s*["'\`]?first_ingested_at["'\`]?\s*,\s*["'\`]?category["'\`]?\s*\)\s*WHERE\s+["'\`]?b2_object_sha256["'\`]?\s+IS\s+NULL\s*;?\s*$/iu;
function read(query,sql,max){
 const rows=query(sql,max);
 if(!Array.isArray(rows)||rows.length>max)
  fail("D1_BOUNDED_READ_PROVIDER_RESULT_UNVERIFIED");
 return rows;
}
function digest(rows){
 if(rows.length===0)return "EMPTY";
 if(rows.length>3000)fail("SOURCE_QUALIFIED_ROWS_ABOVE_3000");
 const seen=new Set(),ordered=[];
 for(const v of rows){
  const rowid=v?.__audit_rowid,a=v?.__audit_key_0,c=v?.__audit_key_1;
  if(Object.keys(v??{}).sort().join(",")!=="__audit_key_0,__audit_key_1,__audit_rowid"||
     !Number.isSafeInteger(rowid)||seen.has(rowid)||
     typeof a!=="string"||a.length<10||a.length>48||
     !["geopolitics","macro","rare_earth"].includes(c))
   fail("PRIVATE_ROW_IDENTITY_OR_PROJECTION_INVALID");
  seen.add(rowid);
  ordered.push([rowid,a,c]);
 }
 ordered.sort((x,y)=>x[0]-y[0]);
 return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}
function plan(rows,needle){
 return rows.length>0&&rows.length<=20&&
 rows.some(x=>typeof x?.detail==="string"&&x.detail.includes(needle));
}
export function auditStep30212ExactPartialIndex(query){
 if(typeof query!=="function")fail("PROVIDER_READER_MISSING");
 const schema=read(query,schemaSQL,2);
 if(schema.length!==1||schema[0].name!==INDEX||
    schema[0].type!=="index"||
    typeof schema[0].sql!=="string"||
    !schemaPattern.test(schema[0].sql.replace(/\s+/gu," ").trim()))
   fail("EXACT_REVIEWED_PARTIAL_INDEX_DDL_MISMATCH");
 const indexList=read(query,"PRAGMA index_list("+q(TABLE)+")",48);
 const matched=indexList.filter(r=>r.name===INDEX);
 if(matched.length!==1||matched[0].partial!==1||
   matched[0].unique!==0||matched[0].origin!=="c"||
   indexList.some(r=>r.name!==INDEX&&r.partial===1))
  fail("PARTIAL_INDEX_REGISTRY_OR_ADDITIONAL_PREDICATE_UNVERIFIED");
 const xinfo=read(query,"PRAGMA index_xinfo("+q(INDEX)+")",6);
 const keys=xinfo.filter(r=>r.key===1).sort((a,b)=>a.seqno-b.seqno);
 if(keys.length!==2||keys[0].name!=="first_ingested_at"||
   keys[1].name!=="category"||keys[0].seqno!==0||
   keys[1].seqno!==1||keys.some(r=>
    r.cid<0||r.coll!=="BINARY"||r.desc!==0))
  fail("PARTIAL_INDEX_COLUMNS_COLLATION_UNVERIFIED");
 const quick=read(query,"PRAGMA quick_check("+q(TABLE)+")",2);
 if(quick.length!==1||Object.keys(quick[0]).length!==1||
    Object.values(quick[0])[0]!=="ok")
  fail("D1_QUICK_CHECK_NOT_OK");
 if(read(query,"PRAGMA foreign_key_check("+q(TABLE)+")",1).length!==0)
  fail("D1_FOREIGN_KEYS_UNVERIFIED");
 if(!plan(read(query,"EXPLAIN QUERY PLAN "+tableSQL,20),
     "SCAN "+TABLE)||
    !plan(read(query,"EXPLAIN QUERY PLAN "+indexedSQL,20),
     "USING INDEX "+INDEX))
  fail("FORCED_PARTIAL_INDEX_PLAN_UNVERIFIED");
 const before=read(query,tableSQL,LIMIT);
 const fromIndex=read(query,indexedSQL,LIMIT);
 const after=read(query,tableSQL,LIMIT);
 const b=digest(before),i=digest(fromIndex),a=digest(after);
 if(b!==i)fail("PREDICATE_QUALIFIED_INDEX_MEMBERSHIP_MISMATCH");
 if(b!==a)fail("CONCURRENT_TABLE_WRITE_OR_READ_DRIFT");
 const nonvacuous=before.length>0;
 return Object.freeze({
  status:nonvacuous?
   "PASS_D1_0212_EXACT_PARTIAL_PREDICATE_BOUNDED_INDEX_PARITY":
   "OBSERVED_ZERO_QUALIFYING_PARTIAL_ROWS",
  table:TABLE,index:INDEX,qualified_rows_verified:before.length,
  nonvacuous_index_membership_proven:nonvacuous,
  reviewed_partial_predicate_verified:true,
  unreviewed_partial_indexes_permitted:false,
  provider_reader_provenance:"REQUIRES_INDEPENDENT_FRESH_SAME_TARGET_D1_CALLER",
  sqlite_integrity_check_claimed:false,physical_file_integrity_claimed:false,
  payments:0,production_sql_writes:0,
  stage2_authorized:false,canary_promoted:false,
  raw_rows_or_digest_emitted:false
 });
}

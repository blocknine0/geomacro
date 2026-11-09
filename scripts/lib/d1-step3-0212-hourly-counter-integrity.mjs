/**
 * Provider-supported D1 0212 exact hourly pending census proof.
 * Requires the canonical raw source to match EVERY category/UTC-hour
 * counter. Equal totals with a distorted hourly distribution never PASS.
 * All provider row/key bytes are private and only safe counts/status escape.
 */
import {createHash} from "node:crypto";
const TABLE="phase2h_pending_hourly_v1";
const PK="sqlite_autoindex_phase2h_pending_hourly_v1_1";
export const STEP3_0212_HOURLY_MAX_ROWS=3000;
const fail=x=>{throw Error("STEP3_0212_HOURLY_"+x)};
const quoted=s=>'"'+s+'"';
const cols="category AS __audit_cat,hour_utc AS __audit_hour,pending_count AS __audit_count";
const tableSQL="SELECT "+cols+" FROM "+quoted(TABLE)+" NOT INDEXED LIMIT 3001";
const indexSQL="SELECT "+cols+" FROM "+quoted(TABLE)+" INDEXED BY "+quoted(PK)+" LIMIT 3001";
const sourceSQL="SELECT category AS __audit_cat,substr(first_ingested_at,1,13) AS __audit_hour,"+
 "COUNT(*) AS __audit_count FROM phase2h_private_raw_news "+
 "WHERE b2_object_sha256 IS NULL GROUP BY category,substr(first_ingested_at,1,13) LIMIT 3001";
const existsSQL="SELECT EXISTS(SELECT 1 FROM phase2h_private_raw_news "+
 "WHERE b2_object_sha256 IS NULL LIMIT 1) AS has_pending";
function read(q,sql,cap){
 const r=q(sql,cap);
 if(!Array.isArray(r)||r.length>cap)fail("READ_LIMIT_OR_PROVIDER_RESULT_UNVERIFIED");
 return r;
}
function digest(rows){
 if(rows.length>STEP3_0212_HOURLY_MAX_ROWS)fail("HOUR_BUCKET_CAP_EXCEEDED");
 const keys=new Set(),values=[];
 for(const row of rows){
  const k=row?.__audit_cat,h=row?.__audit_hour,n=row?.__audit_count;
  if(Object.keys(row??{}).sort().join(",")!=="__audit_cat,__audit_count,__audit_hour"||
     !["geopolitics","macro","rare_earth"].includes(k)||
     typeof h!=="string"||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3])$/u.test(h)||
     !Number.isSafeInteger(n)||n<0||keys.has(k+"|"+h))
   fail("INVALID_DUPLICATE_OR_UNSORTED_UTC_BUCKET");
  keys.add(k+"|"+h);values.push([k,h,n]);
 }
 values.sort((a,b)=>(a[0]+"|"+a[1]).localeCompare(b[0]+"|"+b[1]));
 return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
export function auditStep30212ExactHourlyCounter(query){
 if(typeof query!=="function")fail("PROVIDER_READER_MISSING");
 const schema=read(query,"SELECT name,type,sql FROM sqlite_schema WHERE name='"+
  TABLE+"' AND type='table' LIMIT 2",2);
 if(schema.length!==1||schema[0].name!==TABLE||schema[0].type!=="table"||
    typeof schema[0].sql!=="string"||
    !["PRIMARY KEY(category,hour_utc)","pending_count","first_ingested_at"].slice(0,2)
      .every((x,i)=>i===0?
       /PRIMARY\s+KEY\s*\(\s*category\s*,\s*hour_utc\s*\)/iu.test(schema[0].sql):
       schema[0].sql.includes(x)))
   fail("REVIEWED_HOURLY_COUNTER_SCHEMA_UNVERIFIED");
 const columns=read(query,"PRAGMA table_info("+quoted(TABLE)+")",4);
 if(columns.length!==3||
    columns[0].name!=="category"||columns[0].pk!==1||columns[0].notnull!==1||
    columns[1].name!=="hour_utc"||columns[1].pk!==2||columns[1].notnull!==1||
    columns[2].name!=="pending_count"||columns[2].pk!==0||columns[2].notnull!==1)
  fail("COMPOSITE_PRIMARY_KEY_OR_COUNTER_DRIFT");
 const list=read(query,"PRAGMA index_list("+quoted(TABLE)+")",3);
 if(list.length!==1||list[0].name!==PK||list[0].unique!==1||
    list[0].partial!==0||list[0].origin!=="pk")
  fail("REVIEWED_PK_INDEX_CATALOG_DRIFT");
 const xinfo=read(query,"PRAGMA index_xinfo("+quoted(PK)+")",4);
 const keys=xinfo.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
 if(keys.length!==2||keys[0].name!=="category"||keys[1].name!=="hour_utc"||
    keys.some((x,i)=>x.seqno!==i||x.cid!==i||x.coll!=="BINARY"||x.desc!==0))
  fail("HOUR_CATEGORY_PK_KEY_METADATA_DRIFT");
 const quick=read(query,"PRAGMA quick_check("+quoted(TABLE)+")",2);
 if(quick.length!==1||Object.keys(quick[0]).length!==1||
    Object.values(quick[0])[0]!=="ok")
  fail("D1_QUICK_CHECK_INVALID");
 if(read(query,"PRAGMA foreign_key_check("+quoted(TABLE)+")",1).length!==0)
  fail("FOREIGN_KEY_VIOLATION");
 const rawPlan=read(query,"EXPLAIN QUERY PLAN "+tableSQL,20);
 const idxPlan=read(query,"EXPLAIN QUERY PLAN "+indexSQL,20);
 if(!rawPlan.some(x=>x?.detail==="SCAN "+TABLE)||
    !idxPlan.some(x=>typeof x?.detail==="string"&&x.detail.includes(PK)))
  fail("FORCED_PK_INDEX_PLAN_UNVERIFIED");
 const before=read(query,tableSQL,3001),indexed=read(query,indexSQL,3001);
 const after=read(query,tableSQL,3001),grouped=read(query,sourceSQL,3001);
 const first=digest(before);
 if(first!==digest(indexed))fail("COUNTER_PK_INDEX_MEMBERSHIP_MISMATCH");
 if(first!==digest(after))fail("CONCURRENT_HOURLY_COUNTER_WRITE");
 // 0212's ACK/DELETE triggers deliberately retain a ZERO-count historical
 // hour bucket. A zero bin is valid and should not masquerade as an active
 // source row; validate ALL bins against the PK tree first, then compare only
 // positive bins with exactly the source's grouped pending originals.
 const positive=before.filter(x=>x.__audit_count>0);
 if(digest(positive)!==digest(grouped))
  fail("EXACT_SOURCE_HOURLY_DISTRIBUTION_MISMATCH");
 const pending=read(query,existsSQL,1);
 if(pending.length!==1||![0,1].includes(pending[0]?.has_pending)||
    (pending[0].has_pending===1&&positive.length===0)||
    (pending[0].has_pending===0&&positive.length!==0))
  fail("SOURCE_PENDING_NONVACUOUS_STATE_UNVERIFIED");
 return Object.freeze({
  status:positive.length>0?
   "PASS_D1_0212_EXACT_HOURLY_COUNTER_AND_PK_INDEX_PARITY":
   "OBSERVED_EMPTY_HOURLY_COUNTER_AND_NO_PENDING_SOURCE",
  counter_buckets_verified:before.length,
  active_counter_buckets_verified:positive.length,
  zero_count_history_buckets_verified:before.length-positive.length,
  original_pending_source_nonempty:pending[0].has_pending===1,
  canonical_source_group_by_exact:true,
  index_count:1,primary_key_columns_verified:2,
  provider_reader_provenance:"FRESH_SAME_TARGET_REQUIRED",
  sqlite_full_integrity_check_claimed:false,
  source_content_or_digest_logged:false,
  signed_original_verified:false,b2_archive_bytes_verified:false,
  production_release_authorized:false,
  canary_promoted:false
 });
}

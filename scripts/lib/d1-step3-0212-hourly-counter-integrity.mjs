/**
 * D1-supported 0212 exact UTC-hour materialized pending census audit.
 * Unlike a SUM-only comparison, checks every category/hour source bin, its
 * primary index, stable reads, UNIQUE/FK, quick_check and <=3000 source cap.
 * Provider return rows/digests remain private; no release approval is granted.
 */
import {createHash} from "node:crypto";
const TABLE="phase2h_pending_hourly_v1";
const PK="sqlite_autoindex_phase2h_pending_hourly_v1_1";
const LIMIT=3001;
const fail=x=>{throw Error("STEP3_0212_HOURLY_"+x)};
const qt=x=>'"'+x+'"';
const select="SELECT category AS __audit_category,hour_utc AS __audit_hour,"+
 "pending_count AS __audit_count FROM "+qt(TABLE);
const noIndex=select+" NOT INDEXED LIMIT "+LIMIT;
const indexed=select+" INDEXED BY "+qt(PK)+" LIMIT "+LIMIT;
const source="SELECT category AS __audit_category,"+
 "substr(first_ingested_at,1,13) AS __audit_hour,COUNT(*) AS __audit_count "+
 "FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL "+
 "GROUP BY category,substr(first_ingested_at,1,13) LIMIT "+LIMIT;
const exactOK=x=>x.length===1&&Object.keys(x[0]??{}).length===1&&
 Object.values(x[0])[0]==="ok";
function read(query,sql,max){
 const rows=query(sql,max);
 if(!Array.isArray(rows)||rows.length>max)
  fail("PROVIDER_READ_UNVERIFIED_OR_CAP_EXCEEDED");
 return rows;
}
function summarize(rows){
 if(rows.length>3000)fail("PENDING_BINS_EXCEED_3000");
 const keys=new Set(),items=[];
 let count=0;
 for(const r of rows){
  if(Object.keys(r??{}).sort().join(",")!==
     "__audit_category,__audit_count,__audit_hour"||
     !["geopolitics","macro","rare_earth"].includes(r.__audit_category)||
     typeof r.__audit_hour!=="string"||
     !/^\d{4}-\d{2}-\d{2}T\d{2}$/u.test(r.__audit_hour)||
     !Number.isSafeInteger(r.__audit_count)||r.__audit_count<=0||
     count+r.__audit_count>3000)
   fail("UNVERIFIED_BIN_CATEGORY_CLOCK_OR_POSITIVE_COUNT");
  const key=r.__audit_category+"|"+r.__audit_hour;
  if(keys.has(key))fail("DUPLICATE_PENDING_HOUR_BIN");
  keys.add(key);count+=r.__audit_count;
  items.push([r.__audit_category,r.__audit_hour,r.__audit_count]);
 }
 items.sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
 return Object.freeze({hash:createHash("sha256").update(JSON.stringify(items)).digest("hex"),
  bins:items.length,total:count});
}
function plan(rows,s){
 return rows.length>0&&rows.length<=20&&
  rows.some(x=>typeof x?.detail==="string"&&x.detail.includes(s));
}
export function auditStep30212HourlyCounter(query){
 if(typeof query!=="function")fail("FRESH_D1_QUERY_REQUIRED");
 const schema=read(query,"SELECT name,type,sql FROM sqlite_schema WHERE "+
  "name='"+TABLE+"' AND type='table' LIMIT 2",2);
 if(schema.length!==1||schema[0].name!==TABLE||schema[0].type!=="table"||
    typeof schema[0].sql!=="string"||
    !["category","hour_utc","pending_count","PRIMARY KEY"].every(x=>
     schema[0].sql.includes(x)))
  fail("REVIEWED_0212_HOURLY_TABLE_SCHEMA_INVALID");
 const cols=read(query,"PRAGMA table_info("+qt(TABLE)+")",4);
 if(cols.length!==3||cols[0].name!=="category"||cols[0].pk!==1||
    cols[0].notnull!==1||cols[1].name!=="hour_utc"||cols[1].pk!==2||
    cols[1].notnull!==1||cols[2].name!=="pending_count"||
    cols[2].pk!==0||cols[2].notnull!==1)
  fail("REVIEWED_0212_PRIMARY_KEY_OR_COUNT_SCHEMA_INVALID");
 const catalog=read(query,"PRAGMA index_list("+qt(TABLE)+")",3);
 if(catalog.length!==1||catalog[0].name!==PK||
    catalog[0].unique!==1||catalog[0].partial!==0||
    catalog[0].origin!=="pk")
  fail("REVIEWED_0212_UNIQUE_PK_INDEX_DRIFT");
 const xinfo=read(query,"PRAGMA index_xinfo("+qt(PK)+")",4);
 const keys=xinfo.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
 if(keys.length!==2||keys[0].name!=="category"||
    keys[1].name!=="hour_utc"||keys.some((x,i)=>
     x.seqno!==i||x.cid!==i||x.coll!=="BINARY"||x.desc!==0))
  fail("REVIEWED_0212_HOURLY_PK_KEY_DRIFT");
 if(!exactOK(read(query,"PRAGMA quick_check("+qt(TABLE)+")",2)))
  fail("REVIEWED_0212_TABLE_QUICK_CHECK_FAILED");
 if(read(query,"PRAGMA foreign_key_check("+qt(TABLE)+")",1).length!==0)
  fail("REVIEWED_0212_FOREIGN_KEY_VIOLATION");
 if(!plan(read(query,"EXPLAIN QUERY PLAN "+noIndex,20),"SCAN "+TABLE)||
    !plan(read(query,"EXPLAIN QUERY PLAN "+indexed,20),"INDEX "+PK))
  fail("REVIEWED_0212_FORCED_PK_PLAN_INVALID");
 const sourceBefore=summarize(read(query,source,LIMIT));
 const before=summarize(read(query,noIndex,LIMIT));
 const forced=summarize(read(query,indexed,LIMIT));
 const after=summarize(read(query,noIndex,LIMIT));
 const sourceAfter=summarize(read(query,source,LIMIT));
 if(before.hash!==after.hash||sourceBefore.hash!==sourceAfter.hash)
  fail("CONCURRENT_SOURCE_OR_COUNTER_UPDATE");
 if(before.hash!==forced.hash)fail("HOURLY_PK_INDEX_MEMBERSHIP_MISMATCH");
 if(before.hash!==sourceBefore.hash)
  fail("CANONICAL_CATEGORY_UTC_HOUR_DISTRIBUTION_MISMATCH");
 const dup=read(query,"SELECT category,hour_utc FROM "+qt(TABLE)+
  " GROUP BY category,hour_utc HAVING COUNT(*)>1 LIMIT 1",1);
 if(dup.length!==0)fail("DUPLICATE_PRIMARY_KEY_BIN");
 const now=read(query,"PRAGMA index_list("+qt(TABLE)+")",3);
 if(JSON.stringify(now)!==JSON.stringify(catalog))
  fail("CONCURRENT_HOURLY_SCHEMA_CHANGE");
 const nonempty=before.total>0;
 return Object.freeze({
  status:nonempty?
   "PASS_D1_0212_CANONICAL_PER_HOUR_PK_QUICK_FK_PARITY":
   "OBSERVED_EMPTY_0212_HOURLY_CENSUS_NO_SIGNED_DATA",
  bins_verified:before.bins,
  pending_source_rows_verified:before.total,
  index_membership_nonvacuous:nonempty,
  exact_source_hour_distribution_verified:true,
  sqlite_full_file_integrity_claimed:false,
  source_originals_cryptographically_signed_by_this_proof:false,
  stage2_authorized:false,canary_promoted:false,
  provider_reader_provenance:"FRESH_SAME_TARGET_D1_REQUIRED",
  private_rows_or_digests_emitted:false
 });
}

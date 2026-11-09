/**
 * Scoped D1-supported 0211 WITHOUT ROWID counter-table integrity proof.
 *
 * This is logical / index / UNIQUE / FK verification only, NOT SQLite's full
 * database file integrity_check. Requires fresh same-target provider reads
 * under the protected migration quota gate. Empty source/target can never
 * claim a nonvacuous release proof.
 */
import {createHash} from "node:crypto";
const TABLE="p0b_committed_day_totals";
const PRIMARY_INDEX="sqlite_autoindex_p0b_committed_day_totals_1";
export const STEP3_0211_MAX_COUNTER_DAYS=3000;
const fail=x=>{throw Error("STEP3_0211_COUNTER_"+x)};
const qt=s=>'"'+s+'"';
const projection="SELECT day_utc AS __audit_day,committed_count AS __audit_count FROM "+
 qt(TABLE);
const baselineSQL=projection+" NOT INDEXED LIMIT 3001";
const indexedSQL=projection+" INDEXED BY "+qt(PRIMARY_INDEX)+" LIMIT 3001";
const uniqueSQL="SELECT day_utc FROM "+qt(TABLE)+
 " GROUP BY day_utc COLLATE BINARY HAVING COUNT(*)>1 LIMIT 1";
const sourceSQL="SELECT COUNT(*) AS source_committed FROM "+
 "ingestion_spool_queue WHERE d1_committed_at IS NOT NULL";
const sourceGroupedSQL="SELECT substr(d1_committed_at,1,10) AS __audit_day, "+
 "COUNT(*) AS __audit_count FROM ingestion_spool_queue "+
 "WHERE d1_committed_at IS NOT NULL GROUP BY substr(d1_committed_at,1,10) LIMIT 3001";
const sumSQL="SELECT COALESCE(SUM(committed_count),0) AS counter_committed FROM "+
 qt(TABLE);
const quickSQL="PRAGMA quick_check("+qt(TABLE)+")";
const fkSQL="PRAGMA foreign_key_check("+qt(TABLE)+")";
function strict(query,sql,maxRows){
 const rows=query(sql,maxRows);
 if(!Array.isArray(rows)||rows.length>maxRows)fail("PROVIDER_BOUNDED_ROWS_UNVERIFIED");
 return rows;
}
function rowsDigest(rows,{nonempty}={}){
 if(!Array.isArray(rows)||rows.length>STEP3_0211_MAX_COUNTER_DAYS||
    (nonempty&&rows.length===0))fail("BOUNDED_NONEMPTY_COUNTER_ROWS_UNVERIFIED");
 const ids=new Set();
 const tuples=rows.map(x=>{
  const key=x?.__audit_day,count=x?.__audit_count;
  if(Object.keys(x??{}).sort().join(",")!=="__audit_count,__audit_day"||
     typeof key!=="string"||!/^\d{4}-\d\d-\d\d$/.test(key)||
     !Number.isSafeInteger(count)||count<0||ids.has(key))
   fail("INVALID_OR_DUPLICATE_COUNTER_VALUE");
  ids.add(key);return [key,count];
 });
 tuples.sort((a,b)=>a[0].localeCompare(b[0]));
 return createHash("sha256").update(JSON.stringify(tuples)).digest("hex");
}
const exactOk=rows=>rows.length===1&&
 Object.keys(rows[0]??{}).length===1&&Object.values(rows[0])[0]==="ok";
const planOk=rows=>Array.isArray(rows)&&rows.length>=1&&rows.length<=20&&
 rows.some(r=>typeof r?.detail==="string"&&
  r.detail==="SCAN p0b_committed_day_totals");
export function auditStep30211WithoutRowidCounter(query){
 if(typeof query!=="function")fail("NO_PROVIDER_READER");
 const schema=strict(query,"SELECT name,type,sql FROM sqlite_schema WHERE name='"+
  TABLE+"' AND type='table' LIMIT 2",2);
 if(schema.length!==1||schema[0].name!==TABLE||schema[0].type!=="table"||
    !/\bWITHOUT\s+ROWID\b/i.test(schema[0].sql??""))
  fail("WITHOUT_ROWID_SCHEMA_NOT_PROVEN");
 const columns=strict(query,"PRAGMA table_info("+qt(TABLE)+")",3);
 if(columns.length!==2||
    columns[0].name!=="day_utc"||columns[0].type.toUpperCase()!=="TEXT"||
    columns[0].pk!==1||columns[0].notnull!==1||
    columns[1].name!=="committed_count"||
    columns[1].type.toUpperCase()!=="INTEGER"||
    columns[1].notnull!==1||columns[1].pk!==0)
   fail("PRIMARY_KEY_AND_COUNTER_METADATA_INVALID");
 const indexes=strict(query,"PRAGMA index_list("+qt(TABLE)+")",2);
 if(indexes.length!==1||indexes[0]?.name!==PRIMARY_INDEX||
    indexes[0].origin!=="pk"||indexes[0].unique!==1||indexes[0].partial!==0)
   fail("PRIMARY_INDEX_CATALOG_DRIFT");
 const xinfo=strict(query,"PRAGMA index_xinfo("+qt(PRIMARY_INDEX)+")",4);
 if(xinfo.length!==2||
    xinfo[0]?.key!==1||xinfo[0]?.name!=="day_utc"||
    xinfo[0]?.coll!=="BINARY"||xinfo[0]?.cid!==0||
    xinfo[1]?.key!==0||xinfo[1]?.name!=="committed_count")
   fail("PRIMARY_INDEX_XINFO_DRIFT");
 if(!exactOk(strict(query,quickSQL,2)))fail("QUICK_CHECK_NOT_OK");
 if(strict(query,fkSQL,1).length!==0)fail("FOREIGN_KEY_VIOLATION");
 // The WITHOUT ROWID table IS its PK B-tree. SQLite's EXPLAIN shows
 // SCAN table for BOTH NOT INDEXED and explicit INDEXED BY primary key,
 // unlike a separate rowid covering index. The forced query nevertheless
 // fails to prepare if the named PK index is absent or cannot be used.
 if(!planOk(strict(query,"EXPLAIN QUERY PLAN "+baselineSQL,20))||
    !planOk(strict(query,"EXPLAIN QUERY PLAN "+indexedSQL,20)))
   fail("PRIMARY_KEY_QUERY_PLAN_UNVERIFIED");
 const before=strict(query,baselineSQL,STEP3_0211_MAX_COUNTER_DAYS+1);
 const indexed=strict(query,indexedSQL,STEP3_0211_MAX_COUNTER_DAYS+1);
 const after=strict(query,baselineSQL,STEP3_0211_MAX_COUNTER_DAYS+1);
 const a=rowsDigest(before),b=rowsDigest(indexed),c=rowsDigest(after);
 if(a!==b)fail("PRIMARY_KEY_INDEX_COUNTER_PARITY_MISMATCH");
 if(a!==c)fail("CONCURRENT_COUNTER_TABLE_CHANGE");
 if(strict(query,uniqueSQL,1).length!==0)fail("DUPLICATE_PRIMARY_KEYS");
 // Sum equality is insufficient: a corrupted day distribution can retain
 // exactly the same total. Compare the canonical GROUP BY from the same
 // bounded source queue against every persisted day/quantity pair.
 const canonicalDays=strict(query,sourceGroupedSQL,STEP3_0211_MAX_COUNTER_DAYS+1);
 if(rowsDigest(canonicalDays)!==a)
  fail("PER_DAY_CANONICAL_COUNTER_MISMATCH");
 const sum=strict(query,sumSQL,1),source=strict(query,sourceSQL,1);
 if(sum.length!==1||source.length!==1||
    !Number.isSafeInteger(sum[0]?.counter_committed)||
    !Number.isSafeInteger(source[0]?.source_committed)||
    sum[0].counter_committed<0||source[0].source_committed<0||
    sum[0].counter_committed!==source[0].source_committed)
   fail("CANONICAL_SOURCE_COUNTER_PARITY_NOT_PROVEN");
 const nonvacuous=before.length>0&&source[0].source_committed>0;
 return Object.freeze({
  status:nonvacuous?
   "PASS_D1_0211_WITHOUT_ROWID_PK_QUICK_FK_UNIQUE_COUNTER_PARITY":
   "OBSERVED_EMPTY_COUNTER_NO_NONVACUOUS_SOURCE",
  source_ledger_backfill_proof_required:!nonvacuous,
  table:TABLE,primary_index:PRIMARY_INDEX,
  counter_days_compared:before.length,
  canonical_committed_rows:source[0].source_committed,
  nonvacuous_source_ledger_proven:nonvacuous,
  distinct_primary_key_readback_verified:true,
  provider_reader_provenance:"REQUIRES_INDEPENDENT_FRESH_SAME_TARGET_D1_CALLER",
  sqlite_full_integrity_check_claimed:false,
  physical_file_integrity_claimed:false,
  stage2_authorized:false,
  canary_promoted:false,
  private_rows_or_digests_emitted:false
 });
}

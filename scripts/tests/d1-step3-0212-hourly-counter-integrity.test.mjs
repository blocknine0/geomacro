import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {auditStep30212ExactHourlyCounter}
 from "../lib/d1-step3-0212-hourly-counter-integrity.mjs";

function makeDatabase({empty=false}={}){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE phase2h_private_raw_news("+
  "record_id TEXT PRIMARY KEY,category TEXT NOT NULL,"+
  "first_ingested_at TEXT NOT NULL,b2_object_sha256 TEXT);"+
  "CREATE TABLE private_osint_news_25h("+
   "country_iso3 TEXT,native_feed_published_at TEXT,item_id TEXT);"+
  "CREATE TABLE website_derived_intelligence("+
   "id TEXT,category TEXT,published_at TEXT);");
 if(!empty)db.exec(
  "INSERT INTO phase2h_private_raw_news VALUES"+
  "('one','geopolitics','2026-11-09T10:30:00.000Z',NULL),"+
  "('two','geopolitics','2026-11-09T10:45:00.000Z',NULL),"+
  "('three','macro','2026-11-08T22:30:00.000Z',NULL),"+
  "('four','rare_earth','2026-11-09T10:40:00.000Z','ack');");
 db.exec(readFileSync("workers/control-plane/staged-migrations/0212_d1_keyset_hourly_pending_census.sql","utf8"));
 return db;
}
function reader(db,mutation=(sql,r)=>r){
 return (sql,maxRows)=>{
  assert.match(sql,/^(?:SELECT |PRAGMA |EXPLAIN QUERY PLAN SELECT )/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM|ATTACH)\b/iu);
  const r=mutation(sql,db.prepare(sql).all());
  assert.ok(Array.isArray(r)&&r.length<=maxRows);
  return r;
 };
}
test("real reviewed 0212 migration seeds exact category/UTC-hour materialized counts and PK index",()=>{
 const d=makeDatabase();
 try{
  const p=auditStep30212ExactHourlyCounter(reader(d));
  assert.equal(p.status,"PASS_D1_0212_EXACT_HOURLY_COUNTER_AND_PK_INDEX_PARITY");
  assert.equal(p.counter_buckets_verified,2);
  assert.equal(p.active_counter_buckets_verified,2);
  assert.equal(p.zero_count_history_buckets_verified,0);
  assert.equal(p.original_pending_source_nonempty,true);
  assert.equal(p.sqlite_full_integrity_check_claimed,false);
  assert.equal(p.signed_original_verified,false);
  assert.equal(p.canary_promoted,false);
 }finally{d.close()}
});
test("ACK triggers retain legitimate ZERO history bins: exclude only from active parity, never key audit",()=>{
 const d=makeDatabase();
 try{
  d.exec("UPDATE phase2h_private_raw_news SET b2_object_sha256='ack' WHERE record_id IN ('one','two')");
  const p=auditStep30212ExactHourlyCounter(reader(d));
  assert.equal(p.status,"PASS_D1_0212_EXACT_HOURLY_COUNTER_AND_PK_INDEX_PARITY");
  assert.equal(p.counter_buckets_verified,2);
  assert.equal(p.active_counter_buckets_verified,1);
  assert.equal(p.zero_count_history_buckets_verified,1);
  d.exec("UPDATE phase2h_private_raw_news SET b2_object_sha256='ack' WHERE record_id='three'");
  const q=auditStep30212ExactHourlyCounter(reader(d));
  assert.equal(q.status,"OBSERVED_EMPTY_HOURLY_COUNTER_AND_NO_PENDING_SOURCE");
  assert.equal(q.counter_buckets_verified,2);
  assert.equal(q.active_counter_buckets_verified,0);
  assert.equal(q.zero_count_history_buckets_verified,2);
  assert.equal(q.canary_promoted,false);
 }finally{d.close()}
});
test("empty real Shadow source yields observational structural status, never nonvacuous migration proof",()=>{
 const d=makeDatabase({empty:true});
 try{
  const p=auditStep30212ExactHourlyCounter(reader(d));
  assert.equal(p.status,"OBSERVED_EMPTY_HOURLY_COUNTER_AND_NO_PENDING_SOURCE");
  assert.equal(p.counter_buckets_verified,0);
  assert.equal(p.original_pending_source_nonempty,false);
  assert.equal(p.production_release_authorized,false);
 }finally{d.close()}
});
test("same grand total with wrong hourly distribution is rejected",()=>{
 const d=makeDatabase();
 try{
  d.exec("UPDATE phase2h_pending_hourly_v1 SET pending_count=1 WHERE category='geopolitics'");
  d.exec("UPDATE phase2h_pending_hourly_v1 SET pending_count=2 WHERE category='macro'");
  const total=d.prepare("SELECT SUM(pending_count) AS n FROM phase2h_pending_hourly_v1").get().n;
  assert.equal(total,3);
  assert.throws(()=>auditStep30212ExactHourlyCounter(reader(d)),
   /EXACT_SOURCE_HOURLY_DISTRIBUTION_MISMATCH/);
 }finally{d.close()}
});
test("invalid FK, source group, PK index and concurrent counter change fail closed",()=>{
 const d=makeDatabase();
 try{
  for(const modify of [
   (sql,r)=>sql.startsWith("PRAGMA index_list")?[]:r,
   (sql,r)=>sql.startsWith("PRAGMA index_xinfo")?
      r.map((x,i)=>i===0?{...x,desc:1}:x):r,
   (sql,r)=>sql.startsWith("PRAGMA quick_check")?[{quick_check:"bad"}]:r,
   (sql,r)=>sql.startsWith("PRAGMA foreign_key_check")?
      [{table:"phase2h_pending_hourly_v1",rowid:1}]:r,
   (sql,r)=>sql.startsWith("EXPLAIN QUERY PLAN")?[{detail:"SCAN unknown"}]:r,
   (sql,r)=>sql.includes("INDEXED BY")&&!sql.startsWith("EXPLAIN")?
      r.map((x,i)=>i===0?{...x,__audit_count:x.__audit_count+1}:x):r,
   (sql,r)=>sql.includes("GROUP BY category")?
      r.map((x,i)=>i===0?{...x,__audit_count:x.__audit_count+1}:x):r
  ])assert.throws(()=>auditStep30212ExactHourlyCounter(reader(d,modify)));
 }finally{d.close()}
});
test("no mutation, fabricated source, payment or real signing authorization",()=>{
 const c=readFileSync("scripts/lib/d1-step3-0212-hourly-counter-integrity.mjs","utf8");
 assert.doesNotMatch(c,/fetch\(|execFileSync|unlinkSync|wrangler deploy/);
 assert.match(c,/production_release_authorized:false/);
 assert.match(c,/source_content_or_digest_logged:false/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {auditStep30212HourlyCounter}
 from "../lib/d1-step3-0212-hourly-counter-integrity.mjs";

function sample(){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE phase2h_private_raw_news("+
  "record_id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL,"+
  "first_ingested_at TEXT NOT NULL,b2_object_sha256 TEXT);"+
  "CREATE TABLE phase2h_pending_hourly_v1 ("+
  " category TEXT NOT NULL CHECK(category IN ('geopolitics','macro','rare_earth')),"+
  " hour_utc TEXT NOT NULL CHECK(length(hour_utc)=13),"+
  " pending_count INTEGER NOT NULL DEFAULT 0 CHECK(pending_count>=0),"+
  " PRIMARY KEY(category,hour_utc));"+
  "INSERT INTO phase2h_private_raw_news VALUES "+
  "('a','geopolitics','2026-11-09T12:00:00Z',NULL),"+
  "('b','geopolitics','2026-11-09T12:20:00Z',NULL),"+
  "('c','geopolitics','2026-11-09T13:01:00Z',NULL),"+
  "('d','macro','2026-11-09T13:33:00Z','already-archived');"+
  "INSERT INTO phase2h_pending_hourly_v1 VALUES"+
  "('geopolitics','2026-11-09T12',2),"+
  "('geopolitics','2026-11-09T13',1);");
 return db;
}
const q=(db,change=(sql,r)=>r)=>(sql,max)=>{
 assert.ok(Number.isInteger(max)&&max>0&&max<=3001);
 assert.match(sql,/^(?:SELECT |PRAGMA |EXPLAIN QUERY PLAN SELECT )/u);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|REPLACE)\b/iu);
 const result=change(sql,db.prepare(sql).all());
 assert.ok(result.length<=max);
 return result;
};
test("real SQLite PK, indexed and table readback, exact canonical hour distribution PASS",()=>{
 const db=sample();try{
  const r=auditStep30212HourlyCounter(q(db));
  assert.equal(r.status,"PASS_D1_0212_CANONICAL_PER_HOUR_PK_QUICK_FK_PARITY");
  assert.equal(r.bins_verified,2);
  assert.equal(r.pending_source_rows_verified,3);
  assert.equal(r.index_membership_nonvacuous,true);
  assert.equal(r.stage2_authorized,false);
  assert.equal(r.private_rows_or_digests_emitted,false);
  assert.doesNotMatch(JSON.stringify(r),/2026-11-09T12|2026-11-09T13/);
 }finally{db.close()}
});
test("equal total with incorrect hour split fails exact bin source distribution",()=>{
 const db=sample();try{
  db.exec("UPDATE phase2h_pending_hourly_v1 SET pending_count=1 WHERE hour_utc='2026-11-09T12';"+
   "UPDATE phase2h_pending_hourly_v1 SET pending_count=2 WHERE hour_utc='2026-11-09T13';");
  const sum=db.prepare("SELECT SUM(pending_count) AS n FROM phase2h_pending_hourly_v1").get();
  assert.equal(sum.n,3);
  assert.throws(()=>auditStep30212HourlyCounter(q(db)),
   /CANONICAL_CATEGORY_UTC_HOUR_DISTRIBUTION_MISMATCH/);
 }finally{db.close()}
});
test("empty exactly matching source/counter is observational, never signed evidence",()=>{
 const db=sample();try{
  db.exec("DELETE FROM phase2h_private_raw_news; DELETE FROM phase2h_pending_hourly_v1;");
  const r=auditStep30212HourlyCounter(q(db));
  assert.equal(r.status,"OBSERVED_EMPTY_0212_HOURLY_CENSUS_NO_SIGNED_DATA");
  assert.equal(r.index_membership_nonvacuous,false);
  assert.equal(r.pending_source_rows_verified,0);
  assert.equal(r.canary_promoted,false);
 }finally{db.close()}
});
test("index registry drift, corrupt PK and source provider read reject",()=>{
 const db=sample();try{
  const mutations=[
   (sql,r)=>sql.startsWith("PRAGMA index_list")?[]:r,
   (sql,r)=>sql.startsWith("PRAGMA index_xinfo")?
     r.map((x,i)=>i===0?{...x,coll:"NOCASE"}:x):r,
   (sql,r)=>sql.startsWith("PRAGMA quick_check")?[{quick_check:"bad"}]:r,
   (sql,r)=>sql.startsWith("PRAGMA foreign_key_check")?
     [{table:"phase2h_pending_hourly_v1",rowid:1}]:r,
   (sql,r)=>sql.startsWith("EXPLAIN")&&sql.includes("INDEXED BY")?
     [{detail:"SCAN unrelated_table"}]:r,
   (sql,r)=>sql.startsWith("SELECT category AS")&&sql.includes("INDEXED BY")?
     r.map((x,i)=>i===0?{...x,__audit_count:7}:x):r,
   (sql,r)=>sql.startsWith("SELECT category AS")&&
     sql.includes("phase2h_private_raw_news")?[]:r,
  ];
  for(const mutate of mutations)
   assert.throws(()=>auditStep30212HourlyCounter(q(db,mutate)));
 }finally{db.close()}
});
test("scoped proof cannot mutate database or remove Canary HOLD",()=>{
 const s=readFileSync("scripts/lib/d1-step3-0212-hourly-counter-integrity.mjs","utf8");
 assert.match(s,/NOT INDEXED/u);
 assert.match(s,/INDEXED BY/u);
 assert.match(s,/GROUP BY category/u);
 assert.match(s,/PRAGMA foreign_key_check/u);
 assert.match(s,/PRAGMA quick_check/u);
 assert.match(s,/stage2_authorized:false/u);
 assert.doesNotMatch(s,/unlinkSync|d1 migrations apply|B2_ARCHIVE_READ_KEY|SIGNING_JWK/u);
});

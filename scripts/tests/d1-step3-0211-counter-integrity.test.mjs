import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {auditStep30211WithoutRowidCounter} from "../lib/d1-step3-0211-counter-integrity.mjs";

function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(`
 CREATE TABLE ingestion_spool_queue(
  record_id TEXT PRIMARY KEY NOT NULL,d1_committed_at TEXT
 );
 CREATE TABLE p0b_committed_day_totals(
  day_utc TEXT PRIMARY KEY NOT NULL,
  committed_count INTEGER NOT NULL DEFAULT 0 CHECK(committed_count>=0)
 ) WITHOUT ROWID;
 INSERT INTO ingestion_spool_queue VALUES
 ('first','2026-11-09T12:00:00.000Z'),
 ('second','2026-11-09T12:01:00.000Z'),
 ('third','2026-11-08T22:00:00.000Z'),
 ('uncommitted',NULL);
 INSERT INTO p0b_committed_day_totals VALUES
 ('2026-11-09',2),('2026-11-08',1);
 `);
 return db;
}
function reader(db,override=(sql,rows)=>rows){
 return (sql,maxRows)=>{
  assert.ok(Number.isSafeInteger(maxRows)&&maxRows>=1&&maxRows<=3001);
  assert.match(sql,/^(?:SELECT |EXPLAIN QUERY PLAN SELECT |PRAGMA )/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|VACUUM|REPLACE)\b/i);
  const rows=override(sql,db.prepare(sql).all());
  assert.ok(rows.length<=maxRows);
  return rows;
 };
}
test("real SQLite WITHOUT ROWID has PK scan (not covering index wording) and nonvacuous 0211 proof",()=>{
 const db=database();
 try{
  const q=reader(db);
  const result=auditStep30211WithoutRowidCounter(q);
  assert.equal(result.status,"PASS_D1_0211_WITHOUT_ROWID_PK_QUICK_FK_UNIQUE_COUNTER_PARITY");
  assert.equal(result.counter_days_compared,2);
  assert.equal(result.canonical_committed_rows,3);
  assert.equal(result.sqlite_full_integrity_check_claimed,false);
  assert.equal(result.canary_promoted,false);
  assert.equal(result.stage2_authorized,false);
  assert.equal(result.private_rows_or_digests_emitted,false);
  assert.doesNotMatch(JSON.stringify(result),/2026-11-09|first|second|record_id/);
 }finally{db.close()}
});
test("WITHOUT ROWID empty structural verification does not yield signed or commercial PASS",()=>{
 const db=database();
 try{
  db.exec("DELETE FROM ingestion_spool_queue; DELETE FROM p0b_committed_day_totals;");
  const r=auditStep30211WithoutRowidCounter(reader(db));
  assert.equal(r.status,"OBSERVED_EMPTY_COUNTER_NO_NONVACUOUS_SOURCE");
  assert.equal(r.nonvacuous_source_ledger_proven,false);
  assert.equal(r.source_ledger_backfill_proof_required,true);
  assert.equal(r.stage2_authorized,false);
 }finally{db.close()}
});
test("fail closed if underlying canonical committed source diverges from maintained counter",()=>{
 const db=database();
 try{
  db.exec("UPDATE p0b_committed_day_totals SET committed_count=10 WHERE day_utc='2026-11-09'");
  assert.throws(()=>auditStep30211WithoutRowidCounter(reader(db)),/PER_DAY_CANONICAL_COUNTER_MISMATCH/);
 }finally{db.close()}
});
test("corrupt per-day values with unchanged total still fail exact source parity",()=>{
 const db=database();
 try{
  db.exec("UPDATE p0b_committed_day_totals SET committed_count=1 WHERE day_utc='2026-11-09'");
  db.exec("UPDATE p0b_committed_day_totals SET committed_count=2 WHERE day_utc='2026-11-08'");
  const sum=db.prepare("SELECT SUM(committed_count) AS total FROM p0b_committed_day_totals").get();
  assert.equal(sum.total,3);
  assert.throws(()=>auditStep30211WithoutRowidCounter(reader(db)),
   /PER_DAY_CANONICAL_COUNTER_MISMATCH/);
 }finally{db.close()}
});
test("fail closed for corrupt PK metadata, missing PK or index row drift",()=>{
 const db=database();
 try{
  for(const mutate of [
   (sql,rows)=>sql.startsWith("PRAGMA index_list")?[]:rows,
   (sql,rows)=>sql.startsWith("PRAGMA index_xinfo")?
     rows.map((x,i)=>i===0?{...x,key:0}:x):rows,
   (sql,rows)=>sql.startsWith("PRAGMA quick_check")?[{quick_check:"bad"}]:rows,
   (sql,rows)=>sql.includes(" INDEXED BY ")&&!sql.startsWith("EXPLAIN")?
     rows.map((x,i)=>i===0?{...x,__audit_count:6}:x):rows,
   (sql,rows)=>sql.includes("NOT INDEXED")&&!sql.startsWith("EXPLAIN")?
     [...rows].slice(1):rows,
   (sql,rows)=>sql.startsWith("PRAGMA foreign_key_check")?
     [{table:"p0b_committed_day_totals",rowid:1}]:rows,
  ]){
   assert.throws(()=>auditStep30211WithoutRowidCounter(reader(db,mutate)));
  }
 }finally{db.close()}
});
test("pure 0211 proof contains no SQL mutations, production promotion or bypass",()=>{
 const file=readFileSync("scripts/lib/d1-step3-0211-counter-integrity.mjs","utf8");
 assert.match(file,/WITHOUT ROWID/);
 assert.match(file,/PRAGMA quick_check/);
 assert.match(file,/PRAGMA foreign_key_check/);
 assert.match(file,/INDEXED BY/);
 assert.match(file,/source_committed/);
 assert.doesNotMatch(file,/\bwrangler\s+(?:deploy|d1\s+migrations\s+apply)\b/);
});

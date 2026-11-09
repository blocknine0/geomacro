import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {auditStep30212ExactPartialIndex} from "../lib/d1-step3-0212-partial-index-integrity.mjs";

function sample(){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE phase2h_private_raw_news("+
  "record_id TEXT PRIMARY KEY NOT NULL,"+
  "first_ingested_at TEXT NOT NULL,category TEXT NOT NULL,"+
  "b2_object_sha256 TEXT,risk_country_iso3 TEXT);"+
  "CREATE INDEX IF NOT EXISTS idx_phase2h_pending_recent_ingested_category "+
  "ON phase2h_private_raw_news(first_ingested_at,category) "+
  "WHERE b2_object_sha256 IS NULL;"+
  "CREATE INDEX IF NOT EXISTS idx_phase2h_risk_country_unindexed_recent "+
  "ON phase2h_private_raw_news(first_ingested_at,record_id) "+
  "WHERE risk_country_iso3 IS NULL;"+
  "INSERT INTO phase2h_private_raw_news VALUES"+
  "('"+ "a".repeat(64) +"','2026-11-09T12:00:00Z','geopolitics',NULL,NULL),"+
  "('"+ "b".repeat(64) +"','2026-11-09T12:01:00Z','macro','acked','USA');");
 return db;
}
function q(db,modify=(sql,rows)=>rows){
 return (sql,cap)=>{
  assert.ok(Number.isSafeInteger(cap)&&cap>=1&&cap<=3001);
  assert.match(sql,/^(?:SELECT |EXPLAIN QUERY PLAN SELECT |PRAGMA )/u);
  const rows=modify(sql,db.prepare(sql).all());
  assert.ok(rows.length<=cap);
  return rows;
 };
}
test("real partial SQLite index requires predicate and USING INDEX, not a covering index",()=>{
 const db=sample();
 try{
  const plan=db.prepare(
   "EXPLAIN QUERY PLAN SELECT rowid,first_ingested_at,category FROM "+
   "phase2h_private_raw_news INDEXED BY idx_phase2h_pending_recent_ingested_category "+
   "WHERE b2_object_sha256 IS NULL").all();
  assert.ok(plan.some(r=>r.detail.includes(
   "USING INDEX idx_phase2h_pending_recent_ingested_category")));
  const r=auditStep30212ExactPartialIndex(q(db));
  assert.equal(r.status,"PASS_D1_0212_BOTH_REVIEWED_PARTIAL_PREDICATE_INDEX_PARITY");
  assert.equal(r.reviewed_partial_index_count,2);
  assert.equal(r.secondary_partial_index_proof.qualified_rows_verified,1);
  assert.equal(r.qualified_rows_verified,1);
  assert.equal(r.nonvacuous_index_membership_proven,true);
  assert.equal(r.canary_promoted,false);
  assert.equal(r.sqlite_integrity_check_claimed,false);
  assert.equal(r.raw_rows_or_digest_emitted,false);
  assert.doesNotMatch(JSON.stringify(r),/2026-11-09T12|__audit_rowid|__audit_key|"record_id"/);
 }finally{db.close()}
});
test("no qualified rows is explicitly not nonvacuous index membership proof",()=>{
 const db=sample();
 try{
  db.exec("UPDATE phase2h_private_raw_news SET b2_object_sha256='archived'");
  const p=auditStep30212ExactPartialIndex(q(db));
  assert.equal(p.status,"OBSERVED_AT_LEAST_ONE_REVIEWED_PARTIAL_INDEX_EMPTY");
  assert.equal(p.secondary_partial_index_proof.qualified_rows_verified,1);
  assert.equal(p.nonvacuous_index_membership_proven,false);
  assert.equal(p.stage2_authorized,false);
 }finally{db.close()}
});
test("predicate schema mismatch, missing index, and query-plan drift all fail closed",()=>{
 const db=sample();
 try{
  for(const mutate of [
   (s,r)=>s.startsWith("SELECT name,type,sql FROM sqlite_schema")?
      r.map(x=>({...x,sql:x.sql.replace("IS NULL","IS NOT NULL")})):r,
   (s,r)=>s.startsWith("PRAGMA index_list")?[]:r,
   (s,r)=>s.startsWith("PRAGMA index_xinfo")?
      r.map(x=>x.key===1?{...x,coll:"NOCASE"}:x):r,
   (s,r)=>s.startsWith("PRAGMA quick_check")?[{quick_check:"bad"}]:r,
   (s,r)=>s.includes("EXPLAIN QUERY PLAN")&&s.includes("INDEXED BY")?
      [{detail:"SCAN phase2h_private_raw_news"}]:r,
   (s,r)=>s.startsWith("SELECT rowid")&&s.includes("INDEXED BY")?
      r.map(x=>({...x,__audit_key_1:"rare_earth"})):r,
  ]){
   assert.throws(()=>auditStep30212ExactPartialIndex(q(db,mutate)));
  }
 }finally{db.close()}
});
test("unreviewed additional partial index never inherits this one-index exemption",()=>{
 const db=sample();
 try{
  db.exec("CREATE INDEX idx_unreviewed_extra ON phase2h_private_raw_news(category) WHERE b2_object_sha256 IS NOT NULL");
  assert.throws(()=>auditStep30212ExactPartialIndex(q(db)),/PARTIAL_INDEX_REGISTRY_OR_ADDITIONAL_PREDICATE_UNVERIFIED/);
 }finally{db.close()}
});
test("second reviewed NULL-country index cannot be silently skipped or altered",()=>{
 const db=sample();
 try{
  for(const mutation of [
   (sql,r)=>sql.includes("idx_phase2h_risk_country_unindexed_recent")&&
     sql.startsWith("SELECT name,type,sql")?
      r.map(x=>({...x,sql:x.sql.replace("IS NULL","IS NOT NULL")})):r,
   (sql,r)=>sql.startsWith("PRAGMA index_xinfo")&&
     sql.includes("idx_phase2h_risk_country_unindexed_recent")?
      r.map(x=>x.key===1?{...x,coll:"NOCASE"}:x):r,
   (sql,r)=>sql.startsWith("SELECT rowid")&&
     sql.includes("INDEXED BY")&&sql.includes("idx_phase2h_risk_country_unindexed_recent")?
      r.map(x=>({...x,__audit_key_1:"0".repeat(64)})):r,
  ])assert.throws(()=>auditStep30212ExactPartialIndex(q(db,mutation)));
 }finally{db.close()}
});
test("no mutation nor 0212 schema deployment in the pure index auditor",()=>{
 const s=readFileSync("scripts/lib/d1-step3-0212-partial-index-integrity.mjs","utf8");
 assert.match(s,/WHERE/);
 assert.match(s,/INDEXED BY/);
 assert.match(s,/PRAGMA foreign_key_check/);
 assert.match(s,/PRAGMA quick_check/);
 assert.doesNotMatch(s,/\bwrangler\s+d1\s+migrations\s+apply\b/);
});

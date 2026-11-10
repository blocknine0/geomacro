import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {auditStep30212AllRawSourceIndexes}
 from "../lib/d1-step3-0212-source-index-integrity.mjs";

const A="a".repeat(64),B="b".repeat(64);
function sample(){
 const d=new DatabaseSync(":memory:");
 d.exec("CREATE TABLE phase2h_private_raw_news ("+
  "record_id TEXT PRIMARY KEY NOT NULL, category TEXT NOT NULL,"+
  "original_published_at TEXT NOT NULL,first_ingested_at TEXT NOT NULL,"+
  "b2_object_sha256 TEXT,risk_country_iso3 TEXT);"+
  "CREATE INDEX idx_phase2h_unarchived ON phase2h_private_raw_news"+
  "(b2_object_sha256,first_ingested_at,record_id);"+
  "CREATE INDEX idx_phase2h_native_category ON phase2h_private_raw_news"+
  "(category,original_published_at DESC);"+
  "CREATE INDEX idx_phase2h_retention_first_ingested ON phase2h_private_raw_news"+
  "(first_ingested_at,record_id);"+
  "CREATE INDEX idx_phase2h_risk_country_category_clock ON phase2h_private_raw_news"+
  "(risk_country_iso3,category,original_published_at DESC,record_id DESC);"+
  "CREATE INDEX idx_phase2h_pending_recent_ingested_category ON phase2h_private_raw_news"+
  "(first_ingested_at,category) WHERE b2_object_sha256 IS NULL;"+
  "CREATE INDEX idx_phase2h_risk_country_unindexed_recent ON phase2h_private_raw_news"+
  "(first_ingested_at,record_id) WHERE risk_country_iso3 IS NULL;");
 d.prepare("INSERT INTO phase2h_private_raw_news VALUES(?,?,?,?,?,?)").run(
  A,"geopolitics","2026-11-09T12:00:00Z","2026-11-09T12:01:00Z",null,null);
 d.prepare("INSERT INTO phase2h_private_raw_news VALUES(?,?,?,?,?,?)").run(
  B,"macro","2026-11-09T12:10:00Z","2026-11-09T12:12:00Z","1".repeat(64),"USA");
 return d;
}
function query(db,change=(sql,rows)=>rows){
 return (sql,cap)=>{
  assert.ok(Number.isSafeInteger(cap)&&cap>0&&cap<=3001);
  assert.match(sql,/^(?:SELECT |PRAGMA |EXPLAIN QUERY PLAN SELECT )/u);
  assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|ALTER|REINDEX)\b/iu);
  const rows=change(sql,db.prepare(sql).all());
  assert.ok(rows.length<=cap);
  return rows;
 };
}
test("real SQLite seven-index complete membership and two exact partial predicates",()=>{
 const db=sample();
 try{
  const r=auditStep30212AllRawSourceIndexes(query(db));
  assert.equal(r.status,"PASS_0212_ALL_SEVEN_SOURCE_FULL_AND_PARTIAL_INDEX_KEYS");
  assert.equal(r.index_count,7);
  assert.equal(r.full_index_count,5);
  assert.equal(r.reviewed_partial_index_count,2);
  assert.equal(r.full_index_proofs.length,5);
  assert.ok(r.full_index_proofs.every(x=>x.compared_rows===2));
  assert.equal(r.partial_index_proof.reviewed_partial_index_count,2);
  assert.equal(r.raw_source_has_rows,true);
  assert.equal(r.canary_promoted,false);
  assert.equal(r.private_rows_or_digest_exposed,false);
  assert.doesNotMatch(JSON.stringify(r),/2026-11-09T12|raw_sha256|__audit_rowid/);
 }finally{db.close()}
});
test("11,822-row source passes exact complete forced-index and both partial membership proof",()=>{
 const db=sample();
 try{
  const insert=db.prepare("INSERT INTO phase2h_private_raw_news VALUES(?,?,?,?,?,?)");
  db.exec("BEGIN");
  for(let i=2;i<11822;i++){
   insert.run(i.toString(16).padStart(64,"0"),i%2?"macro":"geopolitics",
    "2026-11-09T12:00:00Z","2026-11-09T12:03:00Z",
    i%4===0?"f".repeat(64):null,i%3===0?"USA":null);
  }
  db.exec("COMMIT");
  const largeReader=(sql,cap)=>{
   assert.ok(Number.isSafeInteger(cap)&&cap>0&&cap<=3001);
   const rows=db.prepare(sql).all();
   assert(rows.length<=cap);
   return rows;
  };
  const proof=auditStep30212AllRawSourceIndexes(largeReader);
  assert.equal(proof.status,"PASS_0212_ALL_SEVEN_SOURCE_FULL_AND_PARTIAL_INDEX_KEYS");
  assert.equal(proof.full_index_proofs.length,5);
  assert(proof.full_index_proofs.every(x=>x.compared_rows===11822));
  assert(proof.partial_index_proof.qualified_rows_verified>3000);
  assert.equal(proof.private_rows_or_digest_exposed,false);
  assert.equal(proof.production_release_authorized,false);
 }finally{db.close()}
});

test("large raw source still requires real D1 quick_check and foreign key proof",()=>{
 const db=sample();
 try{
  const ins=db.prepare("INSERT INTO phase2h_private_raw_news VALUES(?,?,?,?,?,?)");
  db.exec("BEGIN");
  for(let i=2;i<3100;i++)
   ins.run(i.toString(16).padStart(64,"0"),"macro",
    "2026-11-09T12:00:00Z","2026-11-09T12:03:00Z",null,null);
  db.exec("COMMIT");
  for(const mutate of [
   (sql,rows)=>sql.startsWith("PRAGMA quick_check(")?
    [{quick_check:"corrupt"}]:rows,
   (sql,rows)=>sql.startsWith("PRAGMA foreign_key_check(")?
    [{table:"phase2h_private_raw_news",rowid:1}]:rows
  ]){
   assert.throws(()=>auditStep30212AllRawSourceIndexes((sql,cap)=>{
    const rows=mutate(sql,db.prepare(sql).all());
    assert(rows.length<=cap);
    return rows;
   }),/LARGE_D1_QUICK_CHECK_NOT_OK|LARGE_D1_FOREIGN_KEYS_UNVERIFIED/);
  }
 }finally{db.close()}
});

test("empty source has reviewed schema but cannot become nonvacuous signed evidence",()=>{
 const db=sample();
 try{
  db.exec("DELETE FROM phase2h_private_raw_news");
  const r=auditStep30212AllRawSourceIndexes(query(db));
  assert.equal(r.status,"OBSERVED_0212_SOURCE_EMPTY_OR_PARTIAL_PREDICATE_UNPOPULATED");
  assert.equal(r.raw_source_has_rows,false);
  assert.equal(r.fully_nonvacuous_data_memberships_proven,false);
  assert.equal(r.source_rights_proven_by_this_step,false);
  assert.equal(r.production_release_authorized,false);
 }finally{db.close()}
});
test("refuse any of the exact seven index names missing or additional unknown partial",()=>{
 const db=sample();
 try{
  db.exec("DROP INDEX idx_phase2h_unarchived");
  assert.throws(()=>auditStep30212AllRawSourceIndexes(query(db)),
   /SEVEN_REVIEWED_FULL_AND_PARTIAL_INDEX_REGISTRY_DRIFT/);
  db.exec("CREATE INDEX idx_phase2h_unarchived ON phase2h_private_raw_news"+
   "(b2_object_sha256,first_ingested_at,record_id)");
  db.exec("CREATE INDEX idx_fake_predicate ON phase2h_private_raw_news(category)"+
   " WHERE b2_object_sha256 IS NOT NULL");
  assert.throws(()=>auditStep30212AllRawSourceIndexes(query(db)),
   /SEVEN_REVIEWED_FULL_AND_PARTIAL_INDEX_REGISTRY_DRIFT/);
 }finally{db.close()}
});
test("tampered full source index membership or quick/FK metadata rejects",()=>{
 const db=sample();
 try{
  for(const change of [
   (sql,rows)=>sql.startsWith("SELECT rowid")&&sql.includes("INDEXED BY")&&
     sql.includes("idx_phase2h_unarchived")?
     rows.map((r,i)=>i===0?{...r,__audit_key_0:"tampered"}:r):rows,
   (sql,rows)=>sql.startsWith("PRAGMA quick_check")?[{quick_check:"broken"}]:rows,
   (sql,rows)=>sql.startsWith("PRAGMA foreign_key_check")?
     [{table:"phase2h_private_raw_news",rowid:1}]:rows,
  ]){
   assert.throws(()=>auditStep30212AllRawSourceIndexes(query(db,change)));
  }
 }finally{db.close()}
});
test("no SQL mutation and no bypass in source proof",()=>{
 const s=readFileSync("scripts/lib/d1-step3-0212-source-index-integrity.mjs","utf8");
 assert.match(s,/auditStep30212ExactPartialIndex/u);
 assert.match(s,/verifyStep3AllIndex/u);
 assert.match(s,/seven|SEVEN/u);
 assert.match(s,/stage|production_release_authorized:false/u);
 assert.doesNotMatch(s,/wrangler.*deploy|d1 migrations apply|SIGNING_JWK|unlinkSync/u);
});

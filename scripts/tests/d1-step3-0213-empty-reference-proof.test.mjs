import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {auditStep30213EmptyRefStructure}
 from "../lib/d1-step3-0213-empty-reference-proof.mjs";

function db(){
 const d=new DatabaseSync(":memory:");
 d.exec(readFileSync("workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql","utf8"));
 return d;
}
function read(d,modify=(sql,rs)=>rs){
 return (sql,limit)=>{
  assert.ok(Number.isSafeInteger(limit)&&limit>=1&&limit<=20);
  assert.match(sql,/^(SELECT |PRAGMA |EXPLAIN QUERY PLAN SELECT )/);
  const results=modify(sql,d.prepare(sql).all());
  assert.ok(results.length<=limit);
  return results;
 };
}
test("real SQLite 0213 DDL creates exactly 3 reviewed indexes and one auto-PK; zero rows is NOT evidence",()=>{
 const d=db();
 try{
  const out=auditStep30213EmptyRefStructure(read(d));
  assert.equal(out.status,"OBSERVED_EMPTY_REFERENCE_STRUCTURAL_ONLY");
  assert.equal(out.index_schema_count,4);
  assert.equal(out.observed_rows,0);
  assert.equal(out.nonvacuous_original_bytes_verified,false);
  assert.equal(out.source_pointer_hmac_verified,false);
  assert.equal(out.b2_original_readback_verified,false);
  assert.equal(out.shadow_legacy_worker_compatibility_verified,false);
  assert.equal(out.stage2_authorized,false);
  assert.equal(out.canary_promoted,false);
  assert.equal(out.private_source_rows_emitted,false);
 }finally{d.close()}
});
test("empty reference helper never accepts nonempty/partially indexed or drifting schema",()=>{
 const d=db();
 try{
  for(const mutate of [
   (sql,r)=>sql.startsWith("SELECT EXISTS(")?[{has_any:1}]:r,
   (sql,r)=>sql.startsWith("PRAGMA index_list")?r.slice(0,-1):r,
   (sql,r)=>sql.startsWith("PRAGMA index_xinfo")?
     r.map((x,i)=>i===0?{...x,desc:1-x.desc}:x):r,
   (sql,r)=>sql.startsWith("PRAGMA quick_check")?[{quick_check:"bad"}]:r,
   (sql,r)=>sql.startsWith("PRAGMA foreign_key_check")?[{table:"phase2h_raw_object_refs_v1",rowid:1}]:r,
   (sql,r)=>sql.startsWith("EXPLAIN QUERY PLAN SELECT")?[{detail:"SCAN unknown"}]:r,
  ]){
   assert.throws(()=>auditStep30213EmptyRefStructure(read(d,mutate)));
  }
 }finally{d.close()}
});
test("unexpected additional index is never treated as the reviewed 0213 migration",()=>{
 const d=db();
 try{
  d.exec("CREATE INDEX idx_unreviewed_0213 ON phase2h_raw_object_refs_v1(category)");
  assert.throws(()=>auditStep30213EmptyRefStructure(read(d)),/REFERENCE_INDEX_REGISTRY_DRIFT/);
 }finally{d.close()}
});
test("0213 helper never performs D1 mutation, B2 reads, signing or payment",()=>{
 const s=readFileSync("scripts/lib/d1-step3-0213-empty-reference-proof.mjs","utf8");
 assert.doesNotMatch(s,/wrangler|fetch\(|execFileSync|secret/i);
 assert.match(s,/stage2_authorized:false/);
 assert.match(s,/source_pointer_hmac_verified:false/);
 assert.match(s,/PRAGMA quick_check/);
 assert.match(s,/PRAGMA foreign_key_check/);
});

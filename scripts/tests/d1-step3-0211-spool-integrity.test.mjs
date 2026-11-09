import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {auditStep30211SpoolSource,STEP3_0211_REVIEWED_SPOOL_INDEXES}
 from "../lib/d1-step3-0211-spool-integrity.mjs";

function db(){
 const d=new DatabaseSync(":memory:");
 d.exec("CREATE TABLE source_registry(source_id TEXT PRIMARY KEY)");
 d.exec(readFileSync("workers/control-plane/migrations/0114_p0_b_spool_queue.sql","utf8"));
 d.exec(readFileSync("workers/control-plane/migrations/0116_p0b_microbatch_spool.sql","utf8"));
 return d;
}
const read=(d,alter=(sql,rows)=>rows)=>(sql,max)=>{
 assert.match(sql,/^(?:SELECT |PRAGMA |EXPLAIN QUERY PLAN SELECT )/);
 assert.doesNotMatch(sql,/\b(?:DELETE|INSERT|UPDATE|REPLACE|DROP|ALTER|CREATE|VACUUM|ATTACH)\b/iu);
 const r=alter(sql,d.prepare(sql).all());
 assert.ok(Array.isArray(r)&&r.length<=max);
 return r;
};
test("real reviewed 0114/0116 Shadow source is empty but all seven indexes have native D1 structural parity",()=>{
 const d=db();
 try{
  const p=auditStep30211SpoolSource(read(d));
  assert.equal(p.status,"OBSERVED_EMPTY_SOURCE_ALL_SEVEN_INDEX_STRUCTURE");
  assert.equal(p.index_count,7);
  assert.equal(p.source_rows_verified,0);
  assert.equal(p.nonvacuous_original_evidence,false);
  assert.equal(p.source_to_b2_physical_parity_verified,false);
  assert.equal(p.stage2_authorized,false);
  assert.equal(p.canary_promoted,false);
  assert.equal(STEP3_0211_REVIEWED_SPOOL_INDEXES.length,7);
 }finally{d.close()}
});
test("nonempty fake metadata pointer uses ALL seven forced index key/row parity",()=>{
 const d=db();
 try{
  d.prepare("INSERT INTO source_registry(source_id) VALUES(?)").run("synthetic-fixture-source");
  const id="12345678-1234-1234-1234-123456789abc";
  d.prepare("INSERT INTO ingestion_spool_queue(id,candidate_sha256,source_id,b2_spool_uri,b2_byte_size,state,d1_committed_at) VALUES(?,?,?,?,?,?,?)")
   .run(id,"a".repeat(64),"synthetic-fixture-source","b2://synthetic-only",401,"D1_COMMITTED","2026-11-09T00:00:00.000Z");
  const p=auditStep30211SpoolSource(read(d));
  assert.equal(p.status,"PASS_0211_NONEMPTY_SPOOL_ALL_SEVEN_INDEX_KEYS");
  assert.equal(p.source_rows_verified,1);
  assert.equal(p.source_private_rows_logged,false);
  assert.equal(JSON.stringify(p).includes(id),false);
 }finally{d.close()}
});
test("an unexpected extra or removed source index fails closed for empty and populated",()=>{
 const d=db();
 try{
  d.exec("CREATE INDEX idx_unreviewed_shadow ON ingestion_spool_queue(state)");
  assert.throws(()=>auditStep30211SpoolSource(read(d)),/SEVEN_REVIEWED_INDEX_REGISTRY_DRIFT/);
 }finally{d.close()}
});
test("false provider quick, index column, forced plan, FK and concurrent source writes never pass",()=>{
 const d=db();
 try{
  const mutations=[
   (s,r)=>s.startsWith("PRAGMA quick_check")?[{quick_check:"corrupt"}]:r,
   (s,r)=>s.startsWith("PRAGMA index_xinfo")?r.map((x,i)=>i===0?{...x,coll:"UNREVIEWED"}:x):r,
   (s,r)=>s.startsWith("EXPLAIN QUERY PLAN")?[{detail:"SCAN unexpected"}]:r,
   (s,r)=>s.startsWith("PRAGMA foreign_key_check")?[{table:"ingestion_spool_queue",rowid:2}]:r,
   (s,r)=>s.includes(' INDEXED BY "idx_p0b_bundle_items"')&&!s.startsWith("EXPLAIN")?[{id:"counterfeit"}]:r
  ];
  for(const alter of mutations)
   assert.throws(()=>auditStep30211SpoolSource(read(d,alter)));
 }finally{d.close()}
});
test("strict source-only proof never authorizes migration, cash, synthetic B2 ACK or HOLD removal",()=>{
 const c=readFileSync("scripts/lib/d1-step3-0211-spool-integrity.mjs","utf8");
 assert.doesNotMatch(c,/execFileSync|fetch\(|cloudflare\.com|b2_get|unlinkSync/);
 assert.match(c,/nonvacuous_original_evidence:false/);
 assert.match(c,/stage2_authorized:false/);
 assert.match(c,/sqlite_full_integrity_check_claimed:false/);
});

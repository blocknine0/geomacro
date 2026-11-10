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
test("real 3500-row spool is proven by full-volume forced-index EXCEPT, not a truncated 3k sample",()=>{
 const d=db();
 try{
  d.prepare("INSERT INTO source_registry(source_id) VALUES(?)").run("test-source");
  const ins=d.prepare("INSERT INTO ingestion_spool_queue "+
   "(id,candidate_sha256,source_id,b2_spool_uri,b2_byte_size,state,d1_committed_at) "+
   "VALUES(?,?,?,?,?,?,?)");
  d.exec("BEGIN");
  for(let i=1;i<=3500;i++){
   const hex=i.toString(16).padStart(32,"0");
   const id=hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+
    "-"+hex.slice(16,20)+"-"+hex.slice(20,32);
   ins.run(id,i.toString(16).padStart(64,"0"),"test-source",
    "b2://synthetic-only",401,"D1_COMMITTED","2026-11-09T00:00:00.000Z");
  }
  d.exec("COMMIT");
  const p=auditStep30211SpoolSource(read(d));
  assert.equal(p.status,"PASS_0211_NONEMPTY_SPOOL_ALL_SEVEN_INDEX_KEYS");
  assert.equal(p.source_rows_verified,3500);
  assert.equal(p.index_count,7);
  assert.equal(p.stage2_authorized,false);
  assert.equal(p.canary_promoted,false);
  // Same genuine 3500-row fixture after reviewed 0206/0210 index changes:
  // prove every optimized index with full D1-side bidirectional EXCEPT.
  d.exec("DROP INDEX idx_spool_candidate_sha");
  d.exec(readFileSync("workers/control-plane/migrations/0210_p0b_immutable_source_fk_index.sql","utf8"));
  const optimized=auditStep30211SpoolSource(read(d));
  assert.equal(optimized.status,"PASS_0211_NONEMPTY_SPOOL_ALL_SIX_REVIEWED_INDEX_KEYS");
  assert.equal(optimized.index_count,6);
  assert.equal(optimized.source_rows_verified,3500);
  assert.equal(optimized.candidate_unique_autoindex_verified,true);
  assert.equal(optimized.source_private_rows_logged,false);
 }finally{d.close()}
});


test("genuine 0206/0210 optimized spool has exact six-index empty D1 structural proof",()=>{
 const d=db();
 try{
  const original=readFileSync("workers/control-plane/migrations/0206_d1_poll_index_write_relief.sql","utf8");
  assert.match(original,/DROP INDEX IF EXISTS idx_spool_candidate_sha;/u);
  const immutable=readFileSync("workers/control-plane/migrations/0210_p0b_immutable_source_fk_index.sql","utf8");
  assert.match(immutable,/DROP INDEX IF EXISTS idx_spool_source_id;/u);
  assert.match(immutable,/CREATE INDEX idx_spool_source_id ON ingestion_spool_queue\(source_id\);/u);
  d.exec("DROP INDEX idx_spool_candidate_sha");
  d.exec(immutable);
  const a=auditStep30211SpoolSource(read(d));
  assert.equal(a.status,"OBSERVED_EMPTY_SOURCE_ALL_SIX_REVIEWED_INDEX_STRUCTURE");
  assert.equal(a.index_count,6);
  assert.equal(a.reviewed_index_profile,"0206_0210_SIX_INDEX_IMMUTABLE_SOURCE");
  assert.equal(a.candidate_unique_autoindex_verified,true);
  assert.equal(a.redundant_candidate_index_present,false);
  assert.equal(a.source_rows_verified,0);
  assert.equal(a.nonvacuous_original_evidence,false);
  assert.equal(a.stage2_authorized,false);
  assert.equal(a.canary_promoted,false);
  assert.equal(STEP3_0211_REVIEWED_SPOOL_INDEXES.length,7);
 }finally{d.close()}
});
test("real optimized six-index populated spool has complete D1 key/row parity, not fabricated original bytes",()=>{
 const d=db();
 try{
  d.exec("DROP INDEX idx_spool_candidate_sha");
  d.exec(readFileSync("workers/control-plane/migrations/0210_p0b_immutable_source_fk_index.sql","utf8"));
  d.prepare("INSERT INTO source_registry(source_id) VALUES(?)").run("optimized-source");
  d.prepare("INSERT INTO ingestion_spool_queue(id,candidate_sha256,source_id,b2_spool_uri,b2_byte_size,state,d1_committed_at) VALUES(?,?,?,?,?,?,?)")
   .run("12345678-1234-1234-1234-123456789abc",
    "f".repeat(64),"optimized-source","b2://fixture-only",401,
    "D1_COMMITTED","2026-11-09T00:00:00.000Z");
  const a=auditStep30211SpoolSource(read(d));
  assert.equal(a.status,"PASS_0211_NONEMPTY_SPOOL_ALL_SIX_REVIEWED_INDEX_KEYS");
  assert.equal(a.index_count,6);
  assert.equal(a.source_rows_verified,1);
  assert.equal(a.reviewed_index_profile,"0206_0210_SIX_INDEX_IMMUTABLE_SOURCE");
  assert.equal(a.candidate_unique_autoindex_verified,true);
  assert.equal(a.source_private_rows_logged,false);
 }finally{d.close()}
});
test("reviewed intermediate 0206 six-index state retains exact legacy FK DDL",()=>{
 const d=db();
 try{
  d.exec("DROP INDEX idx_spool_candidate_sha");
  const p=auditStep30211SpoolSource(read(d));
  assert.equal(p.reviewed_index_profile,"0206_SIX_INDEX_LEGACY_SOURCE");
  assert.equal(p.index_count,6);
  assert.equal(p.candidate_unique_autoindex_verified,true);
 }finally{d.close()}
});
test("same-name wrong source index DDL and candidate identity tamper must not PASS",()=>{
 const d=db();
 try{
  d.exec("DROP INDEX idx_spool_source_id");
  d.exec("CREATE INDEX idx_spool_source_id ON ingestion_spool_queue(state,source_id)");
  assert.throws(()=>auditStep30211SpoolSource(read(d)),
   /SOURCE_FK_INDEX_DDL_UNVERIFIED/u);
  d.exec("DROP INDEX idx_spool_source_id");
  d.exec("CREATE INDEX idx_spool_source_id ON ingestion_spool_queue(source_id,state)");
  d.exec("DROP INDEX idx_spool_candidate_sha");
  assert.throws(()=>auditStep30211SpoolSource(read(d,(sql,rows)=>
   sql==='PRAGMA index_xinfo("sqlite_autoindex_ingestion_spool_queue_2")'?
    rows.map(x=>x.key===1?{...x,name:"forged_candidate"}:x):rows)),
   /CANDIDATE_AND_PK_AUTO_UNIQUE_KEYS_UNVERIFIED/u);
  // 7 physical indexes with a post-0210 source-only FK index is not a
  // valid 0206-before-0210 migration ordering.
  d.exec("CREATE INDEX idx_spool_candidate_sha ON ingestion_spool_queue(candidate_sha256)");
  d.exec("DROP INDEX idx_spool_source_id");
  d.exec("CREATE INDEX idx_spool_source_id ON ingestion_spool_queue(source_id)");
  assert.throws(()=>auditStep30211SpoolSource(read(d)),
   /SOURCE_FK_NATIVE_INDEX_LINEAGE_UNVERIFIED/u);
 }finally{d.close()}
});

test("an unexpected extra or removed source index fails closed for empty and populated",()=>{
 const d=db();
 try{
  d.exec("CREATE INDEX idx_unreviewed_shadow ON ingestion_spool_queue(state)");
  assert.throws(()=>auditStep30211SpoolSource(read(d)),/REVIEWED_INDEX_REGISTRY_DRIFT/);
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

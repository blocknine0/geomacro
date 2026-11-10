import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {auditStep3AllIndexesSet,step3BuildIndexSetSQL,
 verifyStep3IndexSetResult,STEP3_SET_MAX_SOURCE_ROWS,
 step3BuildIndexJoinSQL,verifyStep3IndexJoinResult,
 auditStep3AllIndexesJoin}
 from "../lib/d1-step3-large-index-set-proof.mjs";
const read=d=>(sql,max)=>{
 assert.match(sql,/^(?:SELECT |PRAGMA |EXPLAIN QUERY PLAN SELECT )/);
 const a=d.prepare(sql).all();
 assert(a.length<=max);
 return a;
};
test("real SQLite verifies every source row >3k against ALL forced index keys",()=>{
 const d=new DatabaseSync(":memory:");
 try{
  d.exec("CREATE TABLE items(id TEXT UNIQUE NOT NULL,category TEXT,ts TEXT);"+
   "CREATE INDEX idx_items_cat_clock ON items(category,ts DESC)");
  const insert=d.prepare("INSERT INTO items(id,category,ts) VALUES(?,?,?)");
  d.exec("BEGIN");
  for(let i=0;i<4001;i++)insert.run(String(i),i%2?"macro":"geopolitics",
   "2026-11-10T"+String(i%24).padStart(2,"0")+":00:00Z");
  d.exec("COMMIT");
  const proof=auditStep3AllIndexesSet("items",read(d));
  assert.equal(proof.total_existing_indexes,2);
  assert.equal(proof.full_source_row_count_observed,4001);
  assert(proof.index_proofs.every(x=>x.rows_compared===4001));
  assert.equal(proof.cross_index_transactional_snapshot_proven,false);
  assert.equal(proof.physical_file_integrity_claimed,false);
  assert.equal(JSON.stringify(proof).includes("geopolitics"),false);
 }finally{d.close()}
});
test("partial predicate index projection yields exact aggregate-only EXCEPT set",()=>{
 const d=new DatabaseSync(":memory:");
 try{
  d.exec("CREATE TABLE phase2h_private_raw_news(category TEXT,"+
   "first_ingested_at TEXT,b2_object_sha256 TEXT);"+
   "CREATE INDEX idx_phase2h_pending_recent_ingested_category ON "+
   "phase2h_private_raw_news(first_ingested_at,category) "+
   "WHERE b2_object_sha256 IS NULL");
  const ins=d.prepare("INSERT INTO phase2h_private_raw_news VALUES(?,?,?)");
  d.exec("BEGIN");
  for(let i=0;i<3250;i++)ins.run("macro","2026-11-10T00:00:00Z",
   i%3===0?"f".repeat(64):null);
  d.exec("COMMIT");
  const sql=step3BuildIndexSetSQL({
   table:"phase2h_private_raw_news",
   index:"idx_phase2h_pending_recent_ingested_category",
   predicate:'"b2_object_sha256" IS NULL',
   columns:[{name:"first_ingested_at",coll:"BINARY"},{name:"category",coll:"BINARY"}]
  });
  const cnt=read(d)(sql.bounded,1)[0].n;
  assert(cnt>2000);
  assert.equal(verifyStep3IndexSetResult(read(d)(sql.equality,1),
   {sourceRows:cnt}).complete_set_membership,true);
 }finally{d.close()}
});
test("missing index row, false zero and changed source count cannot claim PASS",()=>{
 const good=[{canonical_minus_index:0,index_minus_canonical:0,
  canonical_rows:4100,index_rows:4100}];
 assert.equal(verifyStep3IndexSetResult(good,{sourceRows:4100}).verified_rows,4100);
 for(const row of [
  {...good[0],canonical_minus_index:1},
  {...good[0],index_minus_canonical:1},
  {...good[0],index_rows:4099},
  {...good[0],canonical_rows:4101}
 ])assert.throws(()=>verifyStep3IndexSetResult([row],{sourceRows:4100}),
  /COMPLETE_SET_MEMBERSHIP_OR_CONCURRENT_COUNT_UNVERIFIED/);
 assert.throws(()=>verifyStep3IndexSetResult(good,{sourceRows:4101}),
  /COMPLETE_SET_MEMBERSHIP_OR_CONCURRENT_COUNT_UNVERIFIED/);
 assert.throws(()=>verifyStep3IndexSetResult(good,{sourceRows:STEP3_SET_MAX_SOURCE_ROWS+1}),
  /COMPLETE_SET_MEMBERSHIP_OR_CONCURRENT_COUNT_UNVERIFIED/);
});
test("SQL injection and unreviewed partial predicate remain HOLD",()=>{
 const input={table:"phase2h_private_raw_news",
  index:"idx_phase2h_pending_recent_ingested_category",
  columns:[{name:"category",coll:"BINARY"}]};
 assert.throws(()=>step3BuildIndexSetSQL({...input,
  predicate:'"category" IS NOT NULL'}),/UNREVIEWED_PARTIAL_PREDICATE/);
 assert.throws(()=>step3BuildIndexSetSQL({...input,
  table:"phase2h_private_raw_news;DROP TABLE source"}),/IDENTIFIER_INVALID/);
 assert.throws(()=>step3BuildIndexSetSQL({...input,
  columns:[{name:"category",coll:"UNREVIEWED"}]}),/INDEX_COLUMNS_INVALID/);
});


test("0211 covering-index ROWID join proves every key without full EXCEPT amplification",()=>{
 const d=new DatabaseSync(":memory:");
 try{
  d.exec("CREATE TABLE ingestion_spool_queue(id TEXT PRIMARY KEY,"+
   "candidate_sha256 TEXT UNIQUE NOT NULL,source_id TEXT,day_utc TEXT);"+
   "CREATE INDEX idx_spool_source_id ON ingestion_spool_queue(source_id,day_utc)");
  const ins=d.prepare("INSERT INTO ingestion_spool_queue VALUES(?,?,?,?)");
  d.exec("BEGIN");
  for(let i=1;i<=4001;i++)ins.run(String(i),i.toString(16).padStart(64,"0"),
   "source-"+(i%3),"2026-11-10");
  d.exec("COMMIT");
  let completeIndexJoins=0;
  const provider=(sql,max)=>{
   assert.doesNotMatch(sql,/\bEXCEPT\b/u);
   assert.match(sql,/^(?:SELECT |PRAGMA |EXPLAIN QUERY PLAN SELECT )/u);
   if(sql.includes("COUNT(DISTINCT i.rowid)"))completeIndexJoins++;
   const rows=d.prepare(sql).all();
   assert(rows.length<=max);
   return rows;
  };
  const proof=auditStep3AllIndexesJoin("ingestion_spool_queue",provider);
  assert.equal(proof.total_existing_indexes,3);
  assert.equal(proof.full_source_row_count_observed,4001);
  assert.equal(completeIndexJoins,3);
  assert.equal(proof.index_proofs.length,3);
  assert(proof.index_proofs.every(x=>x.rows_compared===4001&&
   x.proof_kind==="COMPLETE_FORCED_INDEX_ROWID_JOIN_AND_KEY_COMPARISON"));
  assert.equal(proof.cross_index_transactional_snapshot_proven,false);
  assert.equal(proof.physical_file_integrity_claimed,false);
  assert.equal(JSON.stringify(proof).includes("source-"),false);
 }finally{d.close()}
});
test("ROWID join rejects missing, duplicated and key-mismatched index members",()=>{
 const good=[{index_rows:4001,distinct_rowids:4001,mismatched_rows:0}];
 assert.equal(verifyStep3IndexJoinResult(good,{sourceRows:4001})
  .complete_set_membership,true);
 for(const forged of [
  {...good[0],index_rows:4000},
  {...good[0],distinct_rowids:4000},
  {...good[0],mismatched_rows:1},
  {...good[0],mismatched_rows:-1},
  {...good[0],mismatched_rows:"0"},
  {...good[0],index_rows:4002},
 ]){
  assert.throws(()=>verifyStep3IndexJoinResult([forged],{sourceRows:4001}),
   /COMPLETE_ROWID_AND_KEY_PARITY_UNVERIFIED/u);
 }
 assert.throws(()=>verifyStep3IndexJoinResult(good,{sourceRows:4002}),
  /COMPLETE_ROWID_AND_KEY_PARITY_UNVERIFIED/u);
 assert.throws(()=>auditStep3AllIndexesJoin("unreviewed",()=>[]),
  /JOIN_TABLE_NOT_REVIEWED/u);
 assert.throws(()=>step3BuildIndexJoinSQL({
  table:"ingestion_spool_queue",index:"idx_spool_source_id",
  columns:[{name:"source_id;DROP TABLE x",coll:"BINARY"}]
 }),/JOIN_INDEX_COLUMNS_INVALID/u);
});
test("ROWID join fails closed on forged provider plan, mismatch and FK/UNIQUE proof",()=>{
 const d=new DatabaseSync(":memory:");
 try{
  d.exec("CREATE TABLE ingestion_spool_queue(id TEXT PRIMARY KEY,"+
   "candidate_sha256 TEXT UNIQUE NOT NULL,source_id TEXT);"+
   "CREATE INDEX idx_source ON ingestion_spool_queue(source_id)");
  d.prepare("INSERT INTO ingestion_spool_queue VALUES(?,?,?)")
   .run("one","f".repeat(64),"source");
  const variants=[
   (s,r)=>s.startsWith("EXPLAIN QUERY PLAN SELECT")?[{detail:"SCAN table"}]:r,
   (s,r)=>s.includes("COUNT(DISTINCT i.rowid)")?
    [{index_rows:1,distinct_rowids:0,mismatched_rows:0}]:r,
   (s,r)=>s.startsWith("PRAGMA foreign_key_check")?
    [{table:"ingestion_spool_queue",rowid:1}]:r,
   (s,r)=>s.startsWith("PRAGMA quick_check")?[{quick_check:"bad"}]:r,
  ];
  for(const alter of variants)
   assert.throws(()=>auditStep3AllIndexesJoin(
    "ingestion_spool_queue",(sql,max)=>{
     const out=alter(sql,d.prepare(sql).all());
     assert(out.length<=max);return out;
    }));
 }finally{d.close()}
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {auditStep3AllIndexesSet,step3BuildIndexSetSQL,
 verifyStep3IndexSetResult,STEP3_SET_MAX_SOURCE_ROWS}
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

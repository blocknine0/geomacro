import test from "node:test";
import assert from "node:assert/strict";
import {phase2hAtomicBulkArchiveAck,assertPhase2hBulkArchiveAckReturning,
 MAX_D1_BULK_ARCHIVE_ACK} from "../lib/phase2h-atomic-bulk-archive-ack.mjs";
const sha=i=>i.toString(16).padStart(64,"0");
const rows=n=>Array.from({length:n},(_,i)=>({record_id:sha(i+1),raw_sha256:sha(i+9001)}));
const now=new Date("2026-11-04T08:00:00.000Z"),objectSha=sha(5555);
test("48 originals form exactly ONE all-or-none D1 UPDATE RETURNING statement within 100 parameter limit",()=>{
 assert.equal(MAX_D1_BULK_ARCHIVE_ACK,48);
 const items=rows(MAX_D1_BULK_ARCHIVE_ACK),plan=phase2hAtomicBulkArchiveAck(items,objectSha,now);
 assert.equal(plan.d1_statements,1);
 assert.equal(plan.count,48);
 assert.equal(plan.params.length,99);
 assert.ok(plan.params.length<=100);
 assert.equal(plan.params.at(-3),objectSha);
 assert.equal(plan.params.at(-2),now.toISOString());
 assert.equal(plan.params.at(-1),48);
 assert.equal(plan.sql.match(/\bUPDATE\b/gu).length,1);
 assert.equal(plan.sql.match(/\bRETURNING\b/gu).length,1);
 assert.match(plan.sql,/AS MATERIALIZED/gu);
 assert.match(plan.sql,/r\.record_id=e\.record_id AND r\.raw_sha256=e\.raw_sha256/u);
 assert.match(plan.sql,/AND \(SELECT total FROM eligible\)=\?/u);
 const result={results:items.map(x=>({...x,b2_object_sha256:objectSha}))};
 const receipt=assertPhase2hBulkArchiveAckReturning(result,items,objectSha);
 assert.equal(receipt.archived,48);
 assert.equal(receipt.d1_atomic_one_statement_returning_verified,true);
});
test("reject duplicate IDs, hash collision, missing rows and wrong B2 receipt",()=>{
 const x=rows(3);
 assert.throws(()=>phase2hAtomicBulkArchiveAck([x[0],x[0]],objectSha,now),
  /PHASE2H_BULK_ACK_IDENTITY_INVALID/);
 for(const n of [0,MAX_D1_BULK_ARCHIVE_ACK+1])
  assert.throws(()=>phase2hAtomicBulkArchiveAck(rows(n),objectSha,now),
   /PHASE2H_BULK_ACK_INPUT_INVALID/);
 assert.throws(()=>phase2hAtomicBulkArchiveAck(x,"bad",now),
  /PHASE2H_BULK_ACK_INPUT_INVALID/);
 assert.throws(()=>assertPhase2hBulkArchiveAckReturning({results:x.slice(0,2)},x,objectSha),
  /PHASE2H_BULK_ACK_ATOMIC_RETURNING_COUNT_MISMATCH/);
 assert.throws(()=>assertPhase2hBulkArchiveAckReturning({results:x.map(y=>({...y,b2_object_sha256:"f".repeat(64)}))},x,objectSha),
  /PHASE2H_BULK_ACK_ATOMIC_RETURNING_ID_HASH_MISMATCH/);
 assert.throws(()=>assertPhase2hBulkArchiveAckReturning({results:[...x.slice(0,2),x[0]].map(y=>({...y,b2_object_sha256:objectSha}))},x,objectSha),
  /PHASE2H_BULK_ACK_ATOMIC_RETURNING_ID_HASH_MISMATCH/);
});

test("real SQLite bounds ACK lookups by expected IDs and preserves atomic mismatch refusal",async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE phase2h_private_raw_news(record_id TEXT PRIMARY KEY,
 raw_sha256 TEXT,b2_object_sha256 TEXT,b2_archived_at TEXT,first_ingested_at TEXT);
 CREATE INDEX idx_phase2h_unarchived ON phase2h_private_raw_news
 (b2_object_sha256,first_ingested_at,record_id);`);
 const insert=db.prepare('INSERT INTO phase2h_private_raw_news VALUES(?,?,NULL,NULL,?)');
 db.exec('BEGIN');
 for(let i=1;i<=10000;i++)insert.run(sha(i),sha(i+9000),now.toISOString());
 db.exec('COMMIT');
 const execute=items=>{
  const p=phase2hAtomicBulkArchiveAck(items,objectSha,now);
  const details=db.prepare('EXPLAIN QUERY PLAN '+p.sql).all(...p.params).map(x=>x.detail).join('\n');
  assert.match(details,/USING INTEGER PRIMARY KEY/);
  assert.match(details,/USING INDEX sqlite_autoindex_phase2h_private_raw_news_1/);
  assert.doesNotMatch(details,/USING (?:COVERING )?INDEX idx_phase2h_unarchived/);
  return db.prepare(p.sql).all(...p.params);
 };
 try{
  assert.equal(execute(rows(48)).length,48);
  assert.equal(execute([{record_id:sha(49),raw_sha256:sha(9049)},
   {record_id:sha(50),raw_sha256:sha(999999)}]).length,0);
  assert.equal(execute([{record_id:sha(49),raw_sha256:sha(9049)},
   {record_id:sha(10001),raw_sha256:sha(19001)}]).length,0);
  assert.equal(execute([{record_id:sha(49),raw_sha256:sha(9049)},rows(1)[0]]).length,0);
  assert.equal(execute([{record_id:sha(49),raw_sha256:sha(9049)}]).length,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL').get().n,49);
 }finally{db.close()}
});

test("B2-first exact raw JSON is immutable, atomic, indexed, and limited to 32 three-param originals",async()=>{
 const {DatabaseSync}=await import("node:sqlite");
 const db=new DatabaseSync(":memory:");
 db.exec(`CREATE TABLE phase2h_private_raw_news(
  record_id TEXT PRIMARY KEY,raw_sha256 TEXT NOT NULL,
  raw_json TEXT NOT NULL,b2_object_sha256 TEXT,b2_archived_at TEXT);`);
 const native=row=>JSON.stringify({ingested_at:now.toISOString(),
  record_id:row.record_id,raw_sha256:row.raw_sha256,
  immutable_original:"x".repeat(370)});
 const base=rows(32).map(x=>({...x,raw_json:native(x)}));
 for(const row of base)
  db.prepare("INSERT INTO phase2h_private_raw_news VALUES(?,?,?,NULL,NULL)")
   .run(row.record_id,row.raw_sha256,row.raw_json);
 const plan=phase2hAtomicBulkArchiveAck(base,objectSha,now);
 assert.equal(plan.exact_original_json_bytes_required,true);
 assert.equal(plan.params.length,99);
 assert.equal(plan.d1_statements,1);
 assert.ok(plan.sql.includes("expected(record_id,raw_sha256,raw_json)"));
 assert.match(plan.sql,/AND r.raw_json=e.raw_json/u);
 // Same record ID + immutable raw_sha256 but a different ingestion clock
 // must NOT be silently acknowledged as the same B2 object.
 const changed=base.map(x=>({...x}));
 changed[2].raw_json=changed[2].raw_json.replace(now.toISOString(),
  "2026-11-04T07:59:00.000Z");
 const mismatch=phase2hAtomicBulkArchiveAck(changed,objectSha,now);
 assert.equal(db.prepare(mismatch.sql).all(...mismatch.params).length,0);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL").get().n,0);
 const exactResult=db.prepare(plan.sql).all(...plan.params);
 assert.equal(exactResult.length,32);
 assert.equal(assertPhase2hBulkArchiveAckReturning({results:exactResult},base,objectSha).archived,32);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL").get().n,32);
 assert.throws(()=>phase2hAtomicBulkArchiveAck([...base,base[0]],objectSha,now),
  /PHASE2H_BULK_ACK_EXACT_JSON_BATCH_TOO_LARGE/u);
 for(const bad of ["", "{}", null]){
  assert.throws(()=>phase2hAtomicBulkArchiveAck([{...base[0],raw_json:bad}],objectSha,now),
   /PHASE2H_BULK_ACK_EXACT_JSON_REQUIRED/u);
 }
 db.close();
});

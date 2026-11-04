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
 assert.match(plan.sql,/JOIN expected AS e ON r\.record_id=e\.record_id AND r\.raw_sha256=e\.raw_sha256/u);
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

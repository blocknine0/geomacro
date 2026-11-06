/** One SQLite statement to ACK an entire B2-verified ORIGINAL batch.
 * This is ONE D1 write statement with an atomic expected-ID/hash guard and
 * RETURNING readback. No per-record SELECT/UPDATE. No extra provider request.
 * The B2 object MUST have passed independent full-body GET/hash restoration
 * before the caller invokes this builder.
 */
const HEX=/^[a-f0-9]{64}$/u;
// Cloudflare D1 accepts at most 100 SQL bound parameters per query.
// Each original uses two parameters and the atomic UPDATE uses three more:
// 2 * 48 + 3 = 99 (49 originals would require 101).
export const MAX_D1_BULK_ARCHIVE_ACK=48;
const fail=code=>{throw Error("PHASE2H_BULK_ACK_"+code)};
export function phase2hAtomicBulkArchiveAck(rows,objectSha,now=new Date()){
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_D1_BULK_ARCHIVE_ACK||
    !HEX.test(objectSha)||!(now instanceof Date)||!Number.isFinite(now.getTime()))
  fail("INPUT_INVALID");
 const seen=new Set(),params=[];
 for(const row of rows){
  if(!HEX.test(row?.record_id)||!HEX.test(row?.raw_sha256)||
    seen.has(row.record_id))fail("IDENTITY_INVALID");
  seen.add(row.record_id);
  params.push(row.record_id,row.raw_sha256);
 }
 const values=rows.map(()=>"(?,?)").join(",");
 // Materialized 'eligible' makes an all-or-nothing precondition for the
 // entire expected set. A conflicting hash or previous archive produces
 // ZERO updates, never an opportunistic partial ACK.
 const sql="WITH expected(record_id,raw_sha256) AS MATERIALIZED (VALUES "+values+"), "+
  // Resolve the small expected set through the unique record ID first.
  // Driving UPDATE from the unarchived index scans the entire backlog even
  // for one ACK. Materialized rowids keep both eligibility and mutation bounded.
  "targets(rid) AS MATERIALIZED ("+
  "SELECT (SELECT r.rowid FROM phase2h_private_raw_news AS r "+
  "WHERE r.record_id=e.record_id AND r.raw_sha256=e.raw_sha256 "+
  "AND r.b2_object_sha256 IS NULL) FROM expected AS e), "+
  "eligible(total) AS MATERIALIZED ("+
  "SELECT COUNT(*) FROM targets WHERE rid IS NOT NULL) "+
  "UPDATE phase2h_private_raw_news "+
  "SET b2_object_sha256=?,b2_archived_at=? "+
  "WHERE rowid IN (SELECT rid FROM targets WHERE rid IS NOT NULL) "+
  "AND (SELECT total FROM eligible)=? "+
  "RETURNING record_id,raw_sha256,b2_object_sha256";
 const boundParams=[...params,objectSha,now.toISOString(),rows.length];
 if(boundParams.length>100)fail("D1_BOUND_PARAMETER_LIMIT_EXCEEDED");
 return Object.freeze({sql,params:boundParams,
  object_sha256:objectSha,count:rows.length,
  d1_statements:1,all_or_nothing_expected_guard:true});
}
export function assertPhase2hBulkArchiveAckReturning(reply,rows,objectSha){
 const returned=reply?.results;
 if(!Array.isArray(returned)||returned.length!==rows.length)
  fail("ATOMIC_RETURNING_COUNT_MISMATCH");
 const expected=new Map(rows.map(x=>[x.record_id,x.raw_sha256]));
 const seen=new Set();
 for(const item of returned){
  if(!item||typeof item.record_id!=="string"||
     seen.has(item.record_id)||expected.get(item.record_id)!==item.raw_sha256||
     item.b2_object_sha256!==objectSha)
   fail("ATOMIC_RETURNING_ID_HASH_MISMATCH");
  seen.add(item.record_id);
 }
 return Object.freeze({archived:rows.length,
  independent_d1_archive_ack_verified:true,
  d1_atomic_one_statement_returning_verified:true});
}

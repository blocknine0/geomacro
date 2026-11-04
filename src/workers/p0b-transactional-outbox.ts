/** Hash-only D1-before-B2 private transactional outbox.
 * Never stores original payload, original URL, title or authentication keys.
 * Pending rows are replayed only by source re-observation / durable
 * encrypted upstream spool. Do NOT invent successful B2 receipts.
 */
import {p0bSha256} from "../storage/b2-spool-manager.ts";
const HEX=/^[a-f0-9]{64}$/u;
export async function p0bOutboxKey(items:{candidateSha256:string;sourceId:string}[]){
 if(!Array.isArray(items)||items.length<1||items.length>100||
  items.some(x=>!HEX.test(x.candidateSha256)||typeof x.sourceId!=="string"))
  throw Error("P0B_OUTBOX_BATCH_INVALID");
 const names=items.map(x=>x.candidateSha256+"|"+x.sourceId).sort();
 if(new Set(items.map(x=>x.candidateSha256)).size!==items.length)
  throw Error("P0B_OUTBOX_DUPLICATE_ID");
 const id=await p0bSha256(names.join("\n"));
 return {batchId:id,fingerprint:id};
}
export async function openP0bArchiveOutbox(db:any,items:{
 candidateSha256:string;sourceId:string}[],now:Date){
 if(!db?.prepare||!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("P0B_OUTBOX_CONFIG_INVALID");
 const id=await p0bOutboxKey(items);
 await db.prepare(
  "INSERT INTO p0b_archive_outbox "+
  "(batch_id,candidate_fingerprint,item_count,state,first_seen_at) "+
  "VALUES (?,?,?,'PENDING_ARCHIVE',?) "+
  "ON CONFLICT(batch_id) DO NOTHING"
 ).bind(id.batchId,id.fingerprint,items.length,now.toISOString()).run();
 const row=await db.prepare(
  "SELECT batch_id,candidate_fingerprint,item_count,state,first_seen_at,"+
  "b2_uri,b2_object_sha256,b2_etag,archived_at "+
  "FROM p0b_archive_outbox WHERE batch_id=?").bind(id.batchId).first();
 if(!row||row.candidate_fingerprint!==id.fingerprint||
    row.item_count!==items.length||
    !Number.isFinite(Date.parse(row.first_seen_at))||
    !["PENDING_ARCHIVE","ARCHIVED"].includes(row.state))
  throw Error("P0B_OUTBOX_D1_OPEN_READBACK_FAILED");
 if(row.state==="ARCHIVED"&&(!row.b2_uri||!HEX.test(row.b2_object_sha256??"")))
  throw Error("P0B_OUTBOX_ARCHIVED_POINTER_INVALID");
 return row;
}
export function p0bOutboxCommitStatement(db:any,row:any,verified:any,at:Date){
 if(!db?.prepare||!HEX.test(row?.batch_id??"")||
  !HEX.test(verified?.batchSha256??"")||
  !/^b2:\/\/[^\s]+$/u.test(verified?.b2Uri??"")||
  !Number.isSafeInteger(verified?.items?.length)||
  verified.items.length!==row.item_count||
  !(at instanceof Date)||!Number.isFinite(at.getTime()))
  throw Error("P0B_OUTBOX_ARCHIVE_PROOF_INVALID");
 // B2 ETag is metadata only and not proof of content identity. SHA256
 // and independent B2 remote GET remain authoritative.
 const etag=typeof verified.etag==="string"&&
  /^["a-fA-F0-9-]{1,100}$/u.test(verified.etag)?verified.etag:null;
 return db.prepare(
  "UPDATE p0b_archive_outbox SET "+
  "state='ARCHIVED',b2_uri=?,b2_etag=?,b2_object_sha256=?,"+
  "archived_at=?,last_error_code=NULL WHERE batch_id=? AND "+
  "state='PENDING_ARCHIVE' AND candidate_fingerprint=?"
 ).bind(verified.b2Uri,etag,verified.batchSha256,at.toISOString(),
  row.batch_id,row.candidate_fingerprint);
}
export async function verifyP0bOutboxCommitted(db:any,row:any,verified:any){
 const saved=await db.prepare(
  "SELECT state,b2_uri,b2_object_sha256,archived_at,item_count "+
  "FROM p0b_archive_outbox WHERE batch_id=?").bind(row.batch_id).first();
 if(saved?.state!=="ARCHIVED"||saved.b2_uri!==verified.b2Uri||
    saved.b2_object_sha256!==verified.batchSha256||
    saved.item_count!==verified.items.length||
    !Number.isFinite(Date.parse(saved.archived_at)))
  throw Error("P0B_OUTBOX_ARCHIVE_READBACK_MISMATCH");
 return true;
}

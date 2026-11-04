/** Private encrypted D1-before-B2 transactional outbox.
 * D1 stores hash-only indexed metadata and AES-256-GCM ciphertext, never
 * plaintext original payload, URL, title or any authentication keys.
 * The sealed pending payload survives a B2/network/D1 crash and is replayed
 * on the existing ten-minute cron. Never fabricate B2 success.
 */
import {p0bSha256} from "../storage/b2-spool-manager.ts";
import {canonicalJson} from "../lib/canonical-json.ts";
import type {SpoolPayload} from "../storage/b2-spool-manager.ts";
const HEX=/^[a-f0-9]{64}$/u;
const ENC=new TextEncoder(),DEC=new TextDecoder();
const ab=(data:Uint8Array):ArrayBuffer=>{
 const buffer=new ArrayBuffer(data.byteLength);
 new Uint8Array(buffer).set(data);return buffer;
};
const b64=(data:Uint8Array)=>{
 let value="";for(const b of data)value+=String.fromCharCode(b);
 return btoa(value);
};
const unb64=(x:string)=>Uint8Array.from(atob(x),t=>t.charCodeAt(0));
const aes=async(root:string)=>{
 if(typeof root!=="string"||root.length<32)
  throw Error("P0B_OUTBOX_ENCRYPTION_KEY_REQUIRED");
 const raw=await crypto.subtle.digest("SHA-256",ENC.encode(root));
 return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
};
async function sealOutbox(id:string,payloads:SpoolPayload[],key:string){
 const plain=ENC.encode(canonicalJson(payloads));
 if(plain.byteLength>512*1024)throw Error("P0B_OUTBOX_PLAIN_LIMIT");
 const nonce=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({
  name:"AES-GCM",iv:ab(nonce),additionalData:ab(ENC.encode("p0b-outbox|"+id))
 },await aes(key),ab(plain)));
 const text=canonicalJson({schema:"geomacro.p0b.outbox-aead.v1",
  nonce:b64(nonce),ciphertext:b64(ciphertext),
  plaintext_sha256:await p0bSha256(plain)});
 if(text.length>1024*1024)throw Error("P0B_OUTBOX_CIPHER_LIMIT");
 return {text,digest:await p0bSha256(text)};
}
async function unsealOutbox(id:string,text:string,digest:string,key:string){
 if(typeof text!=="string"||text.length>1024*1024||
    !HEX.test(digest)||await p0bSha256(text)!==digest)
  throw Error("P0B_OUTBOX_STORED_CIPHER_INVALID");
 let env:any;
 try{env=JSON.parse(text)}catch{throw Error("P0B_OUTBOX_CIPHER_JSON_INVALID")}
 if(env.schema!=="geomacro.p0b.outbox-aead.v1"||
    !HEX.test(env.plaintext_sha256??""))
  throw Error("P0B_OUTBOX_CIPHER_SCHEMA_INVALID");
 let plain:Uint8Array;
 try{plain=new Uint8Array(await crypto.subtle.decrypt({
  name:"AES-GCM",iv:ab(unb64(env.nonce)),
  additionalData:ab(ENC.encode("p0b-outbox|"+id))
 },await aes(key),ab(unb64(env.ciphertext))));}
 catch{throw Error("P0B_OUTBOX_AUTHENTICATION_FAILED")}
 if(plain.length>512*1024||await p0bSha256(plain)!==env.plaintext_sha256)
  throw Error("P0B_OUTBOX_PLAINTEXT_SHA_MISMATCH");
 let payloads:SpoolPayload[];
 try{payloads=JSON.parse(DEC.decode(plain));}
 catch{throw Error("P0B_OUTBOX_PLAINTEXT_JSON_INVALID")}
 if(!Array.isArray(payloads)||payloads.length<1||payloads.length>100||
    payloads.some(x=>!HEX.test(x?.candidateSha256??"")||
     typeof x?.sourceId!=="string"||
     !Number.isFinite(Date.parse(x?.discoveredAt??""))))
  throw Error("P0B_OUTBOX_PAYLOAD_INVALID");
 if((await p0bOutboxKey(payloads)).batchId!==id||
    !(await Promise.all(payloads.map(async x=>
      await p0bSha256(canonicalJson(x.rawPayload))===x.candidateSha256))).every(Boolean))
  throw Error("P0B_OUTBOX_IDENTITY_INVALID");
 return payloads;
}
export async function readP0bSealedOutbox(row:any,key:string){
 if(!HEX.test(row?.batch_id??"")||!HEX.test(row?.payload_sha256??""))
  throw Error("P0B_OUTBOX_PENDING_ID_INVALID");
 const payloads=await unsealOutbox(row.batch_id,row.sealed_payload,
  row.payload_sha256,key);
 if(payloads.length!==row.item_count)
  throw Error("P0B_OUTBOX_PENDING_COUNT_MISMATCH");
 return payloads;
}
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
export async function openP0bArchiveOutbox(db:any,payloads:SpoolPayload[],
 now:Date,key:string,replayLeaseId:string|null=null){
 if(!db?.prepare||!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("P0B_OUTBOX_CONFIG_INVALID");
 const id=await p0bOutboxKey(payloads);
 const fresh=payloads.map(x=>({...x,discoveredAt:now.toISOString()}));
 const envelope=await sealOutbox(id.batchId,fresh,key);
 await db.prepare(
  "INSERT INTO p0b_archive_outbox "+
  "(batch_id,candidate_fingerprint,item_count,state,first_seen_at,"+
  "sealed_payload,payload_sha256,next_retry_at) "+
  "VALUES (?,?,?,'PENDING_ARCHIVE',?,?,?,?) "+
  "ON CONFLICT(batch_id) DO NOTHING"
 ).bind(id.batchId,id.fingerprint,payloads.length,now.toISOString(),
   envelope.text,envelope.digest,now.toISOString()).run();
 const row=await db.prepare(
  "SELECT batch_id,candidate_fingerprint,item_count,state,first_seen_at,"+
  "b2_uri,b2_object_sha256,b2_etag,archived_at,sealed_payload,payload_sha256,"+
  "lease_id,locked_until FROM p0b_archive_outbox WHERE batch_id=?"
 ).bind(id.batchId).first();
 if(!row||row.candidate_fingerprint!==id.fingerprint||
    row.item_count!==payloads.length||
    !Number.isFinite(Date.parse(row.first_seen_at))||
    !["PENDING_ARCHIVE","REPLAYING","ARCHIVED"].includes(row.state))
  throw Error("P0B_OUTBOX_D1_OPEN_READBACK_FAILED");
 if(row.state==="REPLAYING"&&
    (replayLeaseId===null||row.lease_id!==replayLeaseId))
  throw Error("P0B_OUTBOX_CURRENT_REPLAY_LEASE_HELD");
 if(row.state==="ARCHIVED"&&(!row.b2_uri||!HEX.test(row.b2_object_sha256??"")))
  throw Error("P0B_OUTBOX_ARCHIVED_POINTER_INVALID");
 const durable=row.state==="ARCHIVED"?
  payloads.map(x=>({...x,discoveredAt:row.first_seen_at})):
  await readP0bSealedOutbox(row,key);
 if((await p0bOutboxKey(durable)).batchId!==row.batch_id)
  throw Error("P0B_OUTBOX_REPLAY_IDENTITY_MISMATCH");
 return {...row,payloads:durable};
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
  "archived_at=?,sealed_payload=NULL,lease_id=NULL,locked_until=NULL,"+
  "last_error_code=NULL WHERE batch_id=? AND candidate_fingerprint=? "+
  "AND (state='PENDING_ARCHIVE' OR "+
  "(state='REPLAYING' AND lease_id=?))"
 ).bind(verified.b2Uri,etag,verified.batchSha256,at.toISOString(),
  row.batch_id,row.candidate_fingerprint,row.lease_id??null);
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

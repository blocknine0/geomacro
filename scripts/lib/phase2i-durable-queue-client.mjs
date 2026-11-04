/**
 * Node/Bun private-only client for R2 ciphertext chunks with DO lease state.
 * Large backlogs NEVER enter the old 8,000-entry transient AEAD snapshot.
 */
import {createHash} from "node:crypto";
import {mergePrivatePhase2iSourceBacklog,sealPrivatePhase2iSourceBacklog,
 unsealPrivatePhase2iSourceBacklog} from "./phase2i-encrypted-source-backlog.mjs";
const MAX=500;
const id=c=>createHash("sha256").update(c.category+"\n"+c.articleUrl+"\n"+
 (c.datePrecision==="day"?c.publishedAt.slice(0,10):c.publishedAt)).digest("hex");
export function durableCandidateId(candidate){return id(candidate);}
export function chunkPhase2iCandidates(candidates,size=MAX){
 if(!Array.isArray(candidates)||size!==MAX)
  throw Error("PHASE2I_DURABLE_CHUNK_INPUT_INVALID");
 const chunks=[];
 for(let n=0;n<candidates.length;n+=MAX)chunks.push(candidates.slice(n,n+MAX));
 return chunks;
}
function config(env){
 const raw=String(env.GEOMACRO_PHASE2I_DURABLE_URL??"");
 let url;
 try{url=new URL(raw)}catch{throw Error("PHASE2I_DURABLE_URL_REQUIRED")}
 if(url.protocol!=="https:"||url.username||url.password||
    url.pathname!=="/"||url.search||url.hash||
    !(url.hostname.endsWith(".workers.dev")||url.hostname==="geomacro.live"))
  throw Error("PHASE2I_DURABLE_ENDPOINT_INVALID");
 const token=String(env.GEOMACRO_PHASE2I_DURABLE_TOKEN??"");
 if(token.length<32)throw Error("PHASE2I_DURABLE_TOKEN_REQUIRED");
 return {url:url.origin,token};
}
async function call(path,payload,env,fetchImpl){
 const {url,token}=config(env);
 const response=await fetchImpl(url+path,{
  method:payload===null?"GET":"POST",redirect:"error",
  headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
  ...(payload===null?{}:{body:JSON.stringify(payload)}),
  signal:AbortSignal.timeout(25000),
 });
 if(!response||response.status!==200||response.redirected)
  throw Error("PHASE2I_DURABLE_REQUEST_FAILED_"+String(response?.status??"NETWORK"));
 const body=await response.json();
 if(body?.ok!==true)throw Error("PHASE2I_DURABLE_RECEIPT_INVALID");
 return body;
}
export async function appendAndLeasePhase2i({
 observed,root,now=Date.now(),env=process.env,fetchImpl=fetch,
}={}){
 if(typeof root!=="string"||root.length<32||!Number.isFinite(now))
  throw Error("PHASE2I_DURABLE_AUTH_OR_CLOCK_INVALID");
 const newly=new Set();
 let saved=0,duplicates=0,excluded=0,objects=0;
 for(const slice of chunkPhase2iCandidates(observed)){
  const checked=mergePrivatePhase2iSourceBacklog([],slice,now);
  excluded+=checked.expired_or_invalid+checked.immutable_conflicts_quarantined;
  if(!checked.candidates.length)continue;
  const items=checked.candidates.map(row=>({
   id:id(row),expiresAt:Date.parse(row.publishedAt)+72*3600_000
  }));
  const envelope=sealPrivatePhase2iSourceBacklog({
   candidates:checked.candidates,root,now
  });
  const receipt=await call("/v1/phase2i/append",{items,envelope},env,fetchImpl);
  if(receipt.readback_verified!==true||
     receipt.newly_durable+receipt.already_known!==items.length)
   throw Error("PHASE2I_DURABLE_APPEND_NOT_VERIFIED");
  saved+=receipt.newly_durable;
  duplicates+=receipt.already_known;
  objects++;
  // Source-only priority is a hint; only newly persisted original ids count.
  if(receipt.newly_durable===items.length)
   for(const item of items)newly.add(item.id);
 }
 const response=await call("/v1/phase2i/lease",{},env,fetchImpl);
 const lease=response.lease??null;
 let candidates=[];
 if(lease){
  const restored=unsealPrivatePhase2iSourceBacklog(lease.envelope,root,Date.now());
  const allowed=new Set(lease.active_ids);
  if(restored.candidates.length>MAX||allowed.size!==lease.active_ids.length)
   throw Error("PHASE2I_DURABLE_LEASE_INVALID");
  candidates=restored.candidates.filter(c=>allowed.has(id(c)));
  if(candidates.length!==allowed.size)
   throw Error("PHASE2I_DURABLE_LEASE_ITEMS_MISSING");
 }
 return {candidates,lease,newly,appended_new:saved,
  duplicate_existing:duplicates,invalid_or_expired:excluded,
  verified_encrypted_objects:objects};
}
export async function acknowledgePhase2i({
 lease,verifiedRecordIds,env=process.env,fetchImpl=fetch,
}={}){
 if(!lease)return {acked_now:0};
 if(!Array.isArray(verifiedRecordIds)||verifiedRecordIds.length>5)
  throw Error("PHASE2I_DURABLE_ACK_UNVERIFIED");
 return call("/v1/phase2i/ack",{
  chunk_id:lease.chunk_id,lease_id:lease.lease_id,
  verified_ids:verifiedRecordIds
 },env,fetchImpl);
}
export async function phase2iDurableStatus({env=process.env,fetchImpl=fetch}={}){
 return call("/v1/phase2i/status",null,env,fetchImpl);
}

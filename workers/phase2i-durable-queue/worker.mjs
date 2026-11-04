/**
 * Private Phase 2I durable buffer: R2 ciphertext + SQLite-backed Durable
 * Object leases. No public articles, no source plaintext, no paid entitlement.
 * The DO is the only writer for its queue metadata; a failed lease expires.
 */
const HEX=/^[a-f0-9]{64}$/u;
const MAX=500, TTL=72*3600_000, LEASE=10*60_000;
const MAX_BODY=1_500_000;
const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
const digest=async bytes=>Array.from(new Uint8Array(
 await crypto.subtle.digest("SHA-256",bytes)
)).map(x=>x.toString(16).padStart(2,"0")).join("");
function authorized(request,env){
 const actual=request.headers.get("authorization")??"";
 const expected="Bearer "+String(env.PHASE2I_DURABLE_TOKEN??"");
 if(String(env.PHASE2I_DURABLE_TOKEN??"").length<32||
    actual.length!==expected.length)return false;
 let unequal=0;
 for(let i=0;i<expected.length;i++)unequal|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return unequal===0;
}
async function bodyJson(request){
 const size=Number(request.headers.get("content-length")??0);
 if(size>MAX_BODY)throw Error("BODY_OVERSIZE");
 const raw=await request.text();
 if(raw.length>MAX_BODY)throw Error("BODY_OVERSIZE");
 return JSON.parse(raw);
}
const fail=(message,status=409)=>json({ok:false,error:message},status);
const objectKey=id=>"phase2i/durable-ciphertext/v1/"+id.slice(0,2)+"/"+id+".json";
const goodItem=(item,now)=>item&&HEX.test(item.id??"")&&
 Number.isSafeInteger(item.expiresAt)&&item.expiresAt>now&&
 item.expiresAt<=now+TTL+60_000;

export class Phase2iDurableQueueDO {
 constructor(state,env){this.state=state;this.env=env;}
 async fetch(request){
  const path=new URL(request.url).pathname;
  try{
   if(path==="/v1/phase2i/append"&&request.method==="POST")
    return await this.state.blockConcurrencyWhile(()=>this.append(request));
   if(path==="/v1/phase2i/lease"&&request.method==="POST")
    return await this.state.blockConcurrencyWhile(()=>this.lease());
   if(path==="/v1/phase2i/ack"&&request.method==="POST")
    return await this.state.blockConcurrencyWhile(()=>this.ack(request));
   if(path==="/v1/phase2i/status"&&request.method==="GET")
    return await this.state.blockConcurrencyWhile(()=>this.status());
   return fail("METHOD_OR_ROUTE_DENIED",404);
  }catch(error){
   // Deliberately never log payload, publisher identity or credentials.
   return fail(["BODY_OVERSIZE","BAD_JSON"].includes(error?.message) ?
    error.message:"DURABLE_OPERATION_NOT_COMMITTED",503);
  }
 }
 async append(request){
  let body;
  try{body=await bodyJson(request)}catch{return fail("INVALID_APPEND",400);}
  const envelope=body?.envelope,items=body?.items,now=Date.now();
  if(!Array.isArray(items)||items.length<1||items.length>MAX||
     new Set(items.map(x=>x?.id)).size!==items.length||
     !items.every(x=>goodItem(x,now))||
     envelope?.schema!=="geomacro.private-phase2i-source-queue-aead.v1"||
     envelope?.unverified_candidates!==items.length||
     envelope?.canonical_d1_verified!==false||
     envelope?.commercial_reuse_verified!==false||
     typeof envelope?.ciphertext!=="string")
   return fail("CHUNK_CONTRACT_INVALID",400);
  const bytes=new TextEncoder().encode(JSON.stringify(envelope));
  if(bytes.byteLength>MAX_BODY)return fail("CHUNK_OVERSIZE",413);
  const id=await digest(bytes),key=objectKey(id);
  const existing=await this.state.storage.get(items.map(x=>"item:"+x.id));
  const fresh=items.filter(x=>!existing.has("item:"+x.id));
  if(fresh.length===0)return json({ok:true,chunk_id:id,
   newly_durable:0,already_known:items.length,readback_verified:true});
  // A full-body R2 GET must succeed before ANY metadata is committed.
  // Orphans after interrupted PUT are safe to retry at the same immutable key.
  const put=await this.env.PHASE2I_R2.put(key,bytes,{
   httpMetadata:{contentType:"application/json"}});
  if(!put)return fail("R2_PUT_NOT_CONFIRMED",503);
  const stored=await this.env.PHASE2I_R2.get(key);
  if(!stored)return fail("R2_READBACK_MISSING",503);
  const restored=new Uint8Array(await stored.arrayBuffer());
  if(restored.byteLength!==bytes.byteLength||
     await digest(restored)!==id)
   return fail("R2_READBACK_HASH_MISMATCH",503);
  const prior=await this.state.storage.get("chunk:"+id);
  const chunk=prior??{id,key,createdAt:now,items:[],
   acknowledged:[],lastLeasedAt:0,leaseId:null,leaseUntil:0};
  const additions=fresh.filter(x=>!chunk.items.some(y=>y.id===x.id));
  chunk.items.push(...additions);
  const writes={["chunk:"+id]:chunk};
  for(const item of additions)writes["item:"+item.id]={
   chunkId:id,expiresAt:item.expiresAt};
  await this.state.storage.put(writes);
  return json({ok:true,chunk_id:id,newly_durable:additions.length,
   already_known:items.length-additions.length,readback_verified:true});
 }
 async lease(){
  const now=Date.now();
  const candidates=[...(await this.state.storage.list({prefix:"chunk:",limit:1000})).values()]
   .map(chunk=>({
    chunk,
    active:chunk.items.filter(item=>item.expiresAt>now&&
      !chunk.acknowledged.includes(item.id))
   })).filter(x=>x.active.length>0&&x.chunk.leaseUntil<=now)
   .sort((a,b)=>a.chunk.lastLeasedAt-b.chunk.lastLeasedAt||
    a.chunk.createdAt-b.chunk.createdAt);
  if(!candidates.length)return json({ok:true,lease:null,
   no_eligible_unleased_chunk:true});
  const {chunk,active}=candidates[0];
  const item=await this.env.PHASE2I_R2.get(chunk.key);
  if(!item)return fail("R2_LEASE_READ_FAILED",503);
  const bytes=new Uint8Array(await item.arrayBuffer());
  if(await digest(bytes)!==chunk.id)
   return fail("R2_LEASE_HASH_MISMATCH",503);
  let envelope;
  try{envelope=JSON.parse(new TextDecoder().decode(bytes))}
  catch{return fail("R2_LEASE_JSON_INVALID",503);}
  chunk.leaseId=crypto.randomUUID();
  chunk.leaseUntil=now+LEASE;
  chunk.lastLeasedAt=now;
  await this.state.storage.put("chunk:"+chunk.id,chunk);
  return json({ok:true,lease:{chunk_id:chunk.id,lease_id:chunk.leaseId,
   lease_until:chunk.leaseUntil,active_ids:active.map(x=>x.id),envelope}});
 }
 async ack(request){
  let body;
  try{body=await bodyJson(request)}catch{return fail("ACK_BODY_INVALID",400);}
  const {chunk_id,lease_id,verified_ids}=body??{};
  if(!HEX.test(chunk_id??"")||
    typeof lease_id!=="string"||lease_id.length>100||
    !Array.isArray(verified_ids)||verified_ids.length>5||
    new Set(verified_ids).size!==verified_ids.length||
    !verified_ids.every(x=>HEX.test(x)))
   return fail("ACK_CONTRACT_INVALID",400);
  const chunk=await this.state.storage.get("chunk:"+chunk_id);
  const now=Date.now();
  if(!chunk||chunk.leaseId!==lease_id||chunk.leaseUntil<=now)
   return fail("LEASE_EXPIRED_OR_MISMATCH",409);
  const allowed=new Set(chunk.items.map(x=>x.id));
  if(verified_ids.some(x=>!allowed.has(x)))
   return fail("ACK_UNKNOWN_ID",409);
  const previous=new Set(chunk.acknowledged);
  for(const id of verified_ids)previous.add(id);
  chunk.acknowledged=[...previous];
  chunk.leaseId=null;chunk.leaseUntil=0;
  await this.state.storage.put("chunk:"+chunk.id,chunk);
  return json({ok:true,acked_now:verified_ids.length,
   total_acked_in_chunk:chunk.acknowledged.length,
   remaining_eligible:chunk.items.filter(x=>x.expiresAt>now&&
    !previous.has(x.id)).length});
 }
 async status(){
  const now=Date.now();
  const chunks=[...(await this.state.storage.list({prefix:"chunk:",limit:1000})).values()];
  let pending=0,acknowledged=0,expired=0,leased=0;
  for(const chunk of chunks){
   const acked=new Set(chunk.acknowledged);
   for(const item of chunk.items){
    if(acked.has(item.id))acknowledged++;
    else if(item.expiresAt<=now)expired++;
    else pending++;
   }
   if(chunk.leaseUntil>now)leased++;
  }
  return json({ok:true,schema:"geomacro.phase2i.durable-health.v1",
   chunks:chunks.length,pending_eligible:pending,acknowledged,
   expired_without_d1_ack:expired,leased_chunks:leased,
   source_news_exposed:false,fully_d1_drained:pending===0&&expired===0});
 }
}
export default {
 async fetch(request,env){
  if(!authorized(request,env))return fail("UNAUTHORIZED",401);
  if(!env.PHASE2I_QUEUE_DO||!env.PHASE2I_R2)
   return fail("DURABLE_BINDINGS_MISSING",503);
  const name=env.PHASE2I_QUEUE_DO.idFromName("canonical-phase2i");
  return env.PHASE2I_QUEUE_DO.get(name).fetch(request);
 }
};

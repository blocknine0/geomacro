/**
 * Internal signed-GRO delivery; durable D1 outbox + Cloudflare Queue.
 * This is a no-funds handoff to an internal consumer, not a customer purchase,
 * webhook, certified GRI, or bypass of release-hold and review gates.
 */
const HEX=/^[a-f0-9]{64}$/u,ISO3=/^[A-Z]{3}$/u;
const fail=code=>{throw Error("RISK_STREAM_DELIVERY_"+code)};
const bytes=v=>new TextEncoder().encode(v);
const hex=async v=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
 typeof v==="string"?bytes(v):v)),x=>x.toString(16).padStart(2,"0")).join("");
function base64(value){
 if(typeof value!=="string"||value.length>2048||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))fail("SIGNATURE_INVALID");
 return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
}
export async function dispatchRiskStreamOutbox(env,{max=20}={}){
 if(env?.RISK_STREAM_ACTIVE!=="1"||env?.STREAM_INGESTION_ENABLED!=="true"||
    !env?.DB?.prepare||
    !env?.RISK_STREAM_DELIVERY_QUEUE?.sendBatch)return {status:"HOLD_BINDING_UNAVAILABLE",count:0};
 if(!Number.isSafeInteger(max)||max<1||max>50)fail("DISPATCH_LIMIT_INVALID");
 const res=await env.DB.prepare("SELECT o.gro_id,g.payload_sha256 "+
  "FROM risk_stream_delivery_outbox o "+
  "JOIN risk_stream_signed_gro g ON g.gro_id=o.gro_id "+
  "WHERE o.state='PENDING' AND g.expires_at>? "+
  "ORDER BY o.created_at,o.gro_id LIMIT ?")
  .bind(new Date().toISOString(),max).all();
 const rows=res?.results??[];
 if(!Array.isArray(rows)||rows.length>max||
    rows.some(x=>!HEX.test(x.gro_id)||!HEX.test(x.payload_sha256)))
  fail("DISPATCH_CANONICAL_INVALID");
 if(!rows.length)return {status:"IDLE",count:0};
 // Queue messages carry only canonical IDs + hashes: no raw or licensed news.
 await env.RISK_STREAM_DELIVERY_QUEUE.sendBatch(rows.map(x=>({
  body:{schema:"geomacro.risk-stream-delivery-pointer.v1",
   gro_id:x.gro_id,payload_sha256:x.payload_sha256},contentType:"json"})));
 // This may be retried after an ambiguous write; consumer is idempotent.
 const done=await env.DB.prepare("UPDATE risk_stream_delivery_outbox SET "+
  "state='DISPATCHED',dispatched_at=? WHERE state='PENDING' AND "+
  "gro_id IN (SELECT value FROM json_each(?))")
  .bind(new Date().toISOString(),JSON.stringify(rows.map(x=>x.gro_id))).run();
 if(done?.success===false)fail("DISPATCH_ACK_D1_UNAVAILABLE");
 return {status:"QUEUED_INTERNAL",count:rows.length,no_funds:true};
}
export async function consumeRiskStreamDelivery(batch,env,now=Date.now()){
 if(env?.RISK_STREAM_ACTIVE!=="1"||env?.STREAM_INGESTION_ENABLED!=="true"||
    !env.DB?.prepare||!env.DB?.batch||
    !Array.isArray(batch?.messages)||batch.messages.length<1||
    batch.messages.length>20)fail("CONSUMER_BINDING_UNAVAILABLE");
 const verifierBytes=base64(env.RISK_STREAM_GRO_VERIFY_SPKI_B64);
 const verifier=await crypto.subtle.importKey("spki",verifierBytes,
  {name:"Ed25519"},false,["verify"]);
 const rows=[];
 try{
  for(const m of batch.messages){
   const ptr=m.body;
   if(ptr?.schema!=="geomacro.risk-stream-delivery-pointer.v1"||
      !HEX.test(ptr.gro_id??"")||!HEX.test(ptr.payload_sha256??""))
    fail("POINTER_INVALID");
   const r=await env.DB.prepare("SELECT gro_id,country_iso3,category,"+
    "payload_json,payload_sha256,signature_b64,expires_at "+
    "FROM risk_stream_signed_gro WHERE gro_id=? LIMIT 1")
    .bind(ptr.gro_id).first();
   if(!r||r.payload_sha256!==ptr.payload_sha256||
      await hex(r.payload_json)!==ptr.payload_sha256||
      Date.parse(r.expires_at)<=now)fail("IMMUTABLE_GRO_MISSING_OR_EXPIRED");
   let payload;try{payload=JSON.parse(r.payload_json)}catch{fail("PAYLOAD_INVALID")}
   if(payload.schema!=="geomacro.event-stream-gro.v1"||
      payload.subject?.type!=="COUNTRY"||!ISO3.test(payload.subject.id??"")||
      payload.subject.id!==r.country_iso3||payload.category!==r.category||
      !Array.isArray(payload.source_originals)||payload.source_originals.length!==2||
      payload.customer_delivery_authorized!==false||
      payload.certified_risk_index!==false||
      payload.charged!==false||payload.execution_authorized!==false)
    fail("RELEASE_SCOPE_OR_PROOF_INVALID");
   if(!await crypto.subtle.verify("Ed25519",verifier,
       base64(r.signature_b64),bytes(r.payload_json)))
    fail("SIGNATURE_UNVERIFIED");
   rows.push({id:r.gro_id,hash:r.payload_sha256});
  }
  const statements=rows.map(x=>env.DB.prepare(
   "INSERT OR IGNORE INTO risk_stream_internal_delivery_receipts "+
   "(gro_id,payload_sha256,received_at) VALUES (?,?,?)")
   .bind(x.id,x.hash,new Date(now).toISOString()));
  const result=await env.DB.batch(statements);
  if(!Array.isArray(result)||result.length!==rows.length||
     result.some(x=>x?.success===false))fail("DELIVERY_RECEIPT_D1_UNVERIFIED");
  for(const m of batch.messages)m.ack();
  return {status:"DELIVERED_INTERNAL_NO_FUNDS",count:rows.length};
 }catch(e){
  for(const m of batch.messages)m.retry({delaySeconds:30});
  throw e;
 }
}

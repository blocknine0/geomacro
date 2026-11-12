/**
 * Durable, no-loss commercially licensed webhook dispatcher.
 * Production default: INACTIVE. Never promotes the internal 0214 outbox:
 * the commercially eligible payload must have a separately signed release.
 */
import {verifyGeoMacroCommercialLicense,licensedSha}
 from "./risk-stream-commercial-license.mjs";
const HEX=/^[a-f0-9]{64}$/u;
const fail=x=>{throw Error("RISK_STREAM_COMMERCIAL_OUTBOX_"+x)};
const iso=v=>new Date(v).toISOString();
// Return only finite, reviewed diagnostic symbols. Never emit native exception
// messages: Workers fetch failures may include URLs, credentials or response data.
const SAFE_OUTBOX_FAILURES=new Set([
 "WEBHOOK_ENDPOINT_NOT_PINN","STORED_LICENSE_JSON_INVALID",
 "PROTECTED_LICENSE_MISMATCH","WEBHOOK_TIMEOUT_API_UNAVAILABLE",
 "WEBHOOK_ACK_HTTP_INVALID","WEBHOOK_ACK_JSON_INVALID",
 "WEBHOOK_ACK_IDENTITY_INVALID","WEBHOOK_ACK_D1_ATOMIC_COMMIT_FAILED"
]);
function safeOutboxFailure(error,stage){
 const msg=typeof error?.message==="string"?error.message:"";
 const prefix="RISK_STREAM_COMMERCIAL_OUTBOX_";
 if(msg.startsWith(prefix)){
  const candidate=msg.slice(prefix.length);
  if(SAFE_OUTBOX_FAILURES.has(candidate)||
     /^WEBHOOK_ACK_HTTP_[1-5][0-9]{2}(?:_REDIRECT)?$/u.test(candidate))
   return candidate;
 }
 if(stage==="WEBHOOK_FETCH"){
  if(error?.name==="TimeoutError"||error?.name==="AbortError")
   return "WEBHOOK_FETCH_TIMEOUT";
  return "WEBHOOK_FETCH_EXCEPTION";
 }
 if(stage==="LICENSE_VERIFY")return "LICENSE_VERIFICATION_EXCEPTION";
 if(stage==="WEBHOOK_ACK_PARSE")return "WEBHOOK_ACK_PARSE_EXCEPTION";
 if(stage==="D1_ACK_COMMIT")return "WEBHOOK_D1_COMMIT_EXCEPTION";
 if(stage==="ENDPOINT_VERIFY")return "WEBHOOK_ENDPOINT_EXCEPTION";
 return "WEBHOOK_DISPATCH_EXCEPTION";
}

const parseHost=url=>{
 let u;try{u=new URL(url)}catch{return null}
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
   u.hostname==="localhost"||/^\d+(?:\.\d+){3}$/u.test(u.hostname)||
   u.hostname.includes(":")||u.hostname.endsWith(".local")||
   u.hostname.endsWith(".internal")||u.hostname.endsWith(".localhost")||
   u.hostname.endsWith(".test")||u.hostname.endsWith(".invalid")||
   u.hostname.endsWith(".onion")||
   !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu.test(u.hostname))
   return null;
 return u.hostname.toLowerCase();
};
export function commercialDeliveryIsEnabled(env){
 return env?.RISK_STREAM_ACTIVE==="1"&&
  env?.STREAM_INGESTION_ENABLED==="true"&&
  env?.GEOMACRO_COMMERCIAL_STREAM_RELEASE==="1"&&
  env?.RISK_STREAM_CANARY_HOLD_CLEARED==="1"&&
  HEX.test(env?.RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256??"")&&
  typeof env?.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64==="string"&&
  typeof env?.RISK_STREAM_GRO_VERIFY_SPKI_B64==="string"&&
  !!env?.DB?.prepare;
}
function approvedEndpoint(row,env){
 const urlHost=parseHost(row?.endpoint_url);
 const allow=(env?.GEOMACRO_LICENSED_WEBHOOK_DOMAINS??"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allow.length||!urlHost||urlHost!==row.approved_host||!allow.includes(urlHost))
  fail("WEBHOOK_ENDPOINT_NOT_PINNED");
 return row.endpoint_url;
}
async function writeRow(db,sql,args=[]){
 const result=await db.prepare(sql).bind(...args).run();
 if(result?.success!==true)fail("D1_STATE_WRITE_UNVERIFIED");
 return Number(result.meta?.changes??0);
}
/**
 * A separate trusted issuer prepares jobs AFTER verifying the original GRO,
 * the independently signed release, the entitlements and GeoMacro's licence.
 * This function is intentionally not exposed as a public HTTP endpoint.
 */
export async function stageLicensedCommercialDelivery(env,{client,groId,envelope,
 now=Date.now()}={}){
 if(!commercialDeliveryIsEnabled(env)||!env.DB.batch)
  fail("PROTECTED_RELEASE_NOT_ENABLED");
 if(!HEX.test(groId??"")||typeof client?.client_id!=="string"||
    client.client_id.length<8||client.client_id.length>120)
  fail("CLIENT_ID_OR_GRO_INVALID");
 // Never trust caller-supplied endpoint/rights/expiry fields. Recheck the
 // authoritative enrollment row under the production D1 binding.
 const enrolled=await env.DB.prepare("SELECT client_id,endpoint_url,approved_host,"+
  "enabled,entitlement_expires_at,release_receipt_sha256 "+
  "FROM risk_stream_commercial_subscriptions WHERE client_id=? LIMIT 1")
  .bind(client.client_id).first();
 if(!enrolled||enrolled.enabled!==1||
    Date.parse(enrolled.entitlement_expires_at)<=now||
    enrolled.release_receipt_sha256!==env.RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256)
  fail("CLIENT_ENTITLEMENT_OR_RELEASE_UNVERIFIED");
 approvedEndpoint(enrolled,env);
 const verified=await verifyGeoMacroCommercialLicense(envelope,{
  now,trustedLicensePublicSpkiB64:env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,
    trustedGroPublicSpkiB64:env.RISK_STREAM_GRO_VERIFY_SPKI_B64});
 if(envelope.payload.release_receipt_sha256!==enrolled.release_receipt_sha256)
  fail("SOURCE_GRO_RELEASE_BINDING_INVALID");
 const job=await licensedSha(enrolled.client_id+"\n"+groId+"\n"+verified.payload_sha256);
 const inserted=await writeRow(env.DB,
  "INSERT OR IGNORE INTO risk_stream_commercial_outbox "+
  "(job_id,client_id,gro_id,license_envelope_json,license_payload_sha256,"+
  "release_receipt_sha256,state,attempts,next_attempt_at,created_at) "+
  "VALUES (?,?,?,?,?,?,'PENDING',0,?,?)",
  [job,enrolled.client_id,groId,JSON.stringify(envelope),verified.payload_sha256,
   enrolled.release_receipt_sha256,iso(now),iso(now)]);
 const read=await env.DB.prepare("SELECT job_id,license_payload_sha256,release_receipt_sha256 "+
  "FROM risk_stream_commercial_outbox WHERE client_id=? AND gro_id=? LIMIT 1")
  .bind(enrolled.client_id,groId).first();
 if(read?.job_id!==job||read.license_payload_sha256!==verified.payload_sha256||
    read.release_receipt_sha256!==enrolled.release_receipt_sha256)
  fail("JOB_IDEMPOTENCY_OR_D1_READBACK_INVALID");
 return {status:inserted?"COMMERCIAL_JOB_STAGED":"COMMERCIAL_JOB_IDEMPOTENT",
  job_id:job,customer_delivery_performed:false};
}
/**
 * At-most-ten per existing one-minute Worker cron. Durable lease + receiver
 * idempotency key prevent blind replay; timeout is retried after lease expiry.
 * A 2xx without a verified matching structured ACK is NOT delivery.
 */
export async function dispatchLicensedCommercialOutbox(env,{
 now=Date.now(),fetcher=fetch,max=10,jobId=null
}={}){
 if(!commercialDeliveryIsEnabled(env))
  return {status:"HOLD_COMMERCIAL_RELEASE_NOT_VERIFIED",sent:0};
 if(!Number.isSafeInteger(max)||max<1||max>10)fail("INVALID_BATCH_SIZE");
 if(jobId!==null&&!HEX.test(jobId))fail("INVALID_SCOPED_JOB_ID");
 const db=env.DB,nowIso=iso(now);
 const q=await db.prepare("SELECT o.job_id,o.client_id,o.gro_id,o.license_envelope_json,"+
  "o.license_payload_sha256,o.release_receipt_sha256,o.attempts,"+
  "s.endpoint_url,s.approved_host,s.entitlement_expires_at "+
  "FROM risk_stream_commercial_outbox o "+
  "JOIN risk_stream_commercial_subscriptions s ON s.client_id=o.client_id "+
  "WHERE (o.state='PENDING' AND o.next_attempt_at<=? OR "+
  "o.state='LEASED' AND o.lease_expires_at<=?) AND o.attempts<16 "+
  "AND s.enabled=1 AND s.entitlement_expires_at>? "+
  (jobId===null?"":"AND o.job_id=? ")+
  "ORDER BY o.created_at,o.job_id LIMIT ?")
  .bind(...(jobId===null?[nowIso,nowIso,nowIso,max]:
    [nowIso,nowIso,nowIso,jobId,max])).all();
 if(!Array.isArray(q?.results)||q.results.length>max)
  fail("D1_DUE_ROWS_INVALID");
 let sent=0,held=0,retry=0;
 const failureCodes=new Set();
 let lastFailureCode=null,lastFailureStage=null;
 for(const row of q.results){
  if(!HEX.test(row.job_id??"")||!HEX.test(row.license_payload_sha256??"")||
    row.release_receipt_sha256!==env.RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256)
  {held++;continue}
  const leaseUntil=iso(now+45000);
  // Lock one due job before any network side effect.
  const claimed=await writeRow(db,"UPDATE risk_stream_commercial_outbox SET "+
   "state='LEASED',lease_expires_at=?,attempts=attempts+1 "+
   "WHERE job_id=? AND attempts<16 AND "+
   "((state='PENDING' AND next_attempt_at<=?) OR "+
   "(state='LEASED' AND lease_expires_at<=?))",
   [leaseUntil,row.job_id,nowIso,nowIso]);
  if(claimed!==1)continue;
  let stage="ENDPOINT_VERIFY";
  try{
   const url=approvedEndpoint(row,env);
   let envelope;try{envelope=JSON.parse(row.license_envelope_json)}
   catch{fail("STORED_LICENSE_JSON_INVALID")}
   stage="LICENSE_VERIFY";
   const verified=await verifyGeoMacroCommercialLicense(envelope,{
    now,trustedLicensePublicSpkiB64:env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,
    trustedGroPublicSpkiB64:env.RISK_STREAM_GRO_VERIFY_SPKI_B64});
   if(verified.payload_sha256!==row.license_payload_sha256||
      envelope.payload.release_receipt_sha256!==row.release_receipt_sha256)
    fail("PROTECTED_LICENSE_MISMATCH");
   stage="WEBHOOK_FETCH";
   // POST is not cacheable by normal HTTP rules. Avoid RequestInit.cache:
   // older workerd compatibility modes may reject this field entirely.
   // A bounded timeout is mandatory; never silently fall back to unbounded I/O.
   if(typeof AbortSignal?.timeout!=="function")
    fail("WEBHOOK_TIMEOUT_API_UNAVAILABLE");
   const response=await fetcher(url,{
    method:"POST",redirect:"manual",
    headers:{"Content-Type":"application/json","X-GeoMacro-License-ID":envelope.payload.license_id,
     "X-GeoMacro-Delivery-ID":row.job_id,"Idempotency-Key":row.job_id},
    body:JSON.stringify(envelope),signal:AbortSignal.timeout(12000)});
   stage="WEBHOOK_ACK_HTTP";
   if(response.status!==200||response.redirected){
    const status=Number.isInteger(response.status)&&response.status>=100&&
      response.status<=599?String(response.status):"INVALID";
    fail("WEBHOOK_ACK_HTTP_"+status+(response.redirected?"_REDIRECT":""));
   }
   stage="WEBHOOK_ACK_PARSE";
   let ack;try{ack=await response.json()}catch{fail("WEBHOOK_ACK_JSON_INVALID")}
   stage="WEBHOOK_ACK_IDENTITY";
   if(ack?.schema!=="geomacro.commercial-webhook-ack.v1"||
      ack.job_id!==row.job_id||ack.payload_sha256!==row.license_payload_sha256||
      !["ACCEPTED","DUPLICATE"].includes(ack.status))
    fail("WEBHOOK_ACK_IDENTITY_INVALID");
   const ackSha=await licensedSha(JSON.stringify(ack));
   stage="D1_ACK_COMMIT";
   // Transactionally record one receipt and state transition after customer ACK.
   const out=await db.batch([
    db.prepare("INSERT OR IGNORE INTO risk_stream_commercial_delivery_receipts "+
     "(job_id,client_id,gro_id,license_payload_sha256,provider_ack_sha256,received_at) "+
     "VALUES (?,?,?,?,?,?)")
     .bind(row.job_id,row.client_id,row.gro_id,row.license_payload_sha256,ackSha,nowIso),
    db.prepare("UPDATE risk_stream_commercial_outbox SET state='DISPATCHED',"+
     "dispatched_at=?,lease_expires_at=NULL WHERE job_id=? AND state='LEASED'")
     .bind(nowIso,row.job_id)
   ]);
   if(!Array.isArray(out)||out.length!==2||out.some(x=>x?.success!==true))
    fail("WEBHOOK_ACK_D1_ATOMIC_COMMIT_FAILED");
   sent++;
  }catch(error){
   const code=safeOutboxFailure(error,stage);
   failureCodes.add(code);lastFailureCode=code;lastFailureStage=stage;
   const next=iso(now+Math.min(3600000,10000*Math.pow(2,Math.min(8,row.attempts||0))));
   await writeRow(db,"UPDATE risk_stream_commercial_outbox SET "+
    "state='PENDING',next_attempt_at=?,lease_expires_at=NULL "+
    "WHERE job_id=? AND state='LEASED' AND lease_expires_at=?",
    [next,row.job_id,leaseUntil]);
   retry++;
  }
 }
 return {status:retry?"RETRY_SCHEDULED":sent?"CUSTOMER_ACK_VERIFIED":"IDLE",
  sent,retry,held,attempted:q.results.length,commercial_delivery_enabled:true,
  failure_codes:[...failureCodes].sort(),last_failure_code:lastFailureCode,
  last_failure_stage:lastFailureStage};
}

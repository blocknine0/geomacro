/**
 * Synthetic cryptographic acceptance on ISOLATED shadow D1 only.
 * Performs actual D1 writes/readbacks and an actual HTTPS request to an
 * account-owned, non-customer test ACK Worker. Never establishes source rights.
 */
import {licensedSha,canonicalLicensedJson,issueGeoMacroCommercialLicense}
 from "../../control-plane/src/risk-stream-commercial-license.mjs";
import {stageLicensedCommercialDelivery,dispatchLicensedCommercialOutbox}
 from "../../control-plane/src/risk-stream-commercial-outbox.mjs";

const deny=x=>{throw Error("SHADOW_COMMERCIAL_E2E_"+x)};
const SAFE_SHADOW_ERRORS=new Set([
 "ISOLATION_OR_BINDINGS_INVALID","ACK_URL_INVALID","NON_CUSTOMER_ACK_HOST_REQUIRED",
 "RUN_ID_INVALID","SHADOW_GRO_INSERT_FAILED","SHADOW_SUBSCRIPTION_INSERT_FAILED",
 "SHADOW_OUTBOX_INSERT_FAILED","SHADOW_D1_ACK_READBACK_MISMATCH",
 "DESTINATION_CHANGED"
]);
/** Stable non-sensitive errors only; never serialize arbitrary Error.message. */
export function sanitizedShadowCommercialError(error){
 const value=typeof error?.message==="string"?error.message:"";
 const prefix="SHADOW_COMMERCIAL_E2E_";
 if(value.startsWith(prefix)){
  const code=value.slice(prefix.length);
  if(SAFE_SHADOW_ERRORS.has(code))return value;
  if(/^SHADOW_HTTPS_ACK_NOT_ACCEPTED_(?:WEBHOOK_[A-Z0-9_]{4,64}|LICENSE_VERIFICATION_EXCEPTION)$/u.test(code))
   return value;
 }
 return "SHADOW_COMMERCIAL_E2E_UNCLASSIFIED_FAILURE";
}

const enc=new TextEncoder();
const b64=arr=>btoa(String.fromCharCode(...new Uint8Array(arr)));
const spki=async k=>b64(await crypto.subtle.exportKey("spki",k));
const pkcs8=async k=>b64(await crypto.subtle.exportKey("pkcs8",k));
const iso=ms=>new Date(ms).toISOString();
const requireShadow=(env,ackUrl)=>{
 if(env?.STREAM_MODE!=="SHADOW_AUDIT"||
    env.RISK_STREAM_ACTIVE!=="0"||
    env.STREAM_INGESTION_ENABLED!=="false"||
    env.GEOMACRO_COMMERCIAL_STREAM_RELEASE==="1"||
    env.RISK_STREAM_CANARY_HOLD_CLEARED==="1"||
    typeof env.GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64!=="string"||
    typeof env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64!=="string"||
    !env.DB?.prepare||!env.DB?.batch||
    typeof env.STREAM_SHADOW_ACK_TOKEN!=="string"||
    env.STREAM_SHADOW_ACK_TOKEN.length<32)
  deny("ISOLATION_OR_BINDINGS_INVALID");
 let url;try{url=new URL(ackUrl)}catch{deny("ACK_URL_INVALID")}
 if(url.protocol!=="https:"||url.port||url.username||url.password||
    url.search||url.hash||url.pathname!=="/v1/internal/mock-commercial-ack"||
    !/^geomacro-risk-stream-shadow-ack\.[a-z0-9-]+\.workers\.dev$/u.test(url.hostname))
  deny("NON_CUSTOMER_ACK_HOST_REQUIRED");
 return url;
};
async function pair(){
 return crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
}
export async function runIsolatedCommercialE2E(env,{
 ackUrl,now=Date.now(),fetcher=fetch,runId
}={}){
 const url=requireShadow(env,ackUrl);
 if(typeof runId!=="string"||!/^[a-z0-9-]{12,80}$/u.test(runId))
  deny("RUN_ID_INVALID");
 const id=await licensedSha("shadow-commercial-e2e-v1\n"+runId);
 const originals=[
  await licensedSha("shadow-original-a\n"+id),
  await licensedSha("shadow-original-b\n"+id)
 ];
 const [groKeys,reviewKeys]=await Promise.all([pair(),pair()]);
 const groPub=await spki(groKeys.publicKey);
 const licensePub=env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64;
 const reviewPub=await spki(reviewKeys.publicKey);
 const gro={schema:"geomacro.event-stream-gro.v1",
  subject:{type:"COUNTRY",id:"USA"},category:"GEOPOLITICS",
  event_fingerprint:await licensedSha("shadow-fingerprint\n"+id),
  source_originals:originals,
  what_happened:"Synthetic shadow event, not a real published news fact",
  why_it_matters:"Tests the isolated licensed stream acceptance contract",
  market_relevance:"No actual market exposure or external rights claimed",
  what_to_watch:"Monitor shadow provider D1 and mocked HTTPS ACK only",
  evidence_and_confidence:{source_rights_and_origins:"DUAL_MACHINE_ATTESTED",
    raw_sources_not_republished:true},
  generated_at:iso(now),expires_at:iso(now+3600000),
  customer_delivery_authorized:true,execution_authorized:false,
  charged:false,certified_risk_index:false};
 const groJson=JSON.stringify(gro),groHash=await licensedSha(groJson);
 const groSig=b64(await crypto.subtle.sign(
  "Ed25519",groKeys.privateKey,enc.encode(groJson)));
 const releaseHash=await licensedSha("shadow-commercial-release\n"+id);
 const clientId="shadow_test_"+id.slice(0,36);
 const score={country_iso3:"USA",category:"GEOPOLITICS",
  value_0_100:42,provenance:"SHADOW_SYNTHETIC_TWO_ORIGINALS",
  derived_only:true,licensed_source_text_included:false,
  independent_accuracy_certified:false};
 const approval={schema:"geomacro.commercial-release-accepted.v1",
  production_release_verified:true,
  independent_source_rights_verified:true,
  customer_entitlement_verified:true,go_live_approved:true,
  canary_hold_cleared:true,
  validated_gro_sha256:groHash,
  signed_release_receipt_sha256:releaseHash,
  reviewed_at:iso(now)};
 approval.signature_b64=b64(await crypto.subtle.sign("Ed25519",
  reviewKeys.privateKey,enc.encode(
    "geomacro.commercial-independent-release-review.v1\n"+
    canonicalLicensedJson(approval))));
 const license=await issueGeoMacroCommercialLicense({
  record:{gro_id:id,payload_json:groJson,payload_sha256:groHash,signature_b64:groSig},
  groPublicSpkiB64:groPub,
  licensePrivatePkcs8B64:env.GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64,
  licensePublicSpkiB64:licensePub,
  releasePublicSpkiB64:reviewPub,
  eligibleDerivedScore:score,approval,now
 });
 // Simulated entitlements exist ONLY on the isolated SHADOW database.
 const db=env.DB;
 const stored=await db.prepare(
  "INSERT OR IGNORE INTO risk_stream_signed_gro "+
  "(gro_id,country_iso3,category,event_fingerprint,payload_json,"+
  "payload_sha256,signature_b64,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)")
  .bind(id,"USA","GEOPOLITICS",gro.event_fingerprint,groJson,groHash,
    groSig,iso(now),gro.expires_at).run();
 if(stored?.success!==true)deny("SHADOW_GRO_INSERT_FAILED");
 const sub=await db.prepare(
  "INSERT OR IGNORE INTO risk_stream_commercial_subscriptions "+
  "(client_id,endpoint_url,approved_host,enabled,entitlement_expires_at,"+
  "approved_at,release_receipt_sha256) VALUES (?,?,?,?,?,?,?)")
  .bind(clientId,url.toString(),url.hostname,1,iso(now+3600000),
    iso(now),releaseHash).run();
 if(sub?.success!==true)deny("SHADOW_SUBSCRIPTION_INSERT_FAILED");
 const stagedEnv={...env,RISK_STREAM_ACTIVE:"1",
  STREAM_INGESTION_ENABLED:"true",
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",
  RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:releaseHash,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:licensePub,
  RISK_STREAM_GRO_VERIFY_SPKI_B64:groPub,
  GEOMACRO_LICENSED_WEBHOOK_DOMAINS:url.hostname};
 // These local overrides never modify deployed vars, secret bindings or
 // production release policy. Independent test keys are ephemeral.
 const queued=await stageLicensedCommercialDelivery(stagedEnv,{
  client:{client_id:clientId},groId:id,envelope:license,now});
 if(!["COMMERCIAL_JOB_STAGED","COMMERCIAL_JOB_IDEMPOTENT"].includes(queued.status))
  deny("SHADOW_OUTBOX_INSERT_FAILED");
 const jobId=queued.job_id;
 const sent=await dispatchLicensedCommercialOutbox(stagedEnv,{
  now,max:1,jobId,
  fetcher:async(destination,options)=>{
   if(destination!==url.toString())deny("DESTINATION_CHANGED");
   return fetcher(destination,{...options,headers:{
    ...options.headers,
    "X-GeoMacro-Shadow-ACK":env.STREAM_SHADOW_ACK_TOKEN
   }});
  }
 });
 if(sent.sent!==1||sent.retry!==0||sent.held!==0){
  // Include only the dispatcher's fixed enum, not native exception messages,
  // target URLs, response bodies, webhook tokens or raw ACK headers.
  const code=typeof sent.last_failure_code==="string"&&
   /^(?:WEBHOOK_[A-Z0-9_]{4,64}|LICENSE_VERIFICATION_EXCEPTION)$/u.test(sent.last_failure_code)
   ?sent.last_failure_code:"WEBHOOK_DISPATCH_UNCLASSIFIED";
  deny("SHADOW_HTTPS_ACK_NOT_ACCEPTED_"+code);
 }
 const row=await db.prepare(
  "SELECT o.job_id,o.state,o.license_payload_sha256,r.provider_ack_sha256,"+
  "r.received_at FROM risk_stream_commercial_outbox o "+
  "JOIN risk_stream_commercial_delivery_receipts r ON r.job_id=o.job_id "+
  "WHERE o.job_id=? AND o.client_id=? LIMIT 1")
  .bind(jobId,clientId).first();
 if(row?.job_id!==jobId||row.state!=="DISPATCHED"||
    row.license_payload_sha256!==license.license_proof.payload_sha256||
    !/^[a-f0-9]{64}$/u.test(row.provider_ack_sha256??"")||
    !Number.isFinite(Date.parse(row.received_at)))
  deny("SHADOW_D1_ACK_READBACK_MISMATCH");
 return {schema:"geomacro.shadow-commercial-e2e.v1",status:"PASS",
  run_id:runId,source_sha:env.SHADOW_REVIEWED_SHA??null,
  license_id:license.payload.license_id,
  gro_signature_verified:true,license_signature_verified:true,
  commercial_outbox_readback:true,https_mock_ack_verified:true,
  delivery_receipt_readback:true,provider_d1_503_observed:0,
  global_cloudflare_503_not_inferred:true,
  synthetic_fixtures_only:true,independent_real_originals_verified:false,
  production_release_unchanged:true,customer_traffic_sent:false,
  no_funds:true,job_id:jobId};
}

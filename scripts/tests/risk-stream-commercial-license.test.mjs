import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {issueGeoMacroCommercialLicense,verifyGeoMacroCommercialLicense,
  GEOMACRO_LICENSE_ID,canonicalLicensedJson}
 from "../../workers/control-plane/src/risk-stream-commercial-license.mjs";
import {dispatchLicensedCommercialOutbox,commercialDeliveryIsEnabled}
 from "../../workers/control-plane/src/risk-stream-commercial-outbox.mjs";
const now=Date.parse("2026-11-12T01:00:00Z");
const b64=key=>key.export({format:"der",type:"spki"}).toString("base64");
const pkcs8=key=>key.export({format:"der",type:"pkcs8"}).toString("base64");
const sha=s=>createHash("sha256").update(s).digest("hex");
function fixture(){
 const groKey=generateKeyPairSync("ed25519"),
  licKey=generateKeyPairSync("ed25519"),releaseKey=generateKeyPairSync("ed25519");
 const p={schema:"geomacro.event-stream-gro.v1",
  subject:{type:"COUNTRY",id:"USA"},category:"GEOPOLITICS",
  event_fingerprint:sha("test-event"),
  source_originals:[sha("origin-a"),sha("origin-b")],
  what_happened:"Two original publishers documented the sanctions decision",
  why_it_matters:"Sanctions affect the stated international economic exposure",
  market_relevance:"Quantification is derived separately from market data",
  what_to_watch:"Monitor enforcement changes and subsequent trade flows",
  evidence_and_confidence:{source_rights_and_origins:"DUAL_MACHINE_ATTESTED",
   raw_sources_not_republished:true},
  generated_at:new Date(now-3600000).toISOString(),
  expires_at:new Date(now+3600000).toISOString(),
  customer_delivery_authorized:true,charged:false,
  execution_authorized:false,certified_risk_index:false};
 const json=JSON.stringify(p),hash=sha(json);
 const record={gro_id:sha("gro-id"),payload_json:json,payload_sha256:hash,
  signature_b64:sign(null,Buffer.from(json),groKey.privateKey).toString("base64")};
 const release={schema:"geomacro.commercial-release-accepted.v1",
  production_release_verified:true,independent_source_rights_verified:true,
  customer_entitlement_verified:true,go_live_approved:true,canary_hold_cleared:true,
  validated_gro_sha256:hash,signed_release_receipt_sha256:sha("accepted-stage2-release"),
  reviewed_at:new Date(now-30000).toISOString()};
 release.signature_b64=sign(null,Buffer.from("geomacro.commercial-independent-release-review.v1\n"+
   canonicalLicensedJson(release)),releaseKey.privateKey).toString("base64");
 const inputs={record,groPublicSpkiB64:b64(groKey.publicKey),
  licensePrivatePkcs8B64:pkcs8(licKey.privateKey),
  licensePublicSpkiB64:b64(licKey.publicKey),
  releasePublicSpkiB64:b64(releaseKey.publicKey),approval:release,
  eligibleDerivedScore:{country_iso3:"USA",category:"GEOPOLITICS",
   value_0_100:62,provenance:"TWO_ORIGINALS",derived_only:true,
   licensed_source_text_included:false,independent_accuracy_certified:false},
  now};
 return {inputs,release,licKey,groKey};
}
test("GeoMacro derived commercial licence has domain-separated pinned Ed25519 provenance",async()=>{
 const f=fixture();
 const e=await issueGeoMacroCommercialLicense(f.inputs);
 assert.equal(e.payload.license_id,GEOMACRO_LICENSE_ID);
 assert.equal(e.license_proof.authorized_redistribution,true);
 assert.equal(e.payload.third_party_publisher_licensing_not_granted,true);
 assert.equal(e.payload.derived.risk_score_0_100,62);
 const verified=await verifyGeoMacroCommercialLicense(e,{
  now,trustedLicensePublicSpkiB64:f.inputs.licensePublicSpkiB64,
  trustedGroPublicSpkiB64:f.inputs.groPublicSpkiB64});
 assert.equal(verified.status,"GEOMACRO_DERIVED_LICENSE_SIGNATURE_VERIFIED");
 assert.equal(verified.original_source_rights_not_derived_from_signature,true);
});
test("modified commercial score, unknown signing key and forged release signature fail closed",async()=>{
 const f=fixture(),e=await issueGeoMacroCommercialLicense(f.inputs);
 e.payload.derived.risk_score_0_100=99;
 await assert.rejects(verifyGeoMacroCommercialLicense(e,{
  now,trustedLicensePublicSpkiB64:f.inputs.licensePublicSpkiB64,
  trustedGroPublicSpkiB64:f.inputs.groPublicSpkiB64}),/ENVELOPE_SIGNATURE_OR_HASH_INVALID/);
 e.payload.derived.risk_score_0_100=62;
 await assert.rejects(verifyGeoMacroCommercialLicense(e,{now}),/PINNED_LICENSE_KEY_REQUIRED|PINNED_SOURCE_GRO_KEY_REQUIRED/);
 const attacker=generateKeyPairSync("ed25519");
 await assert.rejects(verifyGeoMacroCommercialLicense(e,{
  now,trustedLicensePublicSpkiB64:b64(attacker.publicKey),
  trustedGroPublicSpkiB64:f.inputs.groPublicSpkiB64}),/ENVELOPE_SIGNATURE_OR_HASH_INVALID/);
 const t=fixture();
 t.inputs.approval.signature_b64=sign(null,Buffer.from("forge"),t.groKey.privateKey).toString("base64");
 await assert.rejects(issueGeoMacroCommercialLicense(t.inputs),/RELEASE_REVIEW_SIGNATURE_INVALID/);
});
test("unsigned release, unverified rights, hold, and non-commercial GRO refuse licence issuance",async()=>{
 const f=fixture();
 f.inputs.approval.canary_hold_cleared=false;
 await assert.rejects(issueGeoMacroCommercialLicense(f.inputs),/INDEPENDENT_RELEASE_AUTHORITY_NOT_VERIFIED|RELEASE_REVIEW_SIGNATURE_INVALID/);
 const q=fixture();q.inputs.approval.independent_source_rights_verified=false;
 await assert.rejects(issueGeoMacroCommercialLicense(q.inputs),/INDEPENDENT_RELEASE_AUTHORITY_NOT_VERIFIED|RELEASE_REVIEW_SIGNATURE_INVALID/);
 const y=fixture();y.inputs.record.payload_json=y.inputs.record.payload_json.replace(
  '"customer_delivery_authorized":true','"customer_delivery_authorized":false');
 await assert.rejects(issueGeoMacroCommercialLicense(y.inputs),/SOURCE_GRO_HASH_INVALID/);
});
test("commercial dispatcher is disabled without a protected release and never calls network",async()=>{
 const f=fixture();let calls=0;
 const response=await dispatchLicensedCommercialOutbox({
  DB:{prepare(){calls++;throw Error("SHOULD_NOT_READ_DB")}},
  RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true"
 },{now,fetcher:async()=>{calls++;throw Error("SHOULD_NOT_SEND")}});
 assert.equal(response.status,"HOLD_COMMERCIAL_RELEASE_NOT_VERIFIED");
 assert.equal(response.sent,0);assert.equal(calls,0);
 assert.equal(commercialDeliveryIsEnabled({}),false);
});
test("one real cryptographic licence passes durable leased delivery with matching customer ACK",async()=>{
 const f=fixture(),e=await issueGeoMacroCommercialLicense(f.inputs);
 const client="client_enterprise_01",job=sha("customer-job"),gro=sha("gro-id");
 const env={RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:f.release.signed_release_receipt_sha256,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:f.inputs.licensePublicSpkiB64,
  RISK_STREAM_GRO_VERIFY_SPKI_B64:f.inputs.groPublicSpkiB64,
  GEOMACRO_LICENSED_WEBHOOK_DOMAINS:"risk.customer.example.org"};
 const row={job_id:job,client_id:client,gro_id:gro,
  license_envelope_json:JSON.stringify(e),
  license_payload_sha256:e.license_proof.payload_sha256,
  release_receipt_sha256:f.release.signed_release_receipt_sha256,
  attempts:0,endpoint_url:"https://risk.customer.example.org/hooks/geomacro",
  approved_host:"risk.customer.example.org",
  entitlement_expires_at:new Date(now+86400000).toISOString()};
 const calls=[],records=new Map();let state="PENDING";
 const db={prepare(sql){return {bind(...args){this.args=args;return this},
  async all(){assert.match(sql,/risk_stream_commercial_outbox/);
   return {results:state==="PENDING"?[row]:[]}},
  async run(){calls.push({sql,args:this.args});
   if(sql.includes("state='LEASED'")){state="LEASED";return {success:true,meta:{changes:1}}}
   if(sql.includes("state='PENDING'")){state="PENDING";return {success:true,meta:{changes:1}}}
   return {success:true,meta:{changes:1}}
  }}},async batch(stmts){assert.equal(stmts.length,2);
   records.set(job,stmts[0].args);
   state="DISPATCHED";
   return [{success:true},{success:true}]}
 };
 env.DB=db;let posts=0;
 const result=await dispatchLicensedCommercialOutbox(env,{now,fetcher:async(url,request)=>{
  posts++;assert.equal(url,row.endpoint_url);
  // Regression: workerd variants can throw on RequestInit.cache.
  assert.equal(Object.hasOwn(request,"cache"),false);
  assert.equal(request.redirect,"manual");
  assert.equal(request.method,"POST");
  assert.equal(typeof request.signal?.aborted,"boolean");
  assert.equal(request.headers["Idempotency-Key"],job);
  assert.equal(JSON.parse(request.body).license_proof.payload_sha256,row.license_payload_sha256);
  return Response.json({schema:"geomacro.commercial-webhook-ack.v1",
   job_id:job,payload_sha256:row.license_payload_sha256,status:"ACCEPTED"});
 }});
 assert.equal(result.status,"CUSTOMER_ACK_VERIFIED");
 assert.equal(posts,1);assert.equal(state,"DISPATCHED");assert.equal(records.size,1);
 const again=await dispatchLicensedCommercialOutbox(env,{now});
 assert.equal(again.sent,0);
});
test("webhook URL not explicitly pinned cannot leak signed payload",async()=>{
 const f=fixture(),e=await issueGeoMacroCommercialLicense(f.inputs);
 const env={RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:f.release.signed_release_receipt_sha256,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:f.inputs.licensePublicSpkiB64,
  RISK_STREAM_GRO_VERIFY_SPKI_B64:f.inputs.groPublicSpkiB64,
  GEOMACRO_LICENSED_WEBHOOK_DOMAINS:"good.example.org"};
 const row={job_id:sha("bad-job"),client_id:"bad_customer",gro_id:sha("bad-gro"),
  license_envelope_json:JSON.stringify(e),
  license_payload_sha256:e.license_proof.payload_sha256,
  release_receipt_sha256:f.release.signed_release_receipt_sha256,
  attempts:0,endpoint_url:"https://127.0.0.1/secret",
  approved_host:"127.0.0.1",entitlement_expires_at:new Date(now+86400000).toISOString()};
 let claimed=false;let network=0;
 env.DB={prepare(sql){return {bind(...args){this.args=args;return this},
  async all(){return {results:[row]}},
  async run(){if(sql.includes("state='LEASED'"))claimed=true;
   return {success:true,meta:{changes:1}}}}}};
 const result=await dispatchLicensedCommercialOutbox(env,{now,
  fetcher:async()=>{network++;return Response.json({})}});
 assert.equal(claimed,true);assert.equal(network,0);
 assert.equal(result.retry,1);
});


function dispatchFailureFixture(){
 const f=fixture(),clientId="client_retry_safe_01",jobId=sha("safe-retry-job");
 const groId=sha("gro-id");
 const outbox={job_id:jobId,client_id:clientId,gro_id:groId,
  license_envelope_json:null,
  license_payload_sha256:null,
  release_receipt_sha256:f.release.signed_release_receipt_sha256,
  attempts:0,endpoint_url:"https://risk.customer.example.org/hooks/geomacro",
  approved_host:"risk.customer.example.org",
  entitlement_expires_at:new Date(now+86400000).toISOString()};
 const env={RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:f.release.signed_release_receipt_sha256,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:f.inputs.licensePublicSpkiB64,
  RISK_STREAM_GRO_VERIFY_SPKI_B64:f.inputs.groPublicSpkiB64,
  GEOMACRO_LICENSED_WEBHOOK_DOMAINS:"risk.customer.example.org"};
 let state="PENDING",leaseCount=0,requeued=0;
 const db={prepare(sql){return {bind(...args){this.args=args;return this},
  async all(){return {results:state==="PENDING"?[outbox]:[]}},
  async run(){
   if(sql.includes("SET state='LEASED'")){
    leaseCount++;state="LEASED";return {success:true,meta:{changes:1}};
   }
   if(sql.includes("SET state='PENDING'")){
    requeued++;state="PENDING";return {success:true,meta:{changes:1}};
   }
   throw Error("UNEXPECTED_WRITE_SQL");
  }}},async batch(){throw Error("UNEXPECTED_ACK_COMMIT")}};
 env.DB=db;
 const setEnvelope=async()=>{
  const e=await issueGeoMacroCommercialLicense(f.inputs);
  outbox.license_envelope_json=JSON.stringify(e);
  outbox.license_payload_sha256=e.license_proof.payload_sha256;
 };
 return {env,outbox,setEnvelope,stats:()=>({state,leaseCount,requeued})};
}
test("workerd-style transport exception returns only sanitized code and keeps durable retry",async()=>{
 const f=dispatchFailureFixture();await f.setEnvelope();
 let invoked=0;
 const result=await dispatchLicensedCommercialOutbox(f.env,{
  now,jobId:f.outbox.job_id,max:1,fetcher:async(_url,request)=>{
   invoked++;
   assert.equal(Object.hasOwn(request,"cache"),false);
   throw Error("The cache field on RequestInitializerDict is not implemented; secret=deadbeef; https://customer.private/");
  }
 });
 assert.equal(invoked,1);
 assert.equal(result.status,"RETRY_SCHEDULED");
 assert.equal(result.retry,1);assert.equal(result.sent,0);
 assert.deepEqual(result.failure_codes,["WEBHOOK_FETCH_EXCEPTION"]);
 assert.equal(result.last_failure_stage,"WEBHOOK_FETCH");
 assert.equal(result.last_failure_code,"WEBHOOK_FETCH_EXCEPTION");
 assert.equal(f.stats().state,"PENDING");
 assert.equal(f.stats().leaseCount,1);
 assert.equal(f.stats().requeued,1);
 assert.doesNotMatch(JSON.stringify(result),/deadbeef|customer\.private|RequestInitializerDict/);
});
test("invalid ACK and invalid license emit different allowlisted diagnostic codes",async()=>{
 const x=dispatchFailureFixture();await x.setEnvelope();
 const badAck=await dispatchLicensedCommercialOutbox(x.env,{
  now,max:1,jobId:x.outbox.job_id,fetcher:async()=>Response.json({
   schema:"geomacro.commercial-webhook-ack.v1",
   job_id:x.outbox.job_id,payload_sha256:sha("wrong"),status:"ACCEPTED"
  })
 });
 assert.deepEqual(badAck.failure_codes,["WEBHOOK_ACK_IDENTITY_INVALID"]);
 assert.equal(badAck.last_failure_stage,"WEBHOOK_ACK_IDENTITY");
 const y=dispatchFailureFixture();await y.setEnvelope();
 // Corrupt stored signed proof after staging: verification must fail BEFORE HTTP.
 y.outbox.license_envelope_json=y.outbox.license_envelope_json
  .replace('"risk_score_0_100":62','"risk_score_0_100":99');
 let calls=0;
 const license=await dispatchLicensedCommercialOutbox(y.env,{
  now,jobId:y.outbox.job_id,max:1,fetcher:async()=>{calls++;throw Error("UNEXPECTED_FETCH")}
 });
 assert.equal(calls,0);
 assert.deepEqual(license.failure_codes,["LICENSE_VERIFICATION_EXCEPTION"]);
 assert.equal(license.last_failure_stage,"LICENSE_VERIFY");
});
test("timeout is classified, but native timeout details cannot be returned",async()=>{
 const f=dispatchFailureFixture();await f.setEnvelope();
 const r=await dispatchLicensedCommercialOutbox(f.env,{now,max:1,
  fetcher:async()=>{
   const e=new Error("sensitive timeout URL https://private.example/a");
   e.name="TimeoutError";throw e;
  }});
 assert.deepEqual(r.failure_codes,["WEBHOOK_FETCH_TIMEOUT"]);
 assert.doesNotMatch(JSON.stringify(r),/private\.example|sensitive/);
});


test("non-200 ACK yields bounded HTTP code and preserves requeue semantics",async()=>{
 for(const status of [400,401,403,404,413,429,502,503]){
  const f=dispatchFailureFixture();await f.setEnvelope();
  const result=await dispatchLicensedCommercialOutbox(f.env,{
   now,max:1,jobId:f.outbox.job_id,
   fetcher:async()=>new Response("sensitive target https://customer.invalid/token=abc",
    {status})
  });
  assert.equal(result.status,"RETRY_SCHEDULED");
  assert.equal(result.retry,1);
  assert.deepEqual(result.failure_codes,["WEBHOOK_ACK_HTTP_"+status]);
  assert.equal(result.last_failure_code,"WEBHOOK_ACK_HTTP_"+status);
  assert.equal(result.last_failure_stage,"WEBHOOK_ACK_HTTP");
  assert.equal(f.stats().state,"PENDING");
  assert.equal(f.stats().requeued,1);
  assert.doesNotMatch(JSON.stringify(result),/customer|token|sensitive/);
 }
});
test("redirected ACK is denied and cannot be mistaken for customer acceptance",async()=>{
 const f=dispatchFailureFixture();await f.setEnvelope();
 const result=await dispatchLicensedCommercialOutbox(f.env,{
  now,max:1,jobId:f.outbox.job_id,
  fetcher:async()=>Response.redirect("https://somewhere.example/other",302)
 });
 assert.deepEqual(result.failure_codes,["WEBHOOK_ACK_HTTP_302"]);
 assert.equal(result.last_failure_stage,"WEBHOOK_ACK_HTTP");
 assert.equal(result.sent,0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {runIsolatedCommercialE2E,sanitizedShadowCommercialError}
 from "../../workers/risk-stream-shadow/src/commercial-e2e.mjs";

const ackUrl="https://geomacro-risk-stream-shadow-ack.example-team.workers.dev/v1/internal/mock-commercial-ack";
const keyPair=generateKeyPairSync("ed25519");
const privateKey=keyPair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64");
const publicKey=keyPair.publicKey.export({format:"der",type:"spki"}).toString("base64");

function mockDatabase(){
 const state={source:null,subscription:null,outbox:null,receipt:null,counts:{db:0}};
 const db={prepare(sql){
  return {bind(...args){
   const call={
    sql,args,
    async run(){
     state.counts.db++;
     if(sql.includes("INSERT OR IGNORE INTO risk_stream_signed_gro")){
      state.source={gro_id:args[0],payload_sha256:args[5]};
      return {success:true,meta:{changes:1}};
     }
     if(sql.includes("INSERT OR IGNORE INTO risk_stream_commercial_subscriptions")){
      state.subscription={client_id:args[0],endpoint_url:args[1],
       approved_host:args[2],enabled:args[3],
       entitlement_expires_at:args[4],release_receipt_sha256:args[6]};
      return {success:true,meta:{changes:1}};
     }
     if(sql.includes("INSERT OR IGNORE INTO risk_stream_commercial_outbox")){
      state.outbox={job_id:args[0],client_id:args[1],gro_id:args[2],
       license_envelope_json:args[3],license_payload_sha256:args[4],
       release_receipt_sha256:args[5],attempts:0,state:"PENDING"};
      return {success:true,meta:{changes:1}};
     }
     if(sql.includes("SET state='LEASED'")){
      state.outbox.state="LEASED";return {success:true,meta:{changes:1}};
     }
     if(sql.includes("INSERT OR IGNORE INTO risk_stream_commercial_delivery_receipts")){
      state.receipt={provider_ack_sha256:args[4],received_at:args[5]};
      return {success:true,meta:{changes:1}};
     }
     if(sql.includes("SET state='DISPATCHED'")){
      state.outbox.state="DISPATCHED";return {success:true,meta:{changes:1}};
     }
     throw Error("Unexpected SQL run: "+sql.slice(0,80));
    },
    async first(){
     state.counts.db++;
     if(sql.includes("FROM risk_stream_commercial_subscriptions"))
      return state.subscription;
     if(sql.includes("FROM risk_stream_commercial_outbox WHERE client_id"))
      return state.outbox;
     if(sql.includes("JOIN risk_stream_commercial_delivery_receipts")){
      return {job_id:state.outbox.job_id,state:state.outbox.state,
       license_payload_sha256:state.outbox.license_payload_sha256,
       ...state.receipt};
     }
     throw Error("Unexpected SQL first: "+sql.slice(0,80));
    },
    async all(){
     state.counts.db++;
     if(sql.includes("FROM risk_stream_commercial_outbox o")){
      return {results:[{...state.outbox,...state.subscription}]};
     }
     throw Error("Unexpected SQL all: "+sql.slice(0,80));
    }
   };
   return call;
  }};
 },async batch(statements){
  const out=[];
  for(const s of statements)out.push(await s.run());
  return out;
 }};
 return {db,state};
}

test("isolated shadow uses actually pinned license key + D1 outbox + HTTPS ACK",async()=>{
 const {db,state}=mockDatabase();
 const env={STREAM_MODE:"SHADOW_AUDIT",RISK_STREAM_ACTIVE:"0",
  STREAM_INGESTION_ENABLED:"false",GEOMACRO_COMMERCIAL_STREAM_RELEASE:"0",
  RISK_STREAM_CANARY_HOLD_CLEARED:"0",STREAM_SHADOW_ACK_TOKEN:"z".repeat(64),
  GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64:privateKey,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:publicKey,
  SHADOW_REVIEWED_SHA:"f".repeat(40),DB:db};
 let calls=0;
 const receipt=await runIsolatedCommercialE2E(env,{
  ackUrl,now:Date.parse("2026-11-12T03:00:00Z"),
  runId:"shadow-regression-20261112",
  fetcher:async(url,req)=>{
   calls++;
   assert.equal(url,ackUrl);
   assert.equal(req.headers["X-GeoMacro-Shadow-ACK"],env.STREAM_SHADOW_ACK_TOKEN);
   assert.equal(Object.hasOwn(req,"cache"),false);
   assert.equal(req.headers["Idempotency-Key"],state.outbox.job_id);
   const payload=JSON.parse(req.body);
   return Response.json({schema:"geomacro.commercial-webhook-ack.v1",
    job_id:state.outbox.job_id,
    payload_sha256:payload.license_proof.payload_sha256,status:"ACCEPTED"});
  }
 });
 assert.equal(receipt.status,"PASS");
 assert.equal(receipt.license_id,"GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1");
 assert.equal(receipt.delivery_receipt_readback,true);
 assert.equal(receipt.production_release_unchanged,true);
 assert.equal(receipt.independent_real_originals_verified,false);
 assert.equal(calls,1);
 assert.equal(state.outbox.state,"DISPATCHED");
 assert.match(state.receipt.provider_ack_sha256,/^[a-f0-9]{64}$/);
 assert.equal(env.GEOMACRO_COMMERCIAL_STREAM_RELEASE,"0");
});
test("shadow test cannot run against non-shadow or a customer endpoint",async()=>{
 const {db}=mockDatabase();
 const env={STREAM_MODE:"PRODUCTION",RISK_STREAM_ACTIVE:"0",
  STREAM_INGESTION_ENABLED:"false",DB:db};
 await assert.rejects(runIsolatedCommercialE2E(env,{
  ackUrl,runId:"shadow-regression-20261112"}),
  /ISOLATION_OR_BINDINGS_INVALID/);
 const valid={...env,STREAM_MODE:"SHADOW_AUDIT",
  STREAM_SHADOW_ACK_TOKEN:"z".repeat(64),
  GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64:privateKey,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:publicKey};
 await assert.rejects(runIsolatedCommercialE2E(valid,{
  ackUrl:"https://actual-customer.example.org/hooks",
  runId:"shadow-regression-20261112"}),
  /NON_CUSTOMER_ACK_HOST_REQUIRED/);
});


test("shadow E2E exposes sanitized dispatch code without leaking upstream fetch exception",async()=>{
 const {db,state}=mockDatabase();
 const env={STREAM_MODE:"SHADOW_AUDIT",RISK_STREAM_ACTIVE:"0",
  STREAM_INGESTION_ENABLED:"false",GEOMACRO_COMMERCIAL_STREAM_RELEASE:"0",
  RISK_STREAM_CANARY_HOLD_CLEARED:"0",STREAM_SHADOW_ACK_TOKEN:"z".repeat(64),
  GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64:privateKey,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:publicKey,
  SHADOW_REVIEWED_SHA:"f".repeat(40),DB:db};
 await assert.rejects(runIsolatedCommercialE2E(env,{
  ackUrl,now:Date.parse("2026-11-12T03:00:00Z"),
  runId:"shadow-regression-retry-20261112",
  fetcher:async(_target,request)=>{
   assert.equal(Object.hasOwn(request,"cache"),false);
   throw Error("token=secret_12345 and https://realcustomer.test/webhook");
  }
 }),error=>{
  assert.equal(
   sanitizedShadowCommercialError(error),
   "SHADOW_COMMERCIAL_E2E_SHADOW_HTTPS_ACK_NOT_ACCEPTED_WEBHOOK_FETCH_EXCEPTION");
  assert.doesNotMatch(String(error.message),/secret_12345|realcustomer/);
  return true;
 });
 assert.equal(state.outbox.state,"PENDING");
});
test("untrusted errors at shadow boundary are replaced with a fixed code",()=>{
 const payload=new Error("fetch https://customer.example/token=abc");
 assert.equal(sanitizedShadowCommercialError(payload),
  "SHADOW_COMMERCIAL_E2E_UNCLASSIFIED_FAILURE");
 assert.doesNotMatch(sanitizedShadowCommercialError(payload),/abc|customer/);
});

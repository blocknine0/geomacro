import test from "node:test";
import assert from "node:assert/strict";
import {commercialIssuerEnabled,enqueueCommercialIssuerCandidate,
 issueReviewedCommercialCandidate,runCommercialIssuerTick}
 from "../../workers/control-plane/src/risk-stream-commercial-issuer.mjs";
const id="a".repeat(64),sha="b".repeat(64);
test("default-off issuer never writes D1 or calls review service",async()=>{
 let calls=0;
 const env={DB:{prepare(){calls++;throw Error("WRONG_DB_TOUCH")}},
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"0",
  GEOMACRO_RELEASE_REVIEWER:{fetch(){calls++;throw Error("WRONG_REVIEW")}}};
 assert.equal(commercialIssuerEnabled(env),false);
 assert.equal((await enqueueCommercialIssuerCandidate(env,id)).status,
  "HOLD_RELEASE_UNAVAILABLE");
 assert.equal((await runCommercialIssuerTick(env)).issued,0);
 await assert.rejects(issueReviewedCommercialCandidate(env,id),
  /PROTECTED_RELEASE_OR_REVIEWER_MISSING/);
 assert.equal(calls,0);
});
test("missing independently pinned reviewer key never enables issuer",()=>{
 const env={RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",
  RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:sha,
  RISK_STREAM_GRO_SIGN_PKCS8_B64:"x",
  RISK_STREAM_GRO_VERIFY_SPKI_B64:"x",
  GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64:"x",
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:"x",
  GEOMACRO_RELEASE_REVIEWER:{fetch:async()=>({})},
  DB:{prepare(){}}};
 assert.equal(commercialIssuerEnabled(env),false);
 env.GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64="pinned";
 assert.equal(commercialIssuerEnabled(env),true);
});


test("issuer tick defaults to a bounded 25-job Paid-D1 batch",async()=>{
 const calls=[];
 const env={RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:sha,
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:"pinned",
  RISK_STREAM_GRO_VERIFY_SPKI_B64:"pinned",
  RISK_STREAM_GRO_SIGN_PKCS8_B64:"pinned",
  GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64:"pinned",
  GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64:"pinned",
  GEOMACRO_RELEASE_REVIEWER:{fetch:async()=>{throw Error("NO_REVIEW_EXPECTED")}},
  DB:{prepare(sql){let args=[];calls.push({sql,get args(){return args}});
   return {bind(...values){args=values;return this},
    async all(){
     if(sql.includes("SELECT g.gro_id"))return {results:[]};
     return {results:Array.from({length:25},(_,i)=>({
      source_gro_id:String(i+1).padStart(64,"0"),attempts:0}))};
    },
    async run(){return {success:true,meta:{changes:0}}}};
  }}
 };
 const result=await runCommercialIssuerTick(env,{now:Date.parse("2026-11-17T12:00:00Z")});
 assert.equal(result.status,"ISSUER_TICK_OK");
 assert.equal(result.attempted,25);
 assert.equal(result.issued,0);
 assert.equal(calls.length,27);
 assert.match(calls[0].sql,/risk_stream_signed_gro/u);
 assert.equal(calls[0].args[2],25);
 assert.match(calls[1].sql,/risk_stream_commercial_issuer_jobs/u);
 assert.equal(calls[1].args[2],25);
 await assert.rejects(runCommercialIssuerTick(env,{max:26}),
  /INVALID_BATCH_LIMIT/u);
});


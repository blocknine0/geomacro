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
  "HOLD_REVIEWER_OR_RELEASE_UNAVAILABLE");
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

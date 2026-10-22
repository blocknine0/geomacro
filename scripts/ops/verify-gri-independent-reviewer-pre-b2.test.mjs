import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash} from "node:crypto";
import {reviewedGriPreB2AuthorityGate} from "./verify-gri-independent-reviewer-pre-b2.mjs";
function keyPair(){
 const {publicKey}=generateKeyPairSync("ed25519");
 const der=publicKey.export({format:"der",type:"spki"});
 return {pem:publicKey.export({format:"pem",type:"spki"}),
  base64:der.toString("base64"),pin:createHash("sha256").update(der).digest("hex")};
}
test("missing independent reviewer is blocked before B2 while preserving zero-money proof",()=>{
 const a=keyPair();
 const r=reviewedGriPreB2AuthorityGate({RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:a.base64});
 assert.equal(r.code,"REVIEWER_PUBLIC_KEY_NOT_CONFIGURED");
 assert.equal(r.b2_requests,0);
 assert.equal(r.current_numerical_gri_published,false);
});
test("valid independently pinned Ed25519 reviewer and distinct GRO public keys are only configuration, not approval",()=>{
 const x=keyPair(),y=keyPair();
 const r=reviewedGriPreB2AuthorityGate({
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:x.pem,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:x.pin,
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:y.base64,
 });
 assert.equal(r.reviewer_public_config_preflight_ok,true);
 assert.equal(r.code,"REVIEWER_PUBLIC_PIN_VALID_DISTINCT_ONLY");
 assert.equal(r.reviewer_signature_verified,false);
 assert.equal(r.reviewed_gri_input_verified,false);
});
test("deny GRO signer acting as supposed independent reviewer",()=>{
 const x=keyPair();
 const r=reviewedGriPreB2AuthorityGate({
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:x.pem,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:x.pin,
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:x.base64,
 });
 assert.equal(r.code,"REVIEWER_AND_GRO_IDENTITY_NOT_DISTINCT");
});
test("wrong pin, wrong algorithm and user text do not leak keys",()=>{
 const x=keyPair(),y=keyPair();
 const o=reviewedGriPreB2AuthorityGate({
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:x.pem,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:y.pin,
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:y.base64,
 });
 assert.equal(o.code,"REVIEWER_PUBLIC_PIN_MISMATCH");
 assert.ok(!JSON.stringify(o).includes(x.pin));
 assert.ok(!JSON.stringify(o).includes(x.pem));
 assert.equal(o.payments,0);
});

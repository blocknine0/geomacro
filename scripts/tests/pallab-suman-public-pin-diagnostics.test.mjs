import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash} from "node:crypto";
import {inspectPublicEd25519Pin,pallabSumanAuthorityReadiness}
 from "../ops/verify-pallab-suman-authority-readiness.mjs";
const {publicKey:ownerKey}=generateKeyPairSync("ed25519");
const {publicKey:reviewerKey}=generateKeyPairSync("ed25519");
const {publicKey:groKey}=generateKeyPairSync("ed25519");
const {publicKey:factsKey}=generateKeyPairSync("ed25519");
const {publicKey:rightsKey}=generateKeyPairSync("ed25519");
const pin=key=>createHash("sha256")
 .update(key.export({format:"der",type:"spki"})).digest("hex");
const pem=key=>key.export({format:"pem",type:"spki"}).toString("utf8");
const env=()=>({
 GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:pem(ownerKey),
 GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:pin(ownerKey),
 GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:pem(reviewerKey),
 GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:pin(reviewerKey),
 GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:pin(factsKey),
 GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:pin(rightsKey),
 RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:groKey.export({format:"der",type:"spki"}).toString("base64")
});
test("distinct real Ed25519 public key pins pass shape-only with no signature claims",()=>{
 const r=pallabSumanAuthorityReadiness(env());
 assert.equal(r.configured_public_key_shapes_passed,true);
 assert.equal(r.owner_public_key_check,"PUBLIC_PIN_VERIFIED");
 assert.equal(r.reviewer_public_key_check,"PUBLIC_PIN_VERIFIED");
 assert.equal(r.current_product_200_verified,false);
 assert.equal(r.owner_signature_uploaded_and_verified,false);
 assert.equal(r.reviewed_gri_signature_uploaded_and_verified,false);
 assert.equal(r.b2_requests,0);
});
test("safe finite diagnostics differentiate exact public-key setup mistakes",()=>{
 const good=env(),e={...good};
 const table=[
  [{...e,GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:""},"PUBLIC_PEM_SECRET_MISSING"],
  [{...e,GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:""},"PUBLIC_PIN_SECRET_MISSING"],
  [{...e,GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:"a".repeat(63)},"PUBLIC_PIN_NOT_LOWERCASE_64_HEX"],
  [{...e,GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:pem(ownerKey).replaceAll("\n","\\n")},"PUBLIC_PEM_HAS_LITERAL_BACKSLASH_N"],
  [{...e,GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:"not-a-pem"},"PUBLIC_PEM_HEADER_OR_NEWLINE_INVALID"],
  [{...e,GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:pin(reviewerKey)},"PUBLIC_KEY_SPKI_SHA256_MISMATCH"]
 ];
 for(const [config,expected] of table){
  const r=pallabSumanAuthorityReadiness(config);
  assert.equal(r.configured_public_key_shapes_passed,false);
  assert.equal(r.owner_public_key_check,expected);
  assert.equal(r.reviewer_public_key_check,"PUBLIC_PIN_VERIFIED");
  assert.equal(JSON.stringify(r).includes("BEGIN PUBLIC KEY"),false);
  assert.equal(JSON.stringify(r).includes(config.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256),false);
 }
});
test("Suman wrong pin, duplicate signer, and missing prior signer pins all stay red",()=>{
 const wrong=pallabSumanAuthorityReadiness({...env(),
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:pin(ownerKey)});
 assert.equal(wrong.reviewer_public_key_check,"PUBLIC_KEY_SPKI_SHA256_MISMATCH");
 const duplicates=pallabSumanAuthorityReadiness({...env(),
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:pem(ownerKey),
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:pin(ownerKey)});
 assert.equal(duplicates.status,"GOVERNANCE_KEY_IDENTITY_REUSE_OR_MISSING_PINS");
 const noFacts=pallabSumanAuthorityReadiness({...env(),
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:""});
 assert.equal(noFacts.configured_public_key_shapes_passed,false);
 assert.equal(noFacts.facts_public_pin_present_and_well_formed,false);
});
test("inspect rejects non-Ed25519 key even with matching DER pin",()=>{
 const {publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
 assert.equal(inspectPublicEd25519Pin(pem(publicKey),pin(publicKey)).status,
   "PUBLIC_KEY_NOT_ED25519");
});

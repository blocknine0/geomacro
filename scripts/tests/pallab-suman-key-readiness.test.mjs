import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash} from "node:crypto";
import {pallabSumanAuthorityReadiness} from "../ops/verify-pallab-suman-authority-readiness.mjs";
function id(){
 const {publicKey}=generateKeyPairSync("ed25519");
 const der=publicKey.export({format:"der",type:"spki"});
 return {pem:publicKey.export({format:"pem",type:"spki"}).toString(),
         pin:createHash("sha256").update(der).digest("hex"),
         spki:der.toString("base64")};
}
const distinct=()=>{
 const [owner,reviewer,facts,rights,gro]=Array.from({length:5},id);
 return {GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:owner.pem,
   GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:owner.pin,
   GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:reviewer.pem,
   GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:reviewer.pin,
   GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:facts.pin,
   GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:rights.pin,
   RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:gro.spki};
};
test("reports both missing owner and reviewer public key pins independently",()=>{
 const x=pallabSumanAuthorityReadiness({});
 assert.equal(x.status,"PALLAB_OWNER_PUBLIC_PIN_MISSING_OR_INVALID");
 assert.equal(x.pallab_owner_public_pin_verified,false);
 assert.equal(x.suman_reviewer_public_pin_verified,false);
 assert.equal(x.configured_public_key_shapes_passed,false);
 assert.equal(x.owner_signature_uploaded_and_verified,false);
 assert.equal(x.current_product_200_verified,false);
});
test("enrolled Suman is visible even while owner public PEM is missing",()=>{
 const env=distinct();
 delete env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM;
 const x=pallabSumanAuthorityReadiness(env);
 assert.equal(x.pallab_owner_public_pin_verified,false);
 assert.equal(x.suman_reviewer_public_pin_verified,true);
 assert.equal(x.gro_public_identity_pin_verified,true);
 assert.equal(x.facts_rights_public_pins_present,true);
 assert.equal(x.configured_public_key_shapes_passed,false);
});
test("enrolled Pallab is visible even while Suman public pin is missing",()=>{
 const env=distinct();
 delete env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256;
 const x=pallabSumanAuthorityReadiness(env);
 assert.equal(x.pallab_owner_public_pin_verified,true);
 assert.equal(x.suman_reviewer_public_pin_verified,false);
 assert.equal(x.status,"SUMAN_REVIEWER_PUBLIC_PIN_MISSING_OR_INVALID");
});
test("all five different Ed25519 pins green but cannot imply actual signatures",()=>{
 const x=pallabSumanAuthorityReadiness(distinct());
 assert.equal(x.configured_public_key_shapes_passed,true);
 assert.equal(x.status,"DISTINCT_APPROVED_PUBLIC_KEY_SHAPES_READY_ONLY");
 assert.equal(x.all_five_authority_keys_distinct,true);
 assert.equal(x.owner_signature_uploaded_and_verified,false);
 assert.equal(x.reviewed_gri_signature_uploaded_and_verified,false);
 assert.equal(x.signed_country_certificates_uploaded_and_verified,false);
 assert.equal(x.historical_b2_verified,false);
 assert.equal(x.current_product_200_verified,false);
 assert.doesNotMatch(JSON.stringify(x),/-----BEGIN PUBLIC KEY-----/);
});
test("duplicating Pallab/Suman identity is rejected even with matching public PEMs",()=>{
 const env=distinct();
 env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM=env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM;
 env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256=env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256;
 const x=pallabSumanAuthorityReadiness(env);
 assert.equal(x.pallab_owner_public_pin_verified,true);
 assert.equal(x.suman_reviewer_public_pin_verified,true);
 assert.equal(x.all_five_authority_keys_distinct,false);
 assert.equal(x.configured_public_key_shapes_passed,false);
 assert.equal(x.status,"GOVERNANCE_KEY_IDENTITY_REUSE_OR_MISSING_PINS");
});
test("broken Ed25519 pin is not accepted, without logging any PEM material",()=>{
 const env=distinct();env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256="f".repeat(64);
 const x=pallabSumanAuthorityReadiness(env);
 assert.equal(x.pallab_owner_public_pin_verified,false);
 assert.equal(x.suman_reviewer_public_pin_verified,true);
 assert.equal(x.configured_public_key_shapes_passed,false);
});

test("diagnostics report precise missing vs malformed vs mismatch without printing any PEM",()=>{
 const base=distinct();
 const variants=[
  ["PUBLIC_PEM_SECRET_MISSING",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:""}],
  ["PUBLIC_PEM_HAS_LITERAL_BACKSLASH_N",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:
    base.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM.replaceAll("\n","\\n")}],
  ["PUBLIC_PEM_WRONG_FORMAT",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:
    "ssh-ed25519 AAAAincorrect-format"}],
  ["PUBLIC_PEM_CANNOT_PARSE",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:
    "-----BEGIN PUBLIC KEY-----\nINVALID\n-----END PUBLIC KEY-----"}],
  ["SHA256_SECRET_MISSING",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:""}],
  ["SHA256_NOT_64_LOWERCASE_HEX",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:
    base.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256.toUpperCase()}],
  ["PUBLIC_PEM_SHA256_PIN_MISMATCH",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:
    "a".repeat(64)===base.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256?"b".repeat(64):"a".repeat(64)}],
  ["PRIVATE_KEY_PASTED_INTO_PUBLIC_SECRET",{GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:
    "-----BEGIN PRIVATE KEY-----\n[redacted]\n-----END PRIVATE KEY-----"}],
 ];
 for(const [reason,override] of variants){
  const actual=pallabSumanAuthorityReadiness({...base,...override});
  assert.equal(actual.pallab_owner_public_pin_diagnostic,reason);
  assert.equal(actual.suman_reviewer_public_pin_diagnostic,"VERIFIED");
  assert.equal(actual.pallab_owner_public_pin_verified,false);
  assert.doesNotMatch(JSON.stringify(actual),/BEGIN PUBLIC KEY|ssh-ed25519/);
 }
 const ok=pallabSumanAuthorityReadiness(base);
 assert.equal(ok.pallab_owner_public_pin_diagnostic,"VERIFIED");
 assert.equal(ok.suman_reviewer_public_pin_diagnostic,"VERIFIED");
});

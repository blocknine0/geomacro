import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {cloudAuthorityReadiness} from "../ops/verify-hosted-production-authorities.mjs";

const mk=()=>{
 const {publicKey}=generateKeyPairSync("ed25519");
 const der=publicKey.export({format:"der",type:"spki"});
 return {pem:publicKey.export({format:"pem",type:"spki"}).toString(),
  hash:createHash("sha256").update(der).digest("hex"),
  b64:der.toString("base64")};
};
const env=(a,b,c,d)=>({
 B2_KEY_ID:"test key",B2_APPLICATION_KEY:"synthetic secret not real",
 CLOUDFLARE_ACCOUNT_ID:"test account",CLOUDFLARE_API_TOKEN:"test secret",
 GEOMACRO_COMMERCE_LEDGER_TOKEN:"x".repeat(48),
 GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM:a.pem,
 GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:a.hash,
 GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM:b.pem,
 GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:b.hash,
 RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:c.b64,
 GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:d.pem,
 GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:d.hash,
});
test("no GitHub production secrets: honest all missing, never claims current signed 200",()=>{
 const x=cloudAuthorityReadiness({});
 assert.equal(x.configuration_passed,false);
 assert.equal(x.live_three_hot_snapshots_verified,false);
 assert.equal(x.deep_health_http_200_verified,false);
 assert.equal(x.no_signer_private_keys_loaded,true);
 assert.equal(x.laptop_continuous_runtime_required,false);
 assert.equal(x.b2_requests,0);
 assert.equal(x.real_payments,0);
});
test("cryptographically matched four separate approved public-key shapes, no signed publication claim",()=>{
 const [a,b,c,d]=Array.from({length:4},mk);
 const input=env(a,b,c,d),x=cloudAuthorityReadiness(input);
 assert.equal(x.configuration_passed,true);
 assert.equal(x.configuration.three_distinct_facts_rights_gro_public_key_pins,
  "PINS_CRYPTOGRAPHICALLY_MATCH_AND_DISTINCT");
 assert.equal(x.configuration.independent_gri_reviewer_public_key,
  "PIN_MATCHED_DISTINCT_FROM_SIGNERS");
 assert.equal(x.approved_signed_batches_present_verified,false);
 assert.equal(x.actual_article_commercial_rights_verified,false);
 const output=JSON.stringify(x);
 for(const value of [a.pem,b.pem,c.b64,d.pem,"synthetic secret","test account"])
  assert.equal(output.includes(value),false);
});
test("rejects forged or reused Facts/Rights/GRO/reviewer pin material",()=>{
 const [a,b,c,d]=Array.from({length:4},mk);
 const v=env(a,b,c,d);
 assert.equal(cloudAuthorityReadiness({...v,
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:a.hash,
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM:a.pem}).configuration_passed,false);
 assert.equal(cloudAuthorityReadiness({...v,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:"f".repeat(64)}).configuration_passed,false);
 assert.equal(cloudAuthorityReadiness({...v,
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:a.b64}).configuration_passed,false);
 assert.equal(cloudAuthorityReadiness({...v,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:c.pem,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:c.hash}).configuration_passed,false);
});
test("cannot mark configured with an active Supabase/payment env or invalid public key",()=>{
 const [a,b,c,d]=Array.from({length:4},mk);
 const v=env(a,b,c,d);
 const a1=cloudAuthorityReadiness({...v,COINBASE_API_KEY:"synthetic"});
 assert.equal(a1.configuration_passed,false);
 assert.equal(a1.configuration.zero_money_and_supabase_boundary,"VIOLATED");
 const a2=cloudAuthorityReadiness({...v,GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM:"broken pem"});
 assert.equal(a2.configuration_passed,false);
 const a3=cloudAuthorityReadiness({...v,CLOUDFLARE_API_TOKEN:""});
 assert.equal(a3.configuration.cloudflare_control_plane_credentials,"MISSING_OR_INVALID");
});

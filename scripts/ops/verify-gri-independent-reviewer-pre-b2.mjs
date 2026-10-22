#!/usr/bin/env node
// Protected reviewed GRI publisher preflight BEFORE B2 GET.
// Never accepts a source/article/score or authorizes signing, publication,
// commercial rights, settlement, or automatic reviewer enrollment.
import {createPublicKey,createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const PIN=/^[a-f0-9]{64}$/u;
function spkiFrom(value,format){
 try{
  const key=format==="pem"
   ?createPublicKey(value)
   :createPublicKey({key:Buffer.from(value,"base64"),format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")return null;
  return Buffer.from(key.export({format:"der",type:"spki"}));
 }catch{return null}
}
export function reviewedGriPreB2AuthorityGate(env=process.env){
 let reason;
 if(!env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM)
  reason="REVIEWER_PUBLIC_KEY_NOT_CONFIGURED";
 else if(!PIN.test(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256??""))
  reason="REVIEWER_APPROVED_PIN_NOT_CONFIGURED";
 else if(!env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64)
  reason="GRO_SIGNER_PUBLIC_PIN_NOT_CONFIGURED";
 const pub=reason?null:spkiFrom(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,"pem");
 if(!reason&&!pub)reason="REVIEWER_ED25519_PUBLIC_KEY_INVALID";
 const gro=reason?null:spkiFrom(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64,"der");
 if(!reason&&!gro)reason="GRO_ED25519_PUBLIC_KEY_INVALID";
 if(!reason){
  const h=createHash("sha256").update(pub).digest("hex");
  const groHash=createHash("sha256").update(gro).digest("hex");
  if(h!==env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256)
    reason="REVIEWER_PUBLIC_PIN_MISMATCH";
  else if(h===groHash)
    reason="REVIEWER_AND_GRO_IDENTITY_NOT_DISTINCT";
 }
 return Object.freeze({
  schema:"geomacro.gri-approved-reviewer-pre-b2-authority.v1",
  reviewer_public_config_preflight_ok:!reason,
  code:reason??"REVIEWER_PUBLIC_PIN_VALID_DISTINCT_ONLY",
  reviewer_signature_verified:false,
  historical_b2_readback_verified:false,
  reviewed_gri_input_verified:false,
  country_certificates_verified:false,
  current_numerical_gri_published:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const result=reviewedGriPreB2AuthorityGate();
 console.log(JSON.stringify(result));
 if(!result.reviewer_public_config_preflight_ok)process.exitCode=2;
}

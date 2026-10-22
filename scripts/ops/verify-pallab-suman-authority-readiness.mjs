#!/usr/bin/env node
// Private production environment has PUBLIC PINS ONLY; never access or
// generate private signing keys. Two authorized persons, not 2 fake actors.
import {createHash,createPublicKey} from "node:crypto";
import {pathToFileURL} from "node:url";
const SHA=/^[a-f0-9]{64}$/u;
function pin(pem,sha){
 if(typeof pem!=="string"||!SHA.test(sha??""))return null;
 try{
  const key=createPublicKey(pem);
  return key.asymmetricKeyType==="ed25519" &&
   createHash("sha256").update(key.export({format:"der",type:"spki"}))
    .digest("hex")===sha ? sha :null;
 }catch{return null;}
}
export function pallabSumanAuthorityReadiness(env=process.env){
 const owner=pin(env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
   env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256);
 const reviewer=pin(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
   env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256);
 const other=[
  env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
  env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256
 ].filter(Boolean);
 const gro=(()=>{try{
  const raw=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
  if(typeof raw!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))return null;
  const key=createPublicKey({key:Buffer.from(raw,"base64"),
    format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")return null;
  return createHash("sha256").update(key.export({format:"der",type:"spki"}))
   .digest("hex");
 }catch{return null;}})();
 const distinct=Boolean(owner&&reviewer&&gro&&owner!==reviewer&&
    owner!==gro&&reviewer!==gro&&
    other.length===2&&other.every(x=>SHA.test(x)&&x!==owner&&x!==reviewer&&x!==gro)&&
    new Set([owner,reviewer,gro,...other]).size===5);
 const status= !owner?"PALLAB_OWNER_PUBLIC_PIN_MISSING_OR_INVALID":
    !reviewer?"SUMAN_REVIEWER_PUBLIC_PIN_MISSING_OR_INVALID":
    !gro?"GRO_PUBLIC_PIN_MISSING_OR_INVALID":
    !distinct?"GOVERNANCE_KEY_IDENTITY_REUSE_OR_MISSING_PINS":
      "DISTINCT_APPROVED_PUBLIC_KEY_SHAPES_READY_ONLY";
 return Object.freeze({
  schema:"geomacro.pallab-suman-two-person-public-key-readiness.v1",
  owner_human_authority_expected:"Pallab Das",
  independent_reviewer_expected:"Suman Dey",
  status,configured_public_key_shapes_passed:distinct,
  // Public boolean readiness only. One missing key should not conceal
  // whether the other person's separate public key is already enrolled.
  pallab_owner_public_pin_verified:Boolean(owner),
  suman_reviewer_public_pin_verified:Boolean(reviewer),
  gro_public_identity_pin_verified:Boolean(gro),
  facts_rights_public_pins_present:other.length===2&&
    other.every(x=>SHA.test(x)),
  all_five_authority_keys_distinct:distinct,
  reviewer_person_identity_confirmed_by_key_shape_only:false,
  owner_person_identity_confirmed_by_key_shape_only:false,
  owner_signature_uploaded_and_verified:false,
  reviewed_gri_signature_uploaded_and_verified:false,
  signed_country_certificates_uploaded_and_verified:false,
  historical_b2_verified:false,current_product_200_verified:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const r=pallabSumanAuthorityReadiness();
 console.log(JSON.stringify(r));
 if(!r.configured_public_key_shapes_passed)process.exitCode=2;
}

#!/usr/bin/env node
// Private production environment has PUBLIC PINS ONLY; never access or
// generate private signing keys. Two authorized persons, not 2 fake actors.
import {createHash,createPublicKey} from "node:crypto";
import {pathToFileURL} from "node:url";
const SHA=/^[a-f0-9]{64}$/u;
// Emit only a finite failure code; never echo PEMs, pins, bytes, size,
// fingerprint, secret content or even a signed payload into Actions logs.
export function inspectPublicEd25519Pin(pem,sha){
 if(typeof pem!=="string"||pem.trim()==="")
  return Object.freeze({status:"PUBLIC_PEM_SECRET_MISSING",pin:null});
 if(typeof sha!=="string"||sha.trim()==="")
  return Object.freeze({status:"PUBLIC_PIN_SECRET_MISSING",pin:null});
 if(!SHA.test(sha))
  return Object.freeze({status:"PUBLIC_PIN_NOT_LOWERCASE_64_HEX",pin:null});
 if(pem.includes("\\n")&&!pem.includes("\n"))
  return Object.freeze({status:"PUBLIC_PEM_HAS_LITERAL_BACKSLASH_N",pin:null});
 if(!/^-----BEGIN PUBLIC KEY-----\r?\n/u.test(pem)||
    !/\r?\n-----END PUBLIC KEY-----\s*$/u.test(pem))
  return Object.freeze({status:"PUBLIC_PEM_HEADER_OR_NEWLINE_INVALID",pin:null});
 try{
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=="ed25519")
    return Object.freeze({status:"PUBLIC_KEY_NOT_ED25519",pin:null});
  const actual=createHash("sha256")
   .update(key.export({format:"der",type:"spki"})).digest("hex");
  if(actual!==sha)
    return Object.freeze({status:"PUBLIC_KEY_SPKI_SHA256_MISMATCH",pin:null});
  return Object.freeze({status:"PUBLIC_PIN_VERIFIED",pin:sha});
 }catch{return Object.freeze({status:"PUBLIC_PEM_PARSE_INVALID",pin:null});}
}

export function pallabSumanAuthorityReadiness(env=process.env){
 const ownerCheck=inspectPublicEd25519Pin(
   env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
   env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256);
 const reviewerCheck=inspectPublicEd25519Pin(
   env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
   env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256);
 const owner=ownerCheck.pin,reviewer=reviewerCheck.pin;
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
  // Only named finite state codes to repair the four public secrets.
  owner_public_key_check:ownerCheck.status,
  reviewer_public_key_check:reviewerCheck.status,
  facts_public_pin_present_and_well_formed:other.length===2&&
    other.every(x=>SHA.test(x)),
  gro_signer_public_pin_well_formed:Boolean(gro),
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

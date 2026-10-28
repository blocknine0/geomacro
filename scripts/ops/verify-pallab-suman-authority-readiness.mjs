#!/usr/bin/env node
// Private production environment has PUBLIC PINS ONLY; never access or
// generate private signing keys. Two authorized persons, not 2 fake actors.
import {createHash,createPublicKey} from "node:crypto";
import {pathToFileURL} from "node:url";
const SHA=/^[a-f0-9]{64}$/u;
// Only status codes: NEVER log public PEM, key bytes, SPKI digest, or
// supplied SHA. Help the owner distinguish a secret-name/value problem
// from a genuine key identity mismatch while keeping custody private.
function diagnosePin(pem,sha){
 const rejected=reason=>({pin:null,reason});
 if(typeof pem!=="string"||!pem.length)return rejected("PUBLIC_PEM_SECRET_MISSING");
 if(pem.length>8192)return rejected("PUBLIC_PEM_VALUE_OVERSIZE");
 if(pem.includes("-----BEGIN"+" PRIVATE KEY-----")||
    pem.includes("-----BEGIN"+" ENCRYPTED PRIVATE KEY-----"))
   return rejected("PRIVATE_KEY_PASTED_INTO_PUBLIC_SECRET");
 if(pem.includes("\\n")&&!pem.includes("\n"))
   return rejected("PUBLIC_PEM_HAS_LITERAL_BACKSLASH_N");
 if(!pem.includes("-----BEGIN PUBLIC KEY-----")||
    !pem.includes("-----END PUBLIC KEY-----"))
   return rejected("PUBLIC_PEM_WRONG_FORMAT");
 if(typeof sha!=="string"||!sha.length)
   return rejected("SHA256_SECRET_MISSING");
 if(!SHA.test(sha))
   return rejected("SHA256_NOT_64_LOWERCASE_HEX");
 let key;
 try{key=createPublicKey(pem);}
 catch{return rejected("PUBLIC_PEM_CANNOT_PARSE");}
 if(key.asymmetricKeyType!=="ed25519")
   return rejected("PUBLIC_KEY_NOT_ED25519");
 const actual=createHash("sha256")
   .update(key.export({format:"der",type:"spki"})).digest("hex");
 if(actual!==sha)return rejected("PUBLIC_PEM_SHA256_PIN_MISMATCH");
 return Object.freeze({pin:sha,reason:"VERIFIED"});
}
export function pallabSumanAuthorityReadiness(env=process.env){
 const ownerDiagnostic=diagnosePin(env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
   env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256);
 const reviewerDiagnostic=diagnosePin(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
   env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256);
 const owner=ownerDiagnostic.pin,reviewer=reviewerDiagnostic.pin;
 // A SHA-looking GitHub secret is not proof that the associated actual
 // Ed25519 PEM is configured, parseable, and bound to that exact SPKI pin.
 // Preserve role positions even when one secret is absent: filtering missing
 // Facts before indexing could incorrectly label a Rights key as Facts.
 const factsDiagnostic=diagnosePin(env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM,
   env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256);
 const rightsDiagnostic=diagnosePin(env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM,
   env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256);
 const facts=factsDiagnostic.pin,rights=rightsDiagnostic.pin;
 const gro=(()=>{try{
  const raw=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
  if(typeof raw!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))return null;
  const key=createPublicKey({key:Buffer.from(raw,"base64"),
    format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")return null;
  return createHash("sha256").update(key.export({format:"der",type:"spki"}))
   .digest("hex");
 }catch{return null;}})();
 // Return only role-pair names, never PEMs, raw pin values, key bytes,
 // substrings or identifiers. This distinguishes a duplicated owner/reviewer
 // identity from an existing Facts/Rights/GRO clash after owners add keys.
 const rolePins=[
  ["PALLAB_OWNER",owner],["SUMAN_REVIEWER",reviewer],
  ["GRO_SIGNER",gro],["FACTS_AUTHORITY",facts],
  ["RIGHTS_AUTHORITY",rights],
 ];
 const conflictingRolePairs=[];
 for(let i=0;i<rolePins.length;i++){
  const [leftName,leftPin]=rolePins[i];
  if(!SHA.test(leftPin??""))continue;
  for(let j=i+1;j<rolePins.length;j++){
   const [rightName,rightPin]=rolePins[j];
   if(SHA.test(rightPin??"")&&leftPin===rightPin)
    conflictingRolePairs.push(leftName+"__"+rightName);
  }
 }
 const missingOrInvalidRoles=rolePins.filter(([,pin])=>!SHA.test(pin??""))
  .map(([name])=>name);
 const distinct=Boolean(missingOrInvalidRoles.length===0&&
  conflictingRolePairs.length===0&&rolePins.length===5);
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
  pallab_owner_public_pin_diagnostic:ownerDiagnostic.reason,
  suman_reviewer_public_pin_verified:Boolean(reviewer),
  suman_reviewer_public_pin_diagnostic:reviewerDiagnostic.reason,
  gro_public_identity_pin_verified:Boolean(gro),
  facts_rights_public_pins_present:Boolean(facts&&rights),
  facts_public_pin_diagnostic:factsDiagnostic.reason,
  rights_public_pin_diagnostic:rightsDiagnostic.reason,
  all_five_authority_keys_distinct:distinct,
  // Whitelisted role labels only. Never serialize signature, PEM or digest.
  duplicate_authority_role_pairs:conflictingRolePairs,
  missing_or_invalid_authority_roles:missingOrInvalidRoles,
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

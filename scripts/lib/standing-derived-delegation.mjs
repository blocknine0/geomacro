import {createHash, createPublicKey, createPrivateKey, sign, verify} from "node:crypto";

export const POLICY_SCHEMA="geomacro.standing-derived-delegation.v1";
export const ENVELOPE_SCHEMA="geomacro.signed-standing-derived-delegation.v1";
export const PROFILE="GEOMACRO_DELEGATED_DERIVED_ONLY_NOT_GRI_V1";
export const ENABLE="YES_DELEGATED_DERIVED_ONLY";
const SHA=/^[a-f0-9]{64}$/u;
const B64=/^[A-Za-z0-9+/]{86}==$/u;
const ROLES=["PALLAB_OWNER","SUMAN_GOVERNANCE_CONSENT"];
const ALLOWED=["derived_intelligence_input","internal_derived_research_receipt"];
const DENIED=[
  "commercial_rights_attestation","external_independent_review",
  "gri_v12_numerical_score","risk_indices_signed_hot",
  "intelligence_signed_hot","paid_settlement"
];
const refuse=code=>{throw Error("STANDING_DELEGATION_"+code);};
export function canonical(value){
 if(value===null||typeof value==="string"||typeof value==="number"||typeof value==="boolean"){
  if(typeof value==="number"&&!Number.isFinite(value))refuse("NONFINITE");
  return JSON.stringify(value);
 }
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object"){
  const keys=Object.keys(value).sort();
  return "{"+keys.map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
 }
 refuse("NON_JSON_VALUE");
}
const exact=(o,keys)=>o&&!Array.isArray(o)&&typeof o==="object"&&
 Object.keys(o).sort().join("|")===keys.slice().sort().join("|");
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
export const policyBytes=p=>Buffer.from(POLICY_SCHEMA+"\n"+canonical(p),"utf8");
export const spkiDigest=key=>digest(createPublicKey(key).export({format:"der",type:"spki"}));
export function validatePolicy(p,{now=new Date()}={}){
 if(!exact(p,["schema","repository","profile","owner","reviewer",
  "machine_public_spki_sha256","issued_at","expires_at","allowed_outputs",
  "denied_outputs","continuous_processing_authorized",
  "independent_review_attested","commercial_rights_attested",
  "numerical_gri_authorized","real_payments_authorized"])||
  p.schema!==POLICY_SCHEMA||p.repository!=="blocknine0/geomacro"||
  p.profile!==PROFILE||p.owner!=="Pallab Das"||p.reviewer!=="Suman Dey"||
  !SHA.test(p.machine_public_spki_sha256??"")||p.expires_at!==null||
  p.continuous_processing_authorized!==true||
  p.independent_review_attested!==false||
  p.commercial_rights_attested!==false||
  p.numerical_gri_authorized!==false||
  p.real_payments_authorized!==false||
  JSON.stringify(p.allowed_outputs)!==JSON.stringify(ALLOWED)||
  JSON.stringify(p.denied_outputs)!==JSON.stringify(DENIED))refuse("POLICY_SCOPE_INVALID");
 const issued=Date.parse(p.issued_at);
 if(!Number.isFinite(issued)||new Date(issued).toISOString()!==p.issued_at||
    !Number.isFinite(now.getTime())||issued>now.getTime()+300000)
  refuse("POLICY_CLOCK_INVALID");
 return p;
}
export function makePolicy({machinePublicKeyPem,issuedAt=new Date().toISOString()}={}){
 const key=createPublicKey(machinePublicKeyPem);
 if(key.asymmetricKeyType!=="ed25519")refuse("MACHINE_PUBLIC_KEY_INVALID");
 return validatePolicy({
  schema:POLICY_SCHEMA,repository:"blocknine0/geomacro",profile:PROFILE,
  owner:"Pallab Das",reviewer:"Suman Dey",
  machine_public_spki_sha256:spkiDigest(key),
  issued_at:issuedAt,expires_at:null,allowed_outputs:ALLOWED.slice(),
  denied_outputs:DENIED.slice(),continuous_processing_authorized:true,
  independent_review_attested:false,commercial_rights_attested:false,
  numerical_gri_authorized:false,real_payments_authorized:false
 });
}
function approvedKey(pem,pin){
 if(typeof pem!=="string"||!SHA.test(pin??""))refuse("PUBLIC_IDENTITY_REQUIRED");
 let key;
 try{key=createPublicKey(pem);}catch{refuse("PUBLIC_KEY_INVALID");}
 if(key.asymmetricKeyType!=="ed25519"||spkiDigest(key)!==pin)refuse("PUBLIC_KEY_PIN_MISMATCH");
 return key;
}
export function validateDelegation(envelope,{ownerPem,ownerPin,reviewerPem,reviewerPin,
 machinePem,machinePin,otherAuthorityPins=[],enabled,revoked,now=new Date()}={}){
 if(enabled!==ENABLE||revoked==="YES")refuse("DISABLED_OR_REVOKED");
 if(!exact(envelope,["schema","policy","approvals"])||
   envelope.schema!==ENVELOPE_SCHEMA||
   !Array.isArray(envelope.approvals)||envelope.approvals.length!==2)
   refuse("ENVELOPE_INVALID");
 const policy=validatePolicy(envelope.policy,{now});
 const owner=approvedKey(ownerPem,ownerPin);
 const reviewer=approvedKey(reviewerPem,reviewerPin);
 const machine=approvedKey(machinePem,machinePin);
 if(machinePin!==policy.machine_public_spki_sha256||
    new Set([ownerPin,reviewerPin,machinePin]).size!==3||
    otherAuthorityPins.some(x=>!SHA.test(x)||[ownerPin,reviewerPin,machinePin].includes(x))||
    new Set(otherAuthorityPins).size!==otherAuthorityPins.length)
   refuse("AUTHORITY_SEPARATION_FAILED");
 const signable=policyBytes(policy);
 for(let i=0;i<2;i++){
  const approval=envelope.approvals[i],role=ROLES[i];
  if(!exact(approval,["role","signature_base64"])||
     approval.role!==role||!B64.test(approval.signature_base64??"")||
     !verify(null,signable,i===0?owner:reviewer,
       Buffer.from(approval.signature_base64,"base64")))
     refuse("HUMAN_GOVERNANCE_SIGNATURE_INVALID");
 }
 return Object.freeze({
  schema:"geomacro.standing-delegated-derived-readiness.v1",
  status:"STANDING_DELEGATION_VERIFIED_DERIVED_ONLY",
  scope:PROFILE,policy_sha256:digest(signable),
  pallab_governance_signature_verified:true,
  suman_governance_signature_verified:true,
  machine_key_distinct:true,continuous_derived_only_authorized:true,
  external_independent_review_claimed:false,
  commercial_rights_claimed:false,legacy_gri_signed_hot_claimed:false,
  real_payment_authorized:false
 });
}
export function signPolicyForRole(policy,privateKey,role){
 if(!ROLES.includes(role))refuse("ROLE_INVALID");
 const key=createPrivateKey(privateKey);
 if(key.asymmetricKeyType!=="ed25519")refuse("PRIVATE_KEY_INVALID");
 validatePolicy(policy);
 return {role,signature_base64:sign(null,policyBytes(policy),key).toString("base64")};
}
export function signMachineReceipt({receipt,delegation,machinePrivatePkcs8B64,machinePem,now=new Date()}={}){
 if(delegation?.status!=="STANDING_DELEGATION_VERIFIED_DERIVED_ONLY")refuse("GOVERNANCE_REQUIRED");
 if(receipt?.schema!=="geomacro.all-news-signed-publication-acceptance.v1"||
    receipt.all_retained_unique_news_signature_verified!==true||
    receipt.commercial_rights_attested!==false||
    receipt.legacy_signed_hot_3_of_3_verified!==false||
    receipt.paid_delivery_enabled!==false||receipt.payments!==0||
    !Number.isInteger(receipt.unique_items)||receipt.unique_items<1||
    receipt.exact_signed_inputs_independently_verified!==receipt.unique_items)
    refuse("REAL_DERIVED_READBACK_REQUIRED");
 let privateKey;
 try{privateKey=createPrivateKey({
  key:Buffer.from(machinePrivatePkcs8B64??"","base64"),
  format:"der",type:"pkcs8"
 });}catch{refuse("MACHINE_PRIVATE_KEY_INVALID");}
 if(privateKey.asymmetricKeyType!=="ed25519"||
    spkiDigest(createPublicKey(privateKey))!==spkiDigest(machinePem))
    refuse("MACHINE_PRIVATE_PUBLIC_MISMATCH");
 const payload={
  schema:"geomacro.delegated-derived-observation-receipt.v1",
  profile:PROFILE,repository:"blocknine0/geomacro",
  observed_at:now.toISOString(),policy_sha256:delegation.policy_sha256,
  exact_signed_derived_inputs_verified:receipt.exact_signed_inputs_independently_verified,
  source_current_derived_inputs_reported:receipt.current_source_verified_signed_reported,
  independent_external_review_attested:false,commercial_rights_attested:false,
  legacy_scored_gri_published:false,paid_settlement_authorized:false,payments:0
 };
 const bytes=Buffer.from("geomacro.delegated-derived-observation-receipt.v1\n"+canonical(payload));
 const signature=sign(null,bytes,privateKey);
 if(!verify(null,bytes,createPublicKey(machinePem),signature))refuse("MACHINE_RECEIPT_SELF_VERIFY_FAILED");
 return {payload,signature_base64:signature.toString("base64")};
}
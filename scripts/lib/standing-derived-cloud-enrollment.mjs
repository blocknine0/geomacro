import {createHash,createPrivateKey,createPublicKey} from "node:crypto";
import {validateDelegation,spkiDigest,ENVELOPE_SCHEMA,ENABLE} from "./standing-derived-delegation.mjs";

const deny=()=>{throw Error("STANDING_DERIVED_ENROLLMENT_NOT_VERIFIED");};
export const REPOSITORY="blocknine0/geomacro";
export const SECRETS=Object.freeze([
 "GEOMACRO_DELEGATED_MACHINE_PRIVATE_PKCS8_B64",
 "GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PEM",
 "GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_SHA256",
 "GEOMACRO_STANDING_DELEGATION_ENVELOPE_B64"
]);
export function prepareEnrollment({
 policy,ownerApproval,sumanApproval,ownerPem,reviewerPem,
 machinePublicPem,machinePrivatePem,now=new Date()
}={}){
 if(!policy||!ownerApproval||!sumanApproval||!ownerPem||!reviewerPem||
    !machinePublicPem||!machinePrivatePem)deny();
 let privateKey,publicKey;
 try{
  privateKey=createPrivateKey(machinePrivatePem);
  publicKey=createPublicKey(machinePublicPem);
 }catch{deny();}
 if(privateKey.asymmetricKeyType!=="ed25519"||publicKey.asymmetricKeyType!=="ed25519"||
    spkiDigest(createPublicKey(privateKey))!==spkiDigest(publicKey))deny();
 const envelope={schema:ENVELOPE_SCHEMA,policy,approvals:[ownerApproval,sumanApproval]};
 const machinePin=spkiDigest(publicKey);
 const receipt=validateDelegation(envelope,{
  ownerPem,ownerPin:spkiDigest(ownerPem),
  reviewerPem,reviewerPin:spkiDigest(reviewerPem),
  machinePem:machinePublicPem,machinePin,
  enabled:ENABLE,revoked:"NO",now
 });
 const secrets={
  GEOMACRO_DELEGATED_MACHINE_PRIVATE_PKCS8_B64:
   privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PEM:machinePublicPem,
  GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_SHA256:machinePin,
  GEOMACRO_STANDING_DELEGATION_ENVELOPE_B64:
   Buffer.from(JSON.stringify(envelope),"utf8").toString("base64"),
 };
 if(Object.keys(secrets).sort().join("|")!==SECRETS.slice().sort().join("|")||
    Object.values(secrets).some(v=>typeof v!=="string"||v.length===0))deny();
 return {secrets,receipt:Object.freeze({
  status:"LOCAL_TWO_HUMAN_STANDING_DELEGATION_VERIFIED",
  ...receipt,
  human_private_keys_uploaded:false,source_licences_issued:false,
  numerical_gri_authorized:false,real_money_authorized:false
 })};
}

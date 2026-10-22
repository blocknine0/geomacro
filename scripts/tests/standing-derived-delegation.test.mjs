import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash,createPublicKey,createPrivateKey,verify} from "node:crypto";
import {POLICY_SCHEMA,PROFILE,ENABLE,canonical,makePolicy,policyBytes,
 signPolicyForRole,validateDelegation,signMachineReceipt} from "../lib/standing-derived-delegation.mjs";
const id=()=>{
 const {publicKey,privateKey}=generateKeyPairSync("ed25519");
 const pem=publicKey.export({type:"spki",format:"pem"}).toString();
 const der=publicKey.export({type:"spki",format:"der"});
 return {pem,pin:createHash("sha256").update(der).digest("hex"),
   priv:privateKey,privateB64:privateKey.export({type:"pkcs8",format:"der"}).toString("base64")};
};
function setup(){
 const [owner,reviewer,machine,facts,rights,gro]=Array.from({length:6},id);
 const policy=makePolicy({machinePublicKeyPem:machine.pem,
  issuedAt:"2026-10-22T12:00:00.000Z"});
 const envelope={schema:"geomacro.signed-standing-derived-delegation.v1",policy,
  approvals:[signPolicyForRole(policy,owner.priv,"PALLAB_OWNER"),
    signPolicyForRole(policy,reviewer.priv,"SUMAN_GOVERNANCE_CONSENT")]};
 const keys={ownerPem:owner.pem,ownerPin:owner.pin,reviewerPem:reviewer.pem,
  reviewerPin:reviewer.pin,machinePem:machine.pem,machinePin:machine.pin,
  otherAuthorityPins:[facts.pin,rights.pin,gro.pin],
  enabled:ENABLE,revoked:"NO",now:new Date("2026-10-23T02:00:00.000Z")};
 return {owner,reviewer,machine,facts,rights,gro,policy,envelope,keys};
}
test("two distinct humans can delegate only unscored derived operation",()=>{
 const x=setup(),receipt=validateDelegation(x.envelope,x.keys);
 assert.equal(receipt.status,"STANDING_DELEGATION_VERIFIED_DERIVED_ONLY");
 assert.equal(receipt.pallab_governance_signature_verified,true);
 assert.equal(receipt.suman_governance_signature_verified,true);
 assert.equal(receipt.legacy_gri_signed_hot_claimed,false);
 assert.equal(receipt.real_payment_authorized,false);
 assert.equal(x.policy.expires_at,null);
 assert.equal(x.policy.profile,PROFILE);
 assert.equal(x.policy.schema,POLICY_SCHEMA);
});
test("policy tampering, one signer, swapped role and wrong human are denied",()=>{
 const x=setup(),bad=structuredClone(x.envelope);
 bad.policy.real_payments_authorized=true;
 assert.throws(()=>validateDelegation(bad,x.keys),/POLICY_SCOPE_INVALID/);
 const one=structuredClone(x.envelope);one.approvals.pop();
 assert.throws(()=>validateDelegation(one,x.keys),/ENVELOPE_INVALID/);
 const swapped=structuredClone(x.envelope);swapped.approvals.reverse();
 assert.throws(()=>validateDelegation(swapped,x.keys),/HUMAN_GOVERNANCE_SIGNATURE_INVALID/);
 const wrong=structuredClone(x.envelope);
 wrong.approvals[1].signature_base64=signPolicyForRole(x.policy,x.owner.priv,"SUMAN_GOVERNANCE_CONSENT").signature_base64;
 assert.throws(()=>validateDelegation(wrong,x.keys),/HUMAN_GOVERNANCE_SIGNATURE_INVALID/);
});
test("revocation, disabled, signer identity reuse and fingerprints fail closed",()=>{
 const x=setup();
 for(const patch of [{enabled:""},{revoked:"YES"},{reviewerPem:x.owner.pem,reviewerPin:x.owner.pin},
  {machinePin:x.owner.pin},{otherAuthorityPins:[x.owner.pin]}]){
  assert.throws(()=>validateDelegation(x.envelope,{...x.keys,...patch}),/STANDING_DELEGATION_/);
 }
});
test("signature binds to exact payload and explicit no-funds claims",()=>{
 const x=setup(),approved=validateDelegation(x.envelope,x.keys);
 const observed={schema:"geomacro.all-news-signed-publication-acceptance.v1",
   all_retained_unique_news_signature_verified:true,
   unique_items:3,exact_signed_inputs_independently_verified:3,
   current_source_verified_signed_reported:1,commercial_rights_attested:false,
   legacy_signed_hot_3_of_3_verified:false,paid_delivery_enabled:false,payments:0};
 const receipt=signMachineReceipt({receipt:observed,delegation:approved,
  machinePrivatePkcs8B64:x.machine.privateB64,machinePem:x.machine.pem,
  now:new Date("2026-10-23T02:01:00.000Z")});
 const bytes=Buffer.from("geomacro.delegated-derived-observation-receipt.v1\n"+
  canonical(receipt.payload));
 assert.ok(verify(null,bytes,createPublicKey(x.machine.pem),Buffer.from(receipt.signature_base64,"base64")));
 assert.equal(receipt.payload.legacy_scored_gri_published,false);
 assert.equal(receipt.payload.commercial_rights_attested,false);
 assert.equal(receipt.payload.payments,0);
 for(const data of [
  {...observed,commercial_rights_attested:true},
  {...observed,legacy_signed_hot_3_of_3_verified:true},
  {...observed,paid_delivery_enabled:true},
  {...observed,exact_signed_inputs_independently_verified:2},
  {...observed,payments:1}
 ]) assert.throws(()=>signMachineReceipt({receipt:data,delegation:approved,
   machinePrivatePkcs8B64:x.machine.privateB64,machinePem:x.machine.pem}),/REAL_DERIVED_READBACK_REQUIRED/);
 assert.throws(()=>signMachineReceipt({receipt:observed,delegation:approved,
  machinePrivatePkcs8B64:x.owner.privateB64,machinePem:x.machine.pem}),/MACHINE_PRIVATE_PUBLIC_MISMATCH/);
});
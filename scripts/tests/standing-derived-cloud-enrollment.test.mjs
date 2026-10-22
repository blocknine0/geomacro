import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {makePolicy,signPolicyForRole} from "../lib/standing-derived-delegation.mjs";
import {prepareEnrollment,REPOSITORY,SECRETS} from "../lib/standing-derived-cloud-enrollment.mjs";

const identity=()=>{
 const {publicKey,privateKey}=generateKeyPairSync("ed25519");
 const pem=publicKey.export({format:"pem",type:"spki"}).toString();
 const priv=privateKey.export({format:"pem",type:"pkcs8"}).toString();
 return {publicKey,privateKey,pem,priv,pin:createHash("sha256").update(
  publicKey.export({format:"der",type:"spki"})).digest("hex")};
};
function fixture(){
 const owner=identity(),reviewer=identity(),machine=identity();
 const policy=makePolicy({machinePublicKeyPem:machine.pem,issuedAt:"2026-10-22T00:00:00.000Z"});
 return {owner,reviewer,machine,policy,values:{
  policy,ownerApproval:signPolicyForRole(policy,owner.privateKey,"PALLAB_OWNER"),
  sumanApproval:signPolicyForRole(policy,reviewer.privateKey,"SUMAN_GOVERNANCE_CONSENT"),
  ownerPem:owner.pem,reviewerPem:reviewer.pem,
  machinePublicPem:machine.pem,machinePrivatePem:machine.priv,
  now:new Date("2026-10-23T00:00:00.000Z")
 }};
}
test("valid two-human signatures enroll exact new machine only and no funds",()=>{
 const {values,machine,owner,reviewer}=fixture();
 const ready=prepareEnrollment(values);
 assert.equal(REPOSITORY,"blocknine0/geomacro");
 assert.equal(ready.secrets.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_PEM,values.ownerPem);
 assert.equal(ready.secrets.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM,values.reviewerPem);
 assert.equal(ready.secrets.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_SHA256,owner.pin);
 assert.equal(ready.secrets.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256,reviewer.pin);

 assert.equal(ready.receipt.status,"STANDING_DELEGATION_VERIFIED_DERIVED_ONLY");
 assert.equal(ready.receipt.pallab_governance_signature_verified,true);
 assert.equal(ready.receipt.suman_governance_signature_verified,true);
 assert.equal(ready.receipt.numerical_gri_authorized,false);
 assert.equal(ready.receipt.real_money_authorized,false);
 assert.deepEqual(Object.keys(ready.secrets).sort(),[...SECRETS].sort());
 assert.equal(ready.secrets.GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_SHA256,machine.pin);
 const decoded=JSON.parse(Buffer.from(ready.secrets.GEOMACRO_STANDING_DELEGATION_ENVELOPE_B64,"base64"));
 assert.equal(decoded.approvals.length,2);
 assert.equal(decoded.policy.machine_public_spki_sha256,machine.pin);
 assert.equal(ready.secrets.GEOMACRO_DELEGATED_MACHINE_PRIVATE_PKCS8_B64.includes("BEGIN"),false);
});
test("wrong machine identity and missing/replaced human consent are blocked",()=>{
 const x=fixture(),another=identity();
 assert.throws(()=>prepareEnrollment({...x.values,machinePrivatePem:another.priv}),/STANDING_DERIVED_ENROLLMENT_NOT_VERIFIED/);
 assert.throws(()=>prepareEnrollment({...x.values,machinePublicPem:another.pem}),/STANDING_DERIVED_ENROLLMENT_NOT_VERIFIED/);
 assert.throws(()=>prepareEnrollment({...x.values,sumanApproval:null}),/STANDING_DERIVED_ENROLLMENT_NOT_VERIFIED/);
 assert.throws(()=>prepareEnrollment({...x.values,
  sumanApproval:signPolicyForRole(x.policy,x.owner.privateKey,"SUMAN_GOVERNANCE_CONSENT")
 }),/STANDING_DELEGATION_HUMAN_GOVERNANCE_SIGNATURE_INVALID/);
});
test("policy escalation invalidates signatures and preparation",()=>{
 const x=fixture();
 for(const field of ["real_payments_authorized","commercial_rights_attested",
  "independent_review_attested","numerical_gri_authorized"]){
  const changed={...x.policy,[field]:true};
  assert.throws(()=>prepareEnrollment({...x.values,policy:changed}),/STANDING_DELEGATION_POLICY_SCOPE_INVALID/);
 }
});

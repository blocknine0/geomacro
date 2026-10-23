import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {spkiDigest} from '../lib/standing-derived-delegation.mjs';
import {makeGriAutomationPolicy,signGriAutomationConsent,verifyGriAutomationConsent,
 prepareGriAutomationEnrollment,ENVELOPE,ROLES} from '../lib/gri-automation-consent.mjs';
function key(){const p=generateKeyPairSync('ed25519');return {...p,
 pem:p.publicKey.export({format:'pem',type:'spki'}).toString(),
 privatePem:p.privateKey.export({format:'pem',type:'pkcs8'}).toString()}}
function fixture(){
 const owner=key(),reviewer=key(),om=key(),rm=key();
 const p=makeGriAutomationPolicy({ownerPem:owner.pem,reviewerPem:reviewer.pem,ownerMachinePem:om.pem,reviewMachinePem:rm.pem});
 const envelope={schema:ENVELOPE,policy:p,approvals:[signGriAutomationConsent(p,ROLES[0],owner.privateKey),
  signGriAutomationConsent(p,ROLES[1],reviewer.privateKey)]};
 const args={envelope,ownerPem:owner.pem,ownerPin:spkiDigest(owner.pem),reviewerPem:reviewer.pem,
  reviewerPin:spkiDigest(reviewer.pem),ownerMachinePem:om.pem,reviewMachinePem:rm.pem};
 return {owner,reviewer,om,rm,args};
}
test('two genuine consents authorize policy automation, not human-per-batch review or publication',()=>{
 const {args}=fixture(),r=verifyGriAutomationConsent(args);
 assert.equal(r.two_governance_signatures_verified,true);
 assert.equal(r.automated_policy_review_authorized,true);
 assert.equal(r.human_per_batch_review_attested,false);
 assert.equal(r.publisher_enabled,false);assert.equal(r.scored_gri_published,false);
 assert.equal(r.current_source_inputs_verified,false);assert.equal(r.country_certificates_verified,false);
 assert.equal(r.source_rights_granted,false);assert.equal(r.payments,0);
});
test('revocation, wrong trusted humans, missing/swapped/forged consent and scope escalation reject',()=>{
 const {args}=fixture();
 assert.throws(()=>verifyGriAutomationConsent({...args,revoked:'YES'}));
 assert.throws(()=>verifyGriAutomationConsent({...args,ownerPin:'f'.repeat(64)}));
 for(const edit of [
  e=>e.approvals.pop(),e=>e.approvals.reverse(),e=>e.approvals[1].signature_base64='A'.repeat(86)+'==',
  e=>e.policy.payments_authorized=true,e=>e.policy.human_per_batch_review_attested=true,
  e=>e.policy.publisher_activation_authorized_by_enrollment=true,
  e=>e.policy.required_checks=[],e=>e.policy.repository='fork/geomacro',
  e=>e.policy.extra_scope='ALL',e=>e.policy.owner_machine_public_sha256=e.policy.owner_public_sha256,
 ]){const envelope=structuredClone(args.envelope);edit(envelope);
  assert.throws(()=>verifyGriAutomationConsent({...args,envelope}));}
});
test('old derived-only consent cannot be used for the new scope; unrelated keys cannot sign it',()=>{
 const {args}=fixture();
 assert.throws(()=>verifyGriAutomationConsent({...args,envelope:{schema:'geomacro.signed-standing-derived-delegation.v1',
  policy:args.envelope.policy,approvals:args.envelope.approvals}}));
 assert.throws(()=>signGriAutomationConsent(args.envelope.policy,ROLES[1],key().privateKey));
 assert.throws(()=>verifyGriAutomationConsent({...args,otherAuthorityPins:[spkiDigest(args.reviewMachinePem)]}));
});
test('enrollment uploads only dedicated machine keys plus policy; human keys never become cloud secrets',()=>{
 const {args,om,rm,owner,reviewer}=fixture();
 const input={...args,ownerMachinePrivatePem:om.privatePem,reviewMachinePrivatePem:rm.privatePem};
 const result=prepareGriAutomationEnrollment(input);
 assert.equal(Object.keys(result.secrets).length,7);
 assert.equal(result.receipt.publisher_enabled,false);
 const bytes=JSON.stringify(result.secrets);
 assert.equal(bytes.includes(owner.privatePem),false);assert.equal(bytes.includes(reviewer.privatePem),false);
 assert.throws(()=>prepareGriAutomationEnrollment({...input,reviewMachinePrivatePem:om.privatePem}));
});

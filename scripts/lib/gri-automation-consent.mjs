// A NEW scope, not an upgrade/reinterpretation of derived-only signatures.
// Consent authorizes automated policy review, never human per-batch review.
import {createPublicKey,createPrivateKey,sign,verify} from 'node:crypto';
import {canonical,spkiDigest} from './standing-derived-delegation.mjs';
export const SCHEMA='geomacro.gri-automated-policy-delegation.v1';
export const ENVELOPE='geomacro.signed-gri-automated-policy-delegation.v1';
export const PROFILE='GEOMACRO_AUTOMATED_GRI_POLICY_REVIEW_V1';
export const ROLES=Object.freeze(['PALLAB_OWNER','SUMAN_POLICY_REVIEW_DELEGATOR']);
const SHA=/^[a-f0-9]{64}$/u;
const allowed=Object.freeze(['original_evidence_policy_validation','canonical_gri_v12_recomputation',
 'evidence_qualified_country_category_certification','policy_bound_owner_publication_approval',
 'risk_indices_from_verified_gri_parent']);
const denied=Object.freeze(['human_per_batch_review_claim','external_independent_human_review_claim',
 'source_rights_grant','unverified_country_category_certification','source_clock_rewrite','paid_settlement']);
const checks=Object.freeze(['existing_facts_and_rights_approvals','two_independent_originals_per_qualified_event',
 'actual_native_source_clocks','existing_current_source_windows','canonical_three_domain_scoring',
 'genuine_country_category_evidence','verified_immutable_historical_b2_lineage',
 'quota_governed_b2_write_and_independent_readback','exact_d1_public_readback',
 'new_qualified_original_after_previous_gri_anchor','no_duplicate_event_trigger',
 'no_change_holds_last_verified_without_retimestamp']);
const fail=s=>{throw Error('GRI_AUTO_CONSENT_'+s)};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).sort().join('|')===keys.slice().sort().join('|');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=['schema','repository','profile','methodology','owner_public_sha256','reviewer_public_sha256',
 'owner_machine_public_sha256','review_machine_public_sha256','issued_at','expires_at',
 'allowed_outputs','denied_outputs','required_checks','automated_policy_review_authorized',
 'human_per_batch_review_attested','external_independent_human_review_attested','source_rights_granted',
 'payments_authorized','publisher_activation_authorized_by_enrollment'];
export function validateGriAutomationPolicy(p,now=new Date()){
 if(!exact(p,keys)||p.schema!==SCHEMA||p.repository!=='blocknine0/geomacro'||
  p.profile!==PROFILE||p.methodology!=='gri-v1.2.0'||p.expires_at!==null||
  p.automated_policy_review_authorized!==true||p.human_per_batch_review_attested!==false||
  p.external_independent_human_review_attested!==false||p.source_rights_granted!==false||
  p.payments_authorized!==false||p.publisher_activation_authorized_by_enrollment!==false||
  !same(p.allowed_outputs,allowed)||!same(p.denied_outputs,denied)||!same(p.required_checks,checks))
  fail('SCOPE_INVALID');
 const pins=[p.owner_public_sha256,p.reviewer_public_sha256,
  p.owner_machine_public_sha256,p.review_machine_public_sha256];
 if(pins.some(x=>!SHA.test(x??''))||new Set(pins).size!==4)fail('DISTINCT_IDENTITIES_REQUIRED');
 const ms=Date.parse(p.issued_at);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==p.issued_at||
  !(now instanceof Date)||!Number.isFinite(now.getTime())||ms>now.getTime()+300000)fail('CLOCK_INVALID');
 return p;
}
export function makeGriAutomationPolicy({ownerPem,reviewerPem,ownerMachinePem,reviewMachinePem,
 now=new Date()}={}){
 return validateGriAutomationPolicy({schema:SCHEMA,repository:'blocknine0/geomacro',profile:PROFILE,
  methodology:'gri-v1.2.0',owner_public_sha256:spkiDigest(ownerPem),
  reviewer_public_sha256:spkiDigest(reviewerPem),owner_machine_public_sha256:spkiDigest(ownerMachinePem),
  review_machine_public_sha256:spkiDigest(reviewMachinePem),issued_at:now.toISOString(),expires_at:null,
  allowed_outputs:[...allowed],denied_outputs:[...denied],required_checks:[...checks],
  automated_policy_review_authorized:true,human_per_batch_review_attested:false,
  external_independent_human_review_attested:false,source_rights_granted:false,
  payments_authorized:false,publisher_activation_authorized_by_enrollment:false},now);
}
export function consentBytes(policy,role){
 validateGriAutomationPolicy(policy);
 if(!ROLES.includes(role))fail('ROLE_INVALID');
 return Buffer.from(SCHEMA+'\n'+role+'\n'+canonical(policy),'utf8');
}
function publicIdentity(pem,pin){
 let key;try{key=createPublicKey(pem)}catch{fail('PUBLIC_KEY_INVALID')}
 if(key.asymmetricKeyType!=='ed25519'||!SHA.test(pin??'')||spkiDigest(key)!==pin)fail('PUBLIC_PIN_MISMATCH');
 return key;
}
export function signGriAutomationConsent(policy,role,privateKey){
 const key=privateKey?.type==='private'?privateKey:createPrivateKey(privateKey);
 const pin=role===ROLES[0]?policy.owner_public_sha256:policy.reviewer_public_sha256;
 if(key.asymmetricKeyType!=='ed25519'||spkiDigest(createPublicKey(key))!==pin)fail('WRONG_HUMAN_KEY');
 return {role,signature_base64:sign(null,consentBytes(policy,role),key).toString('base64')};
}
export function verifyGriAutomationConsent({envelope,ownerPem,ownerPin,reviewerPem,reviewerPin,
 ownerMachinePem,reviewMachinePem,otherAuthorityPins=[],revoked='NO',now=new Date()}={}){
 if(revoked==='YES')fail('REVOKED');
 if(!exact(envelope,['schema','policy','approvals'])||envelope.schema!==ENVELOPE||
  !Array.isArray(envelope.approvals)||envelope.approvals.length!==2)fail('ENVELOPE_INVALID');
 const p=validateGriAutomationPolicy(envelope.policy,now);
 if(ownerPin!==p.owner_public_sha256||reviewerPin!==p.reviewer_public_sha256)fail('ENROLLED_HUMAN_PIN_MISMATCH');
 const humans=[publicIdentity(ownerPem,ownerPin),publicIdentity(reviewerPem,reviewerPin)];
 publicIdentity(ownerMachinePem,p.owner_machine_public_sha256);
 publicIdentity(reviewMachinePem,p.review_machine_public_sha256);
 if(otherAuthorityPins.some(x=>!SHA.test(x??'')||
  x===p.owner_machine_public_sha256||x===p.review_machine_public_sha256))fail('MACHINE_AUTHORITY_COLLISION');
 for(let i=0;i<2;i++){
  const a=envelope.approvals[i];
  if(!exact(a,['role','signature_base64'])||a.role!==ROLES[i]||
   !/^[A-Za-z0-9+/]{86}==$/.test(a.signature_base64??'')||
   !verify(null,consentBytes(p,a.role),humans[i],Buffer.from(a.signature_base64,'base64')))
   fail('GENUINE_TWO_PERSON_CONSENT_REQUIRED');
 }
 return Object.freeze({schema:'geomacro.gri-automation-consent-readiness.v1',
  status:'GENUINE_POLICY_CONSENT_VERIFIED_PUBLISHER_INTEGRATION_PENDING',
  profile:PROFILE,two_governance_signatures_verified:true,machine_roles_distinct:true,
  automated_policy_review_authorized:true,human_per_batch_review_attested:false,
  source_rights_granted:false,scored_gri_published:false,publisher_enabled:false,
  current_source_inputs_verified:false,country_certificates_verified:false,
  immutable_b2_readback_verified:false,d1_writes:0,b2_requests:0,payments:0});
}
export function prepareGriAutomationEnrollment({envelope,ownerPem,reviewerPem,
 ownerMachinePem,reviewMachinePem,ownerMachinePrivatePem,reviewMachinePrivatePem}={}){
 const receipt=verifyGriAutomationConsent({envelope,ownerPem,reviewerPem,
  ownerPin:spkiDigest(ownerPem),reviewerPin:spkiDigest(reviewerPem),ownerMachinePem,reviewMachinePem});
 const secrets={GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64:Buffer.from(JSON.stringify(envelope)).toString('base64')};
 for(const [role,pem,privatePem] of [['OWNER',ownerMachinePem,ownerMachinePrivatePem],
  ['REVIEW',reviewMachinePem,reviewMachinePrivatePem]]){
  const key=createPrivateKey(privatePem);
  if(key.asymmetricKeyType!=='ed25519'||spkiDigest(createPublicKey(key))!==spkiDigest(pem))fail('MACHINE_PRIVATE_MISMATCH');
  secrets[`GEOMACRO_GRI_AUTO_${role}_MACHINE_PRIVATE_PKCS8_B64`]=key.export({format:'der',type:'pkcs8'}).toString('base64');
  secrets[`GEOMACRO_GRI_AUTO_${role}_MACHINE_PUBLIC_PEM`]=pem;
  secrets[`GEOMACRO_GRI_AUTO_${role}_MACHINE_PUBLIC_SHA256`]=spkiDigest(pem);
 }
 return {secrets,receipt};
}

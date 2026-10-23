// Conditional OWNER authorization from the existing genuinely signed policy.
// This is not Suman's per-batch review, source rights, a score or a signature
// on an unseen input. The unchanged reviewed publisher must verify all of
// those before any public B2 write or D1 promotion.
import {createPublicKey} from "node:crypto";
import {verifyGriAutomationConsent} from "./gri-automation-consent.mjs";
import {spkiDigest} from "./standing-derived-delegation.mjs";

export function verifyStandingGriOwnerPublicationPolicy({env=process.env,now=new Date()}={}) {
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main")
  throw Error("GRI_STANDING_OWNER_POLICY_PROTECTED_MAIN_REQUIRED");
 return verifyStandingGriOwnerPublicationConsent({env,now});
}
// Pure consent verification is also usable by the explicit owner-private
// staging operator, which must still qualify actual signed inputs BEFORE B2.
export function verifyStandingGriOwnerPublicationConsent({env=process.env,now=new Date()}={}) {
 const fail=()=>{throw Error("GRI_STANDING_OWNER_POLICY_NOT_VERIFIED")};
 if(env.GEOMACRO_GRI_STANDING_OWNER_ADMISSION!=="VERIFIED_INPUTS_ONLY"||
    env.GEOMACRO_GRI_AUTO_ENROLLED!=="YES_CONSENT_ONLY"||
    env.GEOMACRO_GRI_AUTO_REVOKED==="YES")fail();
 const raw=env.GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64??"";
 if(raw.length<200||raw.length>24000||!/^[A-Za-z0-9+/]+={0,2}$/u.test(raw))fail();
 let envelope,gro;
 try {
  envelope=JSON.parse(Buffer.from(raw,"base64").toString("utf8"));
  gro=createPublicKey({key:Buffer.from(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"","base64"),
   format:"der",type:"spki"});
 } catch {fail()}
 if(gro.asymmetricKeyType!=="ed25519")fail();
 const pins=[env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
  env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,spkiDigest(gro)];
 if(pins.some(pin=>!/^[a-f0-9]{64}$/u.test(pin??""))||new Set(pins).size!==3)fail();
 const consent=verifyGriAutomationConsent({envelope,now,
  ownerPem:env.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_PEM,
  ownerPin:env.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_SHA256,
  reviewerPem:env.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM,
  reviewerPin:env.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256,
  ownerMachinePem:env.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM,
  reviewMachinePem:env.GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM,
  otherAuthorityPins:pins,revoked:env.GEOMACRO_GRI_AUTO_REVOKED,
 });
 if(consent.two_governance_signatures_verified!==true||
    consent.machine_roles_distinct!==true||
    !envelope.policy.allowed_outputs.includes("policy_bound_owner_publication_approval")||
    consent.source_rights_granted!==false||consent.human_per_batch_review_attested!==false)fail();
 return Object.freeze({
  schema:"geomacro.gri-standing-owner-publication-admission.v1",
  status:"STANDING_OWNER_POLICY_VERIFIED_CONDITIONAL_ON_REVIEWED_INPUTS",
  approval_mode:"STANDING_OWNER_POLICY_CONDITIONAL",
  two_genuine_policy_signatures_verified:true,
  owner_human_per_batch_review_attested:false,
  independent_reviewer_signature_verified:false,
  independent_review_and_country_certificates_still_required:true,
  source_rights_granted:false,canonical_scoring_verified:false,
  b2_readback_verified:false,d1_promotion_verified:false,
  signed_gri_published:false,real_payments_authorized:false,
  b2_requests:0,d1_writes:0,payments:0,
 });
}

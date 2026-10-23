/**
 * AUTOMATED two-machine, one-time-human-consent policy receipt over an
 * already independently verified public DERIVED-ONLY news aggregate.
 *
 * This is never a human-per-batch signature, third-party rights approval,
 * certified current GRI v1.2 number, country certificate, or x402 permission.
 * Only existing protected enrollment secrets from genuine Pallab/Suman
 * standing consent may authorize these narrowly scoped machine roles.
 */
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {verifyGriAutomationConsent,PROFILE} from "./gri-automation-consent.mjs";
import {canonical,spkiDigest} from "./standing-derived-delegation.mjs";

export const SCHEMA="geomacro.gri-auto-policy-derived-audit.v1";
export const ROLES=Object.freeze(["OWNER_AUTOMATED_POLICY","REVIEW_AUTOMATED_POLICY"]);
const MAX=600;
const PIN=/^[a-f0-9]{64}$/u;
const SIGN=/^[A-Za-z0-9+/]{86}==$/u;
const B64=/^[A-Za-z0-9+/]+={0,2}$/u;
const fail=code=>{throw Error("GRI_AUTO_POLICY_"+code)};
const hex=b=>createHash("sha256").update(b).digest("hex");
const isInt=x=>Number.isSafeInteger(x)&&x>=0&&x<=MAX;
const message=(role,body)=>Buffer.from(
  "GEOMACRO/GriAutomatedDerivedReviewV1\n"+role+"\n"+canonical(body),"utf8");

export function qualifyDerivedNewsAuditForPolicy(audit){
 if(!audit||audit.schema!=="geomacro.all-news-signed-publication-acceptance.v1"||
   audit.all_retained_unique_news_signature_verified!==true||
   !isInt(audit.journal_items)||!isInt(audit.unique_items)||
   !isInt(audit.exact_signed_inputs_independently_verified)||
   !isInt(audit.original_page_verified_reported)||
   !isInt(audit.current_qualified_news)||
   !isInt(audit.current_source_verified_signed_reported)||
   audit.unique_items===0||
   audit.exact_signed_inputs_independently_verified!==audit.unique_items||
   audit.journal_items<audit.unique_items||
   audit.original_page_verified_reported>audit.unique_items||
   audit.current_qualified_news>audit.unique_items||
   audit.current_source_verified_signed_reported>audit.original_page_verified_reported||
   audit.current_source_verified_signed_reported>audit.current_qualified_news||
   audit.commercial_rights_attested!==false||
   audit.paid_delivery_enabled!==false||audit.payments!==0||
   audit.legacy_signed_hot_3_of_3_verified!==false)fail("SOURCE_AUDIT_NOT_TRUSTED");
 if(audit.current_qualified_news===0||
    audit.current_source_verified_signed_reported===0 ||
    audit.all_current_qualified_news_source_verified_signed!==true ||
    audit.current_source_verified_signed_reported!==audit.current_qualified_news)
  return Object.freeze({eligible:false,reason:"NO_FULLY_VERIFIED_CURRENT_ORIGINAL_BATCH"});
 return Object.freeze({eligible:true,reason:"RECENT_ORIGINAL_DERIVED_ONLY_RESEARCH_REVIEW_ELIGIBLE"});
}

export function issueAutomatedPolicyDerivedReview({
 audit,env,now=new Date()
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!env||
   env.GITHUB_ACTIONS!=="true"||
   env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||
   env.GEOMACRO_GRI_AUTO_ENROLLED!=="YES_CONSENT_ONLY"||
   env.GEOMACRO_GRI_AUTO_REVOKED==="YES")fail("PROTECTED_UNREVOKED_CONSENT_REQUIRED");
 const qualified=qualifyDerivedNewsAuditForPolicy(audit);
 if(!qualified.eligible)return Object.freeze({
   schema:SCHEMA,status:"SKIPPED_NO_VERIFIED_CURRENT_ORIGINAL",
   publisher_enabled:false,reviewed_gri_signed:false,
   source_rights_granted:false,paid_delivery_authorized:false,
   b2_requests:0,d1_writes:0,payments:0
 });
 let envelope;
 try{
   const raw=env.GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64??"";
   if(raw.length<200||raw.length>24000||!B64.test(raw))fail("CONSENT_INVALID");
   envelope=JSON.parse(Buffer.from(raw,"base64").toString("utf8"));
 }catch{fail("CONSENT_INVALID")}
 let pubGro;
 try{pubGro=createPublicKey({key:Buffer.from(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"","base64"),format:"der",type:"spki"})}
 catch{fail("GRO_PUBLIC_KEY_INVALID")}
 const verified=verifyGriAutomationConsent({
  envelope,
  ownerPem:env.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_PEM,
  ownerPin:env.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_SHA256,
  reviewerPem:env.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM,
  reviewerPin:env.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256,
  ownerMachinePem:env.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM,
  reviewMachinePem:env.GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM,
  otherAuthorityPins:[
    env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
    env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,
    spkiDigest(pubGro)
  ],
  revoked:env.GEOMACRO_GRI_AUTO_REVOKED,
  now
 });
 if(!verified.two_governance_signatures_verified||
    !verified.machine_roles_distinct||
    verified.source_rights_granted||
    verified.publisher_enabled||verified.scored_gri_published)fail("CONSENT_SCOPE_INVALID");
 const names=[
  ["OWNER",env.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM],
  ["REVIEW",env.GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM]
 ];
 // Validate BOTH identities before issuing EITHER machine signature.
 const keys=names.map(([name,pem])=>{
  let priv;
  try{
   const raw=env[`GEOMACRO_GRI_AUTO_${name}_MACHINE_PRIVATE_PKCS8_B64`]??"";
   if(raw.length<40||raw.length>8192||!B64.test(raw))fail("MACHINE_PRIVATE_INVALID");
   priv=createPrivateKey({key:Buffer.from(raw,"base64"),format:"der",type:"pkcs8"});
  }catch{fail("MACHINE_PRIVATE_INVALID")}
  if(priv.asymmetricKeyType!=="ed25519"||
     !PIN.test(spkiDigest(pem))||
     spkiDigest(createPublicKey(priv))!==spkiDigest(pem))
     fail("MACHINE_SIGNER_PUBLIC_IDENTITY_MISMATCH");
  return priv;
 });
 const auditBytes=Buffer.from(canonical(audit),"utf8");
 if(auditBytes.length>16_384)fail("AUDIT_RECEIPT_OVERSIZE");
 const payload=Object.freeze({
  schema:SCHEMA,
  profile:PROFILE,
  authority_scope:"DERIVED_SIGNED_NEWS_RESEARCH_AUDIT_ONLY",
  audit_sha256:hex(auditBytes),
  consent_policy_sha256:hex(Buffer.from(canonical(envelope.policy),"utf8")),
  signed_derived_unique_items:audit.unique_items,
  current_exact_original_readbacks:audit.current_source_verified_signed_reported,
  assessed_at:now.toISOString(),
  original_event_legally_usable_for_paid_products:false,
  certified_numeric_gri_v12:false,
  human_per_batch_review_attested:false,
  external_independent_human_review_attested:false,
  country_category_certificates_issued:false,
  source_rights_granted:false,
  b2_or_d1_published:false,
  payment_authorized:false,
 });
 const approvals=keys.map((key,i)=>{
  const sig=sign(null,message(ROLES[i],payload),key).toString("base64");
  if(!SIGN.test(sig)||
     !verify(null,message(ROLES[i],payload),createPublicKey(key),Buffer.from(sig,"base64")))
    fail("MACHINE_POLICY_SIGNATURE_UNVERIFIED");
  return {role:ROLES[i],signature_base64:sig};
 });
 return Object.freeze({
  schema:"geomacro.signed-gri-auto-policy-derived-audit.v1",
  status:"AUTOMATED_POLICY_DERIVED_AUDIT_SIGNED_NOT_CURRENT_GRI",
  payload,approvals,
  one_time_human_policy_consent_cryptographically_verified:true,
  distinct_automated_machine_signers_verified:true,
  source_rights_granted:false,reviewed_gri_signed:false,
  country_certificates_signed:false,
  legacy_signed_hot_products_verified:false,
  paid_delivery_authorized:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
 });
}

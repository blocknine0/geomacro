/**
 * Source-neutral, versioned bridge between the privileged signed-news verifier
 * and an isolated once-consented GRI policy machine signer.
 *
 * This bridge does not transport private source verdicts, article identifiers,
 * source timestamps, original-page material, canonical numerical scores,
 * country certificates, or commercial authorization.
 */
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {canonical,spkiDigest} from "./standing-derived-delegation.mjs";
import {verifyGriAutomationConsent,PROFILE} from "./gri-automation-consent.mjs";

export const AUDIT_SCHEMA="geomacro.gri-source-neutral-issuer-audit.v1";
export const SIGNED_SCHEMA="geomacro.gri-source-neutral-machine-policy.v1";
const DIGEST=/^[a-f0-9]{64}$/u;
const SIGNATURE=/^[A-Za-z0-9+/]{86}==$/u;
const SHA=/^[a-f0-9]{40}$/u;
const fail=code=>{throw Error("GRI_SOURCE_NEUTRAL_"+code);};
const bytes=(scope,obj)=>Buffer.from(scope+"\n"+canonical(obj),"utf8");
const hash=data=>createHash("sha256").update(data).digest("hex");
const isCount=x=>Number.isSafeInteger(x)&&x>0&&x<=600;
const own=(object,fields)=>object&&typeof object==="object"&&!Array.isArray(object)&&
 Object.keys(object).sort().join("|")===fields.slice().sort().join("|");

function signer(raw,expectedPublicPemOrSpkiB64){
 let key,pub;
 try{
  key=createPrivateKey({key:Buffer.from(raw??"","base64"),format:"der",type:"pkcs8"});
  pub=typeof expectedPublicPemOrSpkiB64==="string"&&
   expectedPublicPemOrSpkiB64.startsWith("-----BEGIN")
   ?createPublicKey(expectedPublicPemOrSpkiB64)
   :createPublicKey({key:Buffer.from(expectedPublicPemOrSpkiB64??"","base64"),
      format:"der",type:"spki"});
 }catch{fail("SIGNER_INVALID");}
 if(key.asymmetricKeyType!=="ed25519"||pub.asymmetricKeyType!=="ed25519"||
    spkiDigest(createPublicKey(key))!==spkiDigest(pub))fail("SIGNER_IDENTITY_MISMATCH");
 return {privateKey:key,publicKey:pub};
}
function protectedRun(env) {
 if(env?.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(env.GITHUB_SHA??"")||
    !/^[1-9]\d{0,19}$/u.test(env.GITHUB_RUN_ID??""))
   fail("PROTECTED_MAIN_REQUIRED");
}
/**
 * The OWNER job independently verified the complete privileged report first.
 * Copy ONLY two bounded coverage counts, not the full report or any
 * source/original/review status. A positive issuer receipt is NOT proof of
 * original authenticity, review, country certification or score readiness.
 */
export function makeSourceNeutralIssuerAudit({report,env,now=new Date()}={}){
 protectedRun(env);
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
  report?.schema!=="geomacro.all-news-signed-publication-acceptance.v1"||
  report.all_retained_unique_news_signature_verified!==true||
  report.journal_fingerprint_verified!==true||
  report.publication_pages_bound_to_same_journal!==true||
  !isCount(report.unique_items)||
  report.exact_signed_inputs_independently_verified!==report.unique_items||
  !Number.isSafeInteger(report.journal_items)||
  report.journal_items<report.unique_items||report.journal_items>600||
  report.paid_delivery_enabled!==false||
  report.commercial_rights_attested!==false||
  report.payments!==0||
  report.legacy_signed_hot_3_of_3_verified!==false)
    fail("PRIVILEGED_ISSUER_VERIFICATION_REQUIRED");
 const {privateKey}=signer(env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64,
  env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64);
 const payload={
  schema:AUDIT_SCHEMA,
  trust_scope:"DERIVED_ISSUER_SIGNATURE_COVERAGE_ONLY",
  repository:"blocknine0/geomacro",main_sha:env.GITHUB_SHA,
  run_id:env.GITHUB_RUN_ID,
  issuer_verified_derived_items:report.unique_items,
  checked_at:now.toISOString(),
  private_original_source_verdict_transported:false,
  independent_reviewer_certified:false,
  eligible_country_category_certificates_present:false,
  numerical_gri_scored:false,
  public_current_indices_authorized:false,
  commercial_rights_attested:false,payments:0
 };
 const message=bytes("GEOMACRO/GriSourceNeutralIssuerV1",payload);
 const signed={
  payload,issuer_signature_base64:sign(null,message,privateKey).toString("base64"),
  payload_sha256:hash(message)
 };
 if(!SIGNATURE.test(signed.issuer_signature_base64))fail("ISSUER_SIGNATURE_INVALID");
 return Object.freeze(signed);
}
export function verifySourceNeutralIssuerAudit({
 audit,issuerPublicSpkiB64,expectedSha,expectedRunId,now=new Date()
}={}){
 if(!own(audit,["payload","issuer_signature_base64","payload_sha256"])||
    !own(audit.payload,[
      "schema","trust_scope","repository","main_sha","run_id",
      "issuer_verified_derived_items","checked_at",
      "private_original_source_verdict_transported",
      "independent_reviewer_certified","eligible_country_category_certificates_present",
      "numerical_gri_scored","public_current_indices_authorized",
      "commercial_rights_attested","payments"
    ]))fail("ALLOWLIST_INVALID");
 const p=audit.payload,at=Date.parse(p.checked_at);
 if(p.schema!==AUDIT_SCHEMA||p.repository!=="blocknine0/geomacro"||
    p.trust_scope!=="DERIVED_ISSUER_SIGNATURE_COVERAGE_ONLY"||
    p.main_sha!==expectedSha||!SHA.test(p.main_sha)||
    p.run_id!==expectedRunId||!/^[1-9]\d{0,19}$/u.test(p.run_id??"")||
    !isCount(p.issuer_verified_derived_items)||
    p.private_original_source_verdict_transported!==false||
    p.independent_reviewer_certified!==false||
    p.eligible_country_category_certificates_present!==false||
    p.numerical_gri_scored!==false||
    p.public_current_indices_authorized!==false||
    p.commercial_rights_attested!==false||p.payments!==0||
    !Number.isFinite(at)||at>now.getTime()+30_000||
    now.getTime()-at>10*60_000||
    !SIGNATURE.test(audit.issuer_signature_base64??"")||
    !DIGEST.test(audit.payload_sha256??""))fail("ISSUER_PAYLOAD_INVALID");
 let pub;
 try {
  pub=createPublicKey({key:Buffer.from(issuerPublicSpkiB64??"","base64"),
    format:"der",type:"spki"});
 }catch{fail("ISSUER_PUBLIC_KEY_INVALID");}
 if(pub.asymmetricKeyType!=="ed25519")fail("ISSUER_PUBLIC_KEY_INVALID");
 const message=bytes("GEOMACRO/GriSourceNeutralIssuerV1",p);
 if(hash(message)!==audit.payload_sha256||
   !verify(null,message,pub,Buffer.from(audit.issuer_signature_base64,"base64")))
    fail("ISSUER_SIGNATURE_INVALID");
 return Object.freeze({ok:true,payload_sha256:audit.payload_sha256,
  issuer_verified_derived_items:p.issuer_verified_derived_items});
}
/** Dedicated machine roles attest policy only, and cannot promote scores. */
export function signConsentedSourceNeutralPolicy({audit,env,now=new Date()}={}){
 protectedRun(env);
 if(env.GEOMACRO_GRI_AUTO_ENROLLED!=="YES_CONSENT_ONLY"||
    env.GEOMACRO_GRI_AUTO_REVOKED==="YES")fail("ENROLLMENT_NOT_ACTIVE");
 const accepted=verifySourceNeutralIssuerAudit({
  audit,issuerPublicSpkiB64:env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64,
  expectedSha:env.GITHUB_SHA,expectedRunId:env.GITHUB_RUN_ID,now});
 let envelope,gro;
 try{
  envelope=JSON.parse(Buffer.from(env.GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64??"","base64").toString("utf8"));
  gro=createPublicKey({key:Buffer.from(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"","base64"),
    format:"der",type:"spki"});
 }catch{fail("CONSENT_ENVELOPE_INVALID");}
 const eligibility=verifyGriAutomationConsent({
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
   spkiDigest(gro)
  ],
  revoked:env.GEOMACRO_GRI_AUTO_REVOKED,now
 });
 if(!eligibility.two_governance_signatures_verified||
   eligibility.scored_gri_published!==false)fail("CONSENT_NOT_VERIFIED");
 const roles=["OWNER_AUTOMATED_POLICY","REVIEW_AUTOMATED_POLICY"];
 const machines=[
  ["OWNER",env.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM],
  ["REVIEW",env.GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM]
 ];
 const keys=machines.map(([role,pem])=>signer(
  env["GEOMACRO_GRI_AUTO_"+role+"_MACHINE_PRIVATE_PKCS8_B64"],pem));
 if(spkiDigest(keys[0].publicKey)===spkiDigest(keys[1].publicKey))
  fail("MACHINE_ROLE_COLLISION");
 const payload={
  schema:SIGNED_SCHEMA,profile:PROFILE,
  authority_scope:"AUTOMATED_DERIVED_POLICY_AUDIT_ONLY",
  source_neutral_issuer_sha256:accepted.payload_sha256,
  verified_derived_count:accepted.issuer_verified_derived_items,
  source_originals_and_rights_certified:false,
  reviewer_per_batch_signature_claimed:false,
  independently_reviewed_numeric_gri:false,
  country_category_certificates_signed:false,
  current_risk_indices_published:false,
  paid_delivery_authorized:false,
  signed_at:now.toISOString()
 };
 const approvals=keys.map(({privateKey,publicKey},i)=>{
  const message=bytes("GEOMACRO/GriSourceNeutralMachineV1/"+roles[i],payload);
  const signature_base64=sign(null,message,privateKey).toString("base64");
  if(!verify(null,message,publicKey,Buffer.from(signature_base64,"base64")))
    fail("MACHINE_SIGNATURE_INVALID");
  return {role:roles[i],signature_base64};
 });
 return Object.freeze({schema:SIGNED_SCHEMA,
  status:"CONSENTED_TWO_MACHINE_SOURCE_NEUTRAL_POLICY_SIGNED",
  payload,approvals,
  producer_source_proof_transported:false,
  independent_reviewer_verified_by_this_receipt:false,
  numerical_gri_authorized_by_this_receipt:false,
  x402_payment_authorized:false,
  b2_operations:0,d1_writes:0,payments:0});
}

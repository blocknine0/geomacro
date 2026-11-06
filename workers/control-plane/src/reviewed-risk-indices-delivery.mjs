/**
 * Public THREE-index delivery from the already reviewed GRI v1.2 publisher.
 * Never derives a score from OSINT, self-certified news-severity, or triage.
 * Ed25519 below proves GeoMacro DELIVERY integrity, not an external review.
 * Reviewer authorization happens in the existing protected GRI publisher.
 */
import {canonicalProgressiveJson,progressiveSha} from "./progressive-risk-gate.mjs";
const HASH=/^[a-f0-9]{64}$/u;
const CATEGORIES=new Map([["geopolitics","geopolitics"],
 ["macro","macro"],["critical_minerals","rare_earth"]]);
const encoder=new TextEncoder();
const unavailable=()=>Response.json({ok:false,
 code:"CURRENT_REVIEWED_SIGNED_THREE_INDICES_UNAVAILABLE",
 certification_missing_is_not_zero_risk:true},{
 status:503,headers:{"Cache-Control":"public, max-age=30",
  "X-Content-Type-Options":"nosniff"}});
async function readSnapshot(read,category){
 const r=await read(category);
 if(r?.status!==200)return null;
 let body;try{body=await r.json()}catch{return null}
 return body;
}
function checked(doc,product,now){
 if(doc?.ok!==true||doc.product!==product||
   doc.verification_mode!=="direct-b2-readback"||
   doc.full_b2_readback_verified!==true||
   doc.exact_gzip_restore_verified!==true||
   !HASH.test(doc.b2_sha256??"")||
   !HASH.test(doc.payload_sha256??"")||
   typeof doc.payload_json!=="string"||
   doc.payload_json.length>786432||
   !Number.isFinite(Date.parse(doc.source_as_of??""))||
   Date.parse(doc.source_as_of)>now+5*60000||
   now-Date.parse(doc.source_as_of)>60*60000||
   !Number.isFinite(Date.parse(doc.expires_at??""))||
   Date.parse(doc.expires_at)<=now)return false;
 return true;
}
export async function serveReviewedSignedRiskIndices(env,read,now=Date.now()){
 if(!env||typeof read!=="function"||!Number.isFinite(now))return unavailable();
 try{
  const [child,parent]=await Promise.all([
    readSnapshot(read,"risk-indices"),readSnapshot(read,"global-risk")]);
  if(!checked(child,"risk-indices",now)||!checked(parent,"global-risk",now)||
    child.schema!=="geomacro.public-risk-indices-live.v1"||
    child.proof_schema!=="geomacro.public-risk-indices-live-proof.v1"||
    child.current_b2_readback_verified!==true||
    parent.schema!=="geomacro.public-global-risk-live.v1"||
    parent.proof_schema!=="geomacro.public-global-risk-live-proof.v1"||
    parent.b2_object_key!=="geomacro-evidence/v1/live/global-risk/latest.json.gz"||
    child.b2_object_key!=="geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz")
    return unavailable();
  if(await progressiveSha(child.payload_json)!==child.payload_sha256||
     await progressiveSha(parent.payload_json)!==parent.payload_sha256)
     return unavailable();
  const childValue=JSON.parse(child.payload_json),parentValue=JSON.parse(parent.payload_json);
  const data=childValue?.data,gri=parentValue?.data;
  if(childValue.schema!==child.schema||parentValue.schema!==parent.schema||
     childValue.parent_global_risk_payload_sha256!==parent.payload_sha256||
     childValue.parent_global_risk_b2_sha256!==parent.b2_sha256||
     child.source_as_of!==parent.source_as_of||
     child.source_as_of!==data?.snapshotAsOf||
     childValue.source_project!=="ldpwajisioljyjtojvfx"||
     data?.contractVersion!=="risk-indices-v1.1.0"||
     data.parentMethodologyVersion!=="gri-v1.2.0"||
     data.proofScope!=="verified-category-projection"||
     data.verificationStatus!=="verified"||
     gri?.methodologyVersion!=="gri-v1.2.0"||
     gri.verificationStatus!=="verified"||gri.auditPersisted!==true||
     !HASH.test(gri.proofHash??"")||!HASH.test(gri.evidenceHash??"")||
     !HASH.test(gri.calculationHash??"")||
     data.snapshotId!==gri.snapshotId||
     data.snapshotAsOf!==gri.snapshotAsOf||
     data.proofHash!==gri.proofHash||
     data.evidenceHash!==gri.evidenceHash||
     data.calculationHash!==gri.calculationHash||
     data.inputHash!==gri.inputHash||
     data.methodologyHash!==gri.methodologyHash||
     !Array.isArray(data.indices)||data.indices.length!==3)
     return unavailable();
  const required=new Map(CATEGORIES);
  for(const item of data.indices){
    const native=Date.parse(item?.readingAsOf??"");
    const original=gri.domainIndices?.[item?.sourceCategory];
    if(!original||original.score!==item.score||
       original.rawScore!==item.rawScore||
       original.readingAsOf!==item.readingAsOf||
       original.readingSnapshotId!==item.readingSnapshotId||
       original.readingStatus!==item.readingStatus||
       original.confidence!==item.confidence||
       original.sourceCount!==item.sourceCount||
       original.independentStoryCount!==item.independentStoryCount)
      return unavailable();
    if(!required.has(item?.key)||required.get(item.key)!==item.sourceCategory||
       item.status!=="available"||item.readingStatus!=="current"||
       typeof item.score!=="number"||!Number.isFinite(item.score)||
       item.score<0||item.score>100||
       !Number.isFinite(native)||native>now+5*60000||now-native>60*60000||
       !item.readingSnapshotId||!Array.isArray(item.series?.["7D"]?.buckets)||
       item.series["7D"].buckets.length<2||
       !Array.isArray(item.series?.["30D"]?.buckets)||
       item.series["30D"].buckets.length<2)return unavailable();
    required.delete(item.key);
  }
  if(required.size!==0)return unavailable();
  const keyId=String(env.RISK_GATE_DECISION_ED25519_KEY_ID??"");
  if(!/^[A-Za-z0-9._:-]{4,120}$/.test(keyId))return unavailable();
  const privateB64=String(env.RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64??"");
  const publicB64=String(env.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
  if(!privateB64||!publicB64)return unavailable();
  const privateKey=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(privateB64),x=>x.charCodeAt(0)),
   {name:"Ed25519"},false,["sign"]);
  const publicKey=await crypto.subtle.importKey("spki",Uint8Array.from(atob(publicB64),x=>x.charCodeAt(0)),
   {name:"Ed25519"},false,["verify"]);
  const payload={schema:"geomacro.reviewed-indices-issuer-delivery.v1",
    issuer:"GeoMacro",signature_proves:"ISSUER_DELIVERY_INTEGRITY_NOT_REVIEWER_IDENTITY",
    reviewer_source:"EXISTING_PROTECTED_GRI_V1_2_PUBLISHER",
    source_as_of:child.source_as_of,expires_at:child.expires_at,
    parent_b2_sha256:parent.b2_sha256,parent_payload_sha256:parent.payload_sha256,
    indices_b2_sha256:child.b2_sha256,indices_payload_sha256:child.payload_sha256,
    data};
  const bytes=encoder.encode(canonicalProgressiveJson(payload));
  const signature=new Uint8Array(await crypto.subtle.sign("Ed25519",privateKey,bytes));
  if(!await crypto.subtle.verify("Ed25519",publicKey,signature,bytes))return unavailable();
  const sig=btoa(String.fromCharCode(...signature));
  const digest=await progressiveSha(canonicalProgressiveJson(payload));
  return Response.json({ok:true,schema:"geomacro.reviewed-indices-signed-delivery.v1",
   signed_payload:payload,signature_scheme:"Ed25519",signature_key_id:keyId,
   signature_b64:sig,payload_sha256:digest},{
   status:200,headers:{"Cache-Control":"public, max-age=30",
    "X-Content-Type-Options":"nosniff",
    "X-GeoMacro-Signature-Scheme":"Ed25519",
    "X-GeoMacro-Signing-Key-Id":keyId,
    "X-GeoMacro-Payload-Sha256":digest,
    "X-GeoMacro-Signature":sig,
    "X-GeoMacro-Source-As-Of":child.source_as_of,
    "X-GeoMacro-Certification-Scope":"existing-reviewed-gri-v1.2-publication"}});
 }catch{return unavailable()}
}

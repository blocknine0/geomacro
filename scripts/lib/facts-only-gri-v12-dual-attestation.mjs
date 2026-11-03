/** Production-only verification of a GRI v1.2 facts/rights dual attestation.
 *
 * An RSS item, two headlines, GDELT CAMEO code, SHA-shaped placeholder or
 * self-reported true flag NEVER produces commercial eligibility.
 * This verifier neither issues signatures nor stores raw article text.
 */
import {createHash,createPublicKey,verify as verifyEd25519} from "node:crypto";
import {calculateGri,canonicalJson,methodologyManifest,GRI_METHOD_VERSION}
 from "./gri-engine-v12.js";

const HASH=/^[a-f0-9]{64}$/u;
const SIG=/^[A-Za-z0-9+/]{86}==$/u;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
export const FACTS_GRI_PROOF_SCHEMA="geomacro.facts-only-gri-v12-dual-attestation.v1";
export const VERIFIED_GRI_METHODOLOGY_SHA256=sha(canonicalJson(methodologyManifest()));
const keys=env=>{
 try{
  const build=prefix=>{
   const text=env[prefix+"_PUBLIC_KEY_PEM"];
   const expected=env[prefix+"_PUBLIC_KEY_SHA256"];
   if(!text||!HASH.test(expected??""))return null;
   const pub=createPublicKey(text);
   if(pub.asymmetricKeyType!=="ed25519")return null;
   const actual=sha(pub.export({type:"spki",format:"der"}));
   return actual===expected?{pub,actual}:null;
  };
  const facts=build("GEOMACRO_MACHINE_FACTS");
  const rights=build("GEOMACRO_MACHINE_RIGHTS");
  return facts&&rights&&facts.actual!==rights.actual?{facts,rights}:null;
 }catch{return null;}
};
// The numerical GRI input is structured facts only. Check recursively:
// an article paragraph hidden under nested metadata must not bypass the
// top-level forbidden-key check. Keep bounds finite on untrusted input.
export const scoreEventsAreFactsOnly=events=>{
 if(!Array.isArray(events)||events.length<1||events.length>250)return false;
 const forbidden=new Set(["title","source_title","headline","article_headline",
  "source_headline","summary","description","article_body","article_text",
  "original_content","raw_content","full_text","body_text","paragraph"]);
 const clean=(value,depth=0)=>{
  if(depth>4)return false;
  if(value===null||typeof value==="boolean")return true;
  if(typeof value==="number")return Number.isFinite(value);
  if(typeof value==="string")
   return value.length<=250&&!/\n\s*\n/u.test(value);
  if(Array.isArray(value))
   return value.length<=250&&value.every(x=>clean(x,depth+1));
  if(typeof value!=="object")return false;
  const fields=Object.entries(value);
  return fields.length<=75&&fields.every(([name,v])=>
   !forbidden.has(name.toLowerCase())&&clean(v,depth+1));
 };
 return events.every(row=>row&&typeof row==="object"&&!Array.isArray(row)&&
  clean(row)&&typeof row.story_canonical_label==="string"&&
  /^[A-Z][A-Z0-9_]{3,79}$/u.test(row.story_canonical_label)&&
  typeof row.story_decision_rationale==="string"&&
  row.story_decision_rationale.length<=96);
};

/** Return true only for a genuinely recomputable, separately signed proof.
 * @param {object} source The server's trusted candidate + independently read provenance.
 * @param {object} env Protected server environment. Callers in product code
 *  MUST omit this argument; it is injectable only in isolated offline tests.
 */
export function verifyPinnedFactsOnlyGriV12Proof(source,env=process.env){
 try{
  const s=source;
  const p=s?.scoreProof;
  const authorities=keys(env);
  if(!p||!authorities||p.schema!==FACTS_GRI_PROOF_SCHEMA||
     !scoreEventsAreFactsOnly(p.score_events)||
     typeof p.as_of!=="string"||
     !Number.isFinite(Date.parse(p.as_of))||
     Math.abs(Date.now()-Date.parse(p.as_of))>72*3_600_000||
     p.methodology_hash!==VERIFIED_GRI_METHODOLOGY_SHA256||
     p.methodology_version!==GRI_METHOD_VERSION||
     !HASH.test(p.input_hash??"")||
     !HASH.test(p.calculation_hash??"")||
     !HASH.test(p.fact_hash??"")||
     p.fact_hash!==s.factualRecordSha256||
     p.country_iso3!==s.countryIso3||
     p.event_code!==s.eventType||
     !SIG.test(p.facts_signature_b64??"")||
     !SIG.test(p.rights_signature_b64??""))return false;
  const expectedInputHash=sha(canonicalJson({
    fact_hash:s.factualRecordSha256,
    source_id:s.sourceId,
    source_access_authorized:s.sourceAccessAuthorized,
    source_terms_allow_processing:s.sourceTermsAllowThisProcessing,
    attribution_recorded:s.attributionRecorded,
    publisher_expression_reused:s.publisherExpressionReused,
    raw_article_text_stored:s.rawArticleTextStored,
    original_article_redistributed:s.originalArticleRedistributed,
    independent_same_event_verified:s.independentSameEventVerified,
    source_native_time_verified:s.sourceNativeTimeVerified,
    independent_evidence:(s.independentEvidence??[]).map(e=>({
      kind:e.kind,issuer:e.issuer,url:e.url,sha256:e.contentSha256,
      independently_fetched:e.independentlyFetched,
      issuer_verified:e.issuerVerified,same_event_verified:e.sameEventVerified,
      fact_verified:e.factVerified,
      licence_or_public_domain_verified:e.licenceOrPublicDomainVerified,
      third_party_material_excluded:e.thirdPartyMaterialExcluded,
    })).sort((a,b)=>a.sha256.localeCompare(b.sha256)),
    score_events:p.score_events,
    as_of:p.as_of,
  }));
  if(p.input_hash!==expectedInputHash)return false;
  const calculated=calculateGri(p.score_events,new Date(p.as_of));
  if(calculated.methodologyVersion!==GRI_METHOD_VERSION||
     calculated.eventCount!==p.score_events.length||
     calculated.rawScore===null||!Number.isFinite(calculated.rawScore)||
     calculated.displayScore!==p.verified_score_0_100||
     calculated.rawScore<0||calculated.rawScore>100)return false;
  const expectedCalculation=sha(canonicalJson({
    methodology_hash:p.methodology_hash,input_hash:p.input_hash,
    raw_score:calculated.rawScore,display_score:calculated.displayScore,
    category_breakdown:calculated.categories.map(row=>({
      category:row.category,score:row.score,
    })),
  }));
  if(p.calculation_hash!==expectedCalculation)return false;
  const signed={
    schema:p.schema,methodology_version:p.methodology_version,
    methodology_hash:p.methodology_hash,input_hash:p.input_hash,
    calculation_hash:p.calculation_hash,fact_hash:p.fact_hash,
    country_iso3:p.country_iso3,event_code:p.event_code,as_of:p.as_of,
    verified_score_0_100:p.verified_score_0_100,
  };
  const bytes=Buffer.from(canonicalJson(signed),"utf8");
  return verifyEd25519(null,bytes,authorities.facts.pub,
      Buffer.from(p.facts_signature_b64,"base64"))&&
    verifyEd25519(null,bytes,authorities.rights.pub,
      Buffer.from(p.rights_signature_b64,"base64"));
 }catch{return false;}
}

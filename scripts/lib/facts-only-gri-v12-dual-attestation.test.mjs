import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {canonicalJson,methodologyManifest,calculateGri,GRI_METHOD_VERSION,
 GRI_STORY_CORRELATION_VERSION,GRI_STORY_CORRELATION_PROMPT_VERSION}
 from "./gri-engine-v12.js";
import {FACTS_GRI_PROOF_SCHEMA,VERIFIED_GRI_METHODOLOGY_SHA256,
 verifyPinnedFactsOnlyGriV12Proof} from "./facts-only-gri-v12-dual-attestation.mjs";
import {resolveDerivedCommercialEligibility}
 from "./official-original-issuer-rights.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const fakeKeys=()=>{
 const facts=generateKeyPairSync("ed25519");
 const rights=generateKeyPairSync("ed25519");
 const config={};
 for(const [prefix,entry] of [["GEOMACRO_MACHINE_FACTS",facts],
   ["GEOMACRO_MACHINE_RIGHTS",rights]]){
  config[prefix+"_PUBLIC_KEY_PEM"]=entry.publicKey.export({type:"spki",format:"pem"});
  config[prefix+"_PUBLIC_KEY_SHA256"]=sha(
    entry.publicKey.export({type:"spki",format:"der"}));
 }
 return {facts,rights,config};
};
const signedFixture=()=>{
 const asOf=new Date().toISOString();
 const observed=new Date(Date.parse(asOf)-45*60_000).toISOString();
 const row={
  id:"reviewed-test-only-aus-001",category:"rare_earth",
  severity:75,confidence:90,created_at:observed,
  source_name:"Independent Australian official statement",
  source_domain:"industry.gov.au",
  story_cluster_id:"AUS_REVIEWED_MINERAL_EVENT_001",
  story_canonical_label:"MINERAL_EXPORT_RESTRICTION",
  story_assignment_decision:"anchor",
  story_decision_rationale:"INDEPENDENT_PRIMARY_DOCUMENT_MATCH",
  story_match_confidence:99,
  story_clustering_version:GRI_STORY_CORRELATION_VERSION,
  story_clustering_prompt_version:GRI_STORY_CORRELATION_PROMPT_VERSION,
  story_clustering_provider:"independent-review",
  story_clustering_model:"verified-structured-provenance-v1",
  story_clustering_scored_at:observed,
  story_clustering_input_hash:"1".repeat(64),
 };
 const source={
  sourceId:"australia_industry_minister_original_rss_review",
  sourceAccessAuthorized:true,sourceTermsAllowThisProcessing:true,
  publisherExpressionReused:false,rawArticleTextStored:false,
  originalArticleRedistributed:false,attributionRecorded:true,
  independentEvidence:[{
   kind:"OFFICIAL_PRIMARY_DOCUMENT",
   url:"https://www.industry.gov.au/news/example-reviewed-official-original",
   issuer:"Australian Government verified primary",
   contentSha256:"2".repeat(64),
   independentlyFetched:true,issuerVerified:true,sameEventVerified:true,
   factVerified:true,licenceOrPublicDomainVerified:true,
   thirdPartyMaterialExcluded:true,
  }],
  countryIso3:"AUS",eventType:"MINERAL_EXPORT_RESTRICTION",
  sourceNativeTimeVerified:true,factualRecordSha256:"3".repeat(64),
  independentSameEventVerified:true,independentScoreAuditVerified:true,
  scoreDerivedOnlyFromVerifiedFacts:true,
 };
 const score_events=[row];
 const calc=calculateGri(score_events,new Date(asOf));
 const methodology_hash=VERIFIED_GRI_METHODOLOGY_SHA256;
 assert.equal(methodology_hash,sha(canonicalJson(methodologyManifest())));
 const input_hash=sha(canonicalJson({
  fact_hash:source.factualRecordSha256,
  source_id:source.sourceId,
  source_access_authorized:source.sourceAccessAuthorized,
  source_terms_allow_processing:source.sourceTermsAllowThisProcessing,
  attribution_recorded:source.attributionRecorded,
  publisher_expression_reused:source.publisherExpressionReused,
  raw_article_text_stored:source.rawArticleTextStored,
  original_article_redistributed:source.originalArticleRedistributed,
  independent_same_event_verified:source.independentSameEventVerified,
  source_native_time_verified:source.sourceNativeTimeVerified,
  independent_evidence:source.independentEvidence.map(e=>({
   kind:e.kind,issuer:e.issuer,url:e.url,sha256:e.contentSha256,
   independently_fetched:e.independentlyFetched,
   issuer_verified:e.issuerVerified,same_event_verified:e.sameEventVerified,
   fact_verified:e.factVerified,
   licence_or_public_domain_verified:e.licenceOrPublicDomainVerified,
   third_party_material_excluded:e.thirdPartyMaterialExcluded,
  })),
  score_events,as_of:asOf,
 }));
 const calculation_hash=sha(canonicalJson({
  methodology_hash,input_hash,raw_score:calc.rawScore,
  display_score:calc.displayScore,
  category_breakdown:calc.categories.map(row=>({
   category:row.category,score:row.score,
  })),
 }));
 const signed={
  schema:FACTS_GRI_PROOF_SCHEMA,methodology_version:GRI_METHOD_VERSION,
  methodology_hash,input_hash,calculation_hash,
  fact_hash:source.factualRecordSha256,
  country_iso3:source.countryIso3,event_code:source.eventType,
  as_of:asOf,verified_score_0_100:calc.displayScore,
 };
 const {facts,rights,config}=fakeKeys();
 const bytes=Buffer.from(canonicalJson(signed));
 source.scoreProof={...signed,score_events,
  facts_signature_b64:sign(null,bytes,facts.privateKey).toString("base64"),
  rights_signature_b64:sign(null,bytes,rights.privateKey).toString("base64"),
 };
 return {source,config,calc};
};
test("verified independent Facts and Rights signatures bind recomputed GRI v1.2 and calculated proof hashes",()=>{
 const {source,config,calc}=signedFixture();
 assert.ok(calc.rawScore>0);
 assert.equal(verifyPinnedFactsOnlyGriV12Proof(source,config),true);
 const old=Object.fromEntries(Object.keys(config).map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,config);
  const result=resolveDerivedCommercialEligibility(source);
  assert.equal(result.allowMathematicalScore,true);
  assert.equal(result.commercialEligible,true);
  assert.equal(result.status,"DERIVED_FACTS_COMMERCIAL_CANDIDATE");
  assert.equal(result.paidDeliveryAuthorized,false);
  assert.equal(result.signedGroAuthorized,false);
 }finally{
  for(const [k,v] of Object.entries(old)){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
});
test("reject score tamper, missing proof, copied article text and unpinned authority",()=>{
 const {source,config}=signedFixture();
 for(const p of [
  {verified_score_0_100:99},
  {input_hash:"a".repeat(64)},
  {calculation_hash:"b".repeat(64)},
  {methodology_hash:"c".repeat(64)},
  {facts_signature_b64:"A".repeat(86)+"=="},
  {score_events:[{...source.scoreProof.score_events[0],source_title:"copyrighted headline"}]},
 ]){
  assert.equal(verifyPinnedFactsOnlyGriV12Proof({
    ...source,scoreProof:{...source.scoreProof,...p},
  },config),false);
 }
 for(const patch of [
  {sourceTermsAllowThisProcessing:false},
  {attributionRecorded:false},
  {sourceId:"some_other_news_source"},
  {independentEvidence:[{...source.independentEvidence[0],
    licenceOrPublicDomainVerified:false}]},
  {independentEvidence:[{...source.independentEvidence[0],
    thirdPartyMaterialExcluded:false}]},
 ]){
  assert.equal(verifyPinnedFactsOnlyGriV12Proof({...source,...patch},config),false);
 }
 assert.equal(verifyPinnedFactsOnlyGriV12Proof({...source,scoreProof:null},config),false);
 assert.equal(verifyPinnedFactsOnlyGriV12Proof(source,{
  ...config,GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:"f".repeat(64),
 }),false);
});

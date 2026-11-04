import {test} from "node:test";
import assert from "node:assert/strict";
import {advanceDerivedRiskGateReview,reviewDerivedRiskGateBatch}
  from "./official-original-issuer-rights.mjs";

const restrictedSignal={
  sourceId:"australia_industry_minister_original_rss_review",
  sourceAccessAuthorized:true,
  sourceTermsAllowThisProcessing:true,
  publisherExpressionReused:false,
  rawArticleTextStored:false,
  originalArticleRedistributed:false,
  attributionRecorded:true,
  countryIso3:"AUS",
  eventType:"MINERAL_EXPORT_RESTRICTION",
  factualRecordSha256:"a".repeat(64),
  rawArticleText:"NEVER_REDISPLAY_PUBLISHER_ARTICLE",
  publisherHeadline:"NEVER_REDISPLAY_PUBLISHER_HEADLINE",
};

test("noncommercial restricted signal holds for independent corroboration",()=>{
 const review=advanceDerivedRiskGateReview(restrictedSignal);
 assert.equal(review.status,"PENDING_CORROBORATION");
 assert.equal(review.next_action,
  "FETCH_AND_VERIFY_INDEPENDENT_PRIMARY_OR_LICENSED_EVIDENCE");
 assert.equal(review.original_source_signal_only,true);
 assert.equal(review.commercialEligible,false);
 assert.equal(review.candidate,null);
 assert.equal(review.paidDeliveryAuthorized,false);
 assert.equal(review.storeRawText,false);
 assert.equal(review.publishOriginalArticle,false);
 const json=JSON.stringify(review);
 assert.equal(json.includes("NEVER_REDISPLAY"),false);
});

test("source terms and independently fetched proof stay mandatory",()=>{
 const review=advanceDerivedRiskGateReview({
  ...restrictedSignal,sourceTermsAllowThisProcessing:false,
 });
 assert.equal(review.status,"HOLD_SOURCE_ACCESS_OR_EXPRESSION");
 assert.equal(review.commercialEligible,false);
 assert.equal(review.allowMathematicalScore,false);
 const g=advanceDerivedRiskGateReview({
  ...restrictedSignal,sourceId:"gdelt_project_event_metadata",
  independentEvidence:[{
   kind:"LICENSED_OPEN_DATASET",issuer:"GDELT Project",
   url:"https://www.gdeltproject.org/",contentSha256:"b".repeat(64),
   independentlyFetched:true,issuerVerified:true,sameEventVerified:true,
   factVerified:true,licenceOrPublicDomainVerified:true,
   thirdPartyMaterialExcluded:true,
  }],
  independentSameEventVerified:true,sourceNativeTimeVerified:true,
 });
 assert.equal(g.status,"PENDING_CORROBORATION");
 assert.equal(g.commercialEligible,false);
});

test("bounded review loop de-duplicates same verified event without emitting raw text",()=>{
 const batch=reviewDerivedRiskGateBatch([
  restrictedSignal,
  {...restrictedSignal,publisherHeadline:"SECOND_PUBLISHER_TEXT"},
  {...restrictedSignal,factualRecordSha256:"c".repeat(64)},
 ]);
 assert.equal(batch.status,"REVIEWED");
 assert.equal(batch.scanned,3);
 assert.equal(batch.deduplicated,1);
 assert.equal(batch.reviews.length,2);
 assert.equal(batch.candidates.length,0);
 assert.equal(JSON.stringify(batch).includes("PUBLISHER_TEXT"),false);
});

test("invalid batches hold and never open a commercial gate",()=>{
 for(const item of [null,{},new Array(501).fill(restrictedSignal)]){
  const batch=reviewDerivedRiskGateBatch(item);
  if(item===null||!Array.isArray(item)||item.length>500){
   assert.equal(batch.status,"BLOCKED_INVALID_BATCH");
   assert.equal(batch.candidates.length,0);
  }else{
   assert.equal(batch.scanned,0);
  }
 }
 const result=advanceDerivedRiskGateReview({rights:"NONCOMMERCIAL_REPRODUCTION_ONLY"});
 assert.equal(result.commercialEligible,false);
 assert.equal(result.candidate,null);
});

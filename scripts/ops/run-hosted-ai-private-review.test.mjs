import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {hostedAiPrivateReview,verifyHostedReviewEnv} from "./run-hosted-ai-private-review.mjs";
const hash=v=>createHash("sha256").update(v).digest("hex");
const sample={
 schema:"geomacro.private-ai-research-case.v1",domain:"geopolitics",country_iso3:"USA",
 claim:"An official agency reported a new administrative policy measure.",
 derived_summaries_transfer_approved:true,
 observations:[
  {original_article_sha256:"a".repeat(64),native_published_at:"2026-10-22T00:01:00Z",
   derived_fact_summary:"An official report states a policy was announced this morning."},
  {original_article_sha256:"b".repeat(64),native_published_at:"2026-10-22T00:02:00Z",
   derived_fact_summary:"Another source independently describes the same adopted decision."}
 ]
};
const bytes=Buffer.from(JSON.stringify(sample)),h=hash(bytes);
const env={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",AI_REVIEW_CASE_SHA256:h,
 AI_REVIEW_CASE_B2_KEY:"geomacro-evidence/v1/private/ai-review-case/"+h+".json",
 B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"ai_private_review_research",
 B2_REQUEST_BUDGET:"4",B2_KEY_ID:"test",B2_APPLICATION_KEY:"test",
 D1_DATABASE_ID:"test",CLOUDFLARE_ACCOUNT_ID:"test",
 CLOUDFLARE_API_TOKEN:"test",GEOMACRO_COMMERCE_LEDGER_TOKEN:"x".repeat(44),
 GEOMACRO_AI_REVIEW_DERIVED_ONLY_ACK:"YES_APPROVED_DERIVED_ONLY",
 GEOMACRO_AI_REVIEW_FREE_QUOTA_ACK:"YES_FREE_TIER_CONFIRMED"
};
function research(){
 return {schema:"geomacro.private-ai-assisted-research-verdict.v1",
  status:"AI_CONSENSUS_ON_SUPPLIED_DERIVED_SUMMARIES",
  canonical_gri_publisher_eligible:false,licensed_paid_output_allowed:false,
  independent_external_reviewer_attested:false,x402_authorized:false,
  current_b2_d1_hot_published:false};
}
test("hosted AI file-pinned B2 roundtrip remains research only",async()=>{
 let writes=0,reads=0,lookups=0;
 const objectStore=new Map([[env.AI_REVIEW_CASE_B2_KEY,bytes]]);
 const rr=await hostedAiPrivateReview({
  env,now:()=>new Date("2026-10-22T00:20:00Z"),
  archiveClient:()=>({
   get:async k=>{reads++;return objectStore.get(k)},
   getOptional:async k=>{lookups++;return objectStore.get(k)},
   put:async(k,b)=>{writes++;objectStore.set(k,Buffer.from(b))}
  }),
  reviewer:async ({input})=>{
   assert.deepEqual(input,sample);return research();
  }
 });
 assert.equal(rr.private_research_proof_verified,true);
 assert.equal(rr.independently_signed_gri,false);
 assert.equal(rr.licensed_commercial_delivery,false);
 assert.equal(rr.b2_writes,1);
 assert.equal(reads,2);assert.equal(lookups,1);assert.equal(writes,1);
 assert.equal(JSON.stringify(rr).includes(sample.claim),false);
 assert.equal(JSON.stringify(rr).includes(h),false);
});
test("no protected cloud credentials or owner acknowledgement: deny before B2",async()=>{
 const bad=[
  {B2_KEY_ID:""},{GITHUB_REF:"refs/heads/test"},{GITHUB_ACTIONS:"false"},
  {AI_REVIEW_CASE_SHA256:"f".repeat(64)},{B2_REQUEST_BUDGET:"5"},
  {B2_ACCOUNT_QUOTA_WORKFLOW_ID:"merchant_paid"},
  {CLOUDFLARE_API_TOKEN:""},{GEOMACRO_AI_REVIEW_FREE_QUOTA_ACK:""},
  {GEOMACRO_AI_REVIEW_DERIVED_ONLY_ACK:""},{SUPABASE_DB_URL:"secret"},
  {COINBASE_API_KEY:"secret"}
 ];
 for(const e of bad){
  const incorrect={...env,...e};
  assert.throws(()=>verifyHostedReviewEnv(incorrect),
   /GEOMACRO_PRIVATE_HOSTED_AI_REVIEW_FAILED_CLOSED/);
  await assert.rejects(hostedAiPrivateReview({
   env:incorrect,archiveClient:()=>{throw Error("B2_CALLED");}
  }),/GEOMACRO_PRIVATE_HOSTED_AI_REVIEW_FAILED_CLOSED/);
 }
});
test("cannot upgrade AI verdict to external reviewer, paid or live signed product",async()=>{
 const conditions=[
  {canonical_gri_publisher_eligible:true},
  {licensed_paid_output_allowed:true},
  {independent_external_reviewer_attested:true},
  {x402_authorized:true},{current_b2_d1_hot_published:true}
 ];
 for(const bad of conditions){
  await assert.rejects(hostedAiPrivateReview({
   env,archiveClient:()=>({get:async()=>bytes}),
   reviewer:async()=>({...research(),...bad})
  }),/GEOMACRO_PRIVATE_HOSTED_AI_REVIEW_FAILED_CLOSED/);
 }
});
test("tampered input is denied before any model invocation",async()=>{
 let modelCalls=0;
 await assert.rejects(hostedAiPrivateReview({
  env,archiveClient:()=>({get:async()=>Buffer.from('{"fake":true}'.repeat(20))}),
  reviewer:async()=>{modelCalls++;return research()}
 }),/GEOMACRO_PRIVATE_HOSTED_AI_REVIEW_FAILED_CLOSED/);
 assert.equal(modelCalls,0);
});

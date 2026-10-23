import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {legacyAutoGriInputPointer,legacyAutoGriProtectedContext,
 calculateResearchOnlyGriFromExactBytes,runLegacyAutoGriResearch}
 from "./gri-legacy-auto-recompute.mjs";
const now=new Date("2026-10-24T00:00:00.000Z");
const sha=x=>createHash("sha256").update(x).digest("hex");
const base={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:"a".repeat(40),
 GEOMACRO_GRI_AUTO_ENROLLED:"YES_CONSENT_ONLY",
 GEOMACRO_GRI_AUTO_REVOKED:"NO",
 B2_ACCOUNT_QUOTA_REQUIRED:"1",
 B2_ACCOUNT_QUOTA_WORKFLOW_ID:"gri_legacy_recompute",
 B2_REQUEST_BUDGET:"3",
};
const mins=n=>new Date(now.getTime()-n*60000).toISOString();
const admission=()=>({
 schema:"geomacro.gri-v12-private-offline-admission.v1",
 as_of:now.toISOString(),private_only:true,
 commercial_eligible:false,public_published:false,
 rights_verification_pending:true,independent_corroboration_pending:true,
 events:["geopolitics","macro","rare_earth"].map((category,i)=>{
  const host=["geo.test.example","macro.test.example","mineral.test.example"][i];
  return {
   id:category+"-1",category,severity:50+i*10,confidence:80,
   created_at:mins(12),published_at:mins(18),
   source_name:"Official source",source_domain:host,
   source_url:"https://"+host+"/news/1",
   source_title:"Official publisher has reported a genuine event",
   summary:"Internal derived story, no independently reviewed commerce asserted.",
   classification_provider:"groq",classification_model:"model-v1",
   classification_version:"event-severity-v1.0.5",
   classification_prompt_version:"risk-desk-filter-v1.0.5",
   classification_scored_at:mins(10),
   classification_input_hash:"a".repeat(64),
   story_cluster_id:"independent-story-"+category,
   story_canonical_label:"Publisher story fixture",
   story_assignment_decision:"anchor",story_match_confidence:99,
   story_decision_rationale:"Same event publication with conservative review",
   story_clustering_provider:"test-provider",
   story_clustering_model:"test-model",
   story_clustering_version:"story-correlation-v1.0.0",
   story_clustering_prompt_version:"story-match-title-v1.0.0",
   story_clustering_scored_at:mins(8),
   story_clustering_input_hash:"b".repeat(64)
  };
 })
});
test("old automatic news cadence runs NO B2 requests if there is no scored input",async()=>{
 let reads=0;
 const result=await runLegacyAutoGriResearch({
  env:base,now,
  resolveQuotaDatabase:async()=>{reads++;throw Error("D1_INVALID");},
  b2Factory:()=>{reads++;throw Error("B2_INVALID");}
 });
 assert.equal(result.status,"NO_CURRENT_THREE_DOMAIN_CANONICAL_SCORED_INPUT");
 assert.equal(result.score_computed,false);
 assert.equal(result.payments,0);
 assert.equal(reads,0);
});
test("one-time standing consent is required, old identity never reused after revocation",async()=>{
 const r=await runLegacyAutoGriResearch({env:{...base,GEOMACRO_GRI_AUTO_REVOKED:"YES"},now});
 assert.equal(r.status,"TWO_PERSON_STANDING_AUTOMATION_CONSENT_NOT_ACTIVE");
 for(const mutation of [
  {GITHUB_REF:"refs/pull/1/merge"},{GITHUB_ACTIONS:"false"},
  {GITHUB_REPOSITORY:"fork/geomacro"},
  {B2_ACCOUNT_QUOTA_REQUIRED:"0"},
  {B2_REQUEST_BUDGET:"500"},
  {SUPABASE_URL:"https://bad.invalid"},
  {COINBASE_X402_MAINNET_ACK:"YES"}
 ]){
  assert.throws(()=>legacyAutoGriProtectedContext({...base,...mutation}),
   /GRI_LEGACY_AUTO_RECOMPUTE_PROTECTED_CONSENTED_NO_FUNDS_MAIN_REQUIRED/);
 }
});
test("no forged numeric or publisher source from changed pin or unscored free news",()=>{
 assert.equal(legacyAutoGriInputPointer(base),null);
 const s=sha(Buffer.from("real scored bytes"));
 const key="geomacro-evidence/v1/private/gri-auto-canonical-input/"+s+".json";
 assert.deepEqual(legacyAutoGriInputPointer({
  ...base,GEOMACRO_GRI_AUTO_SCORED_INPUT_SHA256:s,
  GEOMACRO_GRI_AUTO_SCORED_INPUT_B2_KEY:key
 }),{pin:s,key});
 for(const e of [
  {GEOMACRO_GRI_AUTO_SCORED_INPUT_SHA256:s},
  {GEOMACRO_GRI_AUTO_SCORED_INPUT_B2_KEY:key},
  {GEOMACRO_GRI_AUTO_SCORED_INPUT_SHA256:"f".repeat(64),
   GEOMACRO_GRI_AUTO_SCORED_INPUT_B2_KEY:key}
 ])
  assert.throws(()=>legacyAutoGriInputPointer(e),/EXACT_PRIVATE_SCORED_INPUT_PIN_REQUIRED/);
 assert.throws(()=>calculateResearchOnlyGriFromExactBytes({
  bytes:Buffer.from('{"schema":"geomacro.website-derived-news-feed.v1"}'),
  expectedSha256:sha(Buffer.from('{"schema":"geomacro.website-derived-news-feed.v1"}')),
  now
 }),/EXACT_CANONICAL_INPUT_BYTES_REQUIRED/);
});
test("full three-domain real canonical calculation works in research-only mode",async()=>{
 const raw=Buffer.from(JSON.stringify(admission()));
 const pin=sha(raw),key="geomacro-evidence/v1/private/gri-auto-canonical-input/"+pin+".json";
 const checked=calculateResearchOnlyGriFromExactBytes({
  bytes:raw,expectedSha256:pin,now
 });
 assert.equal(checked.status,"CANONICAL_V12_PRIVATE_RESEARCH_SCORE_COMPUTED_NOT_SIGNED");
 assert.equal(checked.three_domain_coverage,1);
 assert.deepEqual(checked.category_event_counts,{geopolitics:1,macro:1,rare_earth:1});
 assert.equal(Number.isInteger(checked.private_research_score),true);
 assert.equal(checked.public_current_gri,false);
 assert.equal(checked.commercially_published,false);
 const env={...base,GEOMACRO_GRI_AUTO_SCORED_INPUT_SHA256:pin,
  GEOMACRO_GRI_AUTO_SCORED_INPUT_B2_KEY:key};
 let b2Calls=0;
 const safe=await runLegacyAutoGriResearch({env,now,
  resolveQuotaDatabase:async()=> "b".repeat(8)+"-"+["a".repeat(4),"c".repeat(4),"d".repeat(4),"e".repeat(12)].join("-"),
  b2Factory:()=>({get:async k=>{b2Calls++;assert.equal(k,key);return raw;}})
 });
 assert.equal(b2Calls,1);
 assert.equal(safe.status,"CANONICAL_V12_PRIVATE_RESEARCH_SCORE_COMPUTED_NOT_SIGNED");
 assert.equal("private_research_score" in safe,false);
 assert.equal(JSON.stringify(safe).includes("geo.test.example"),false);
 assert.equal(safe.research_score_not_published,true);
 assert.equal(safe.payments,0);
});
test("missing original publication, invalid rights flags and corrupt immutable bytes refuse",()=>{
 const a=admission(),raw=Buffer.from(JSON.stringify(a));
 assert.throws(()=>calculateResearchOnlyGriFromExactBytes({
  bytes:raw,expectedSha256:"f".repeat(64),now
 }),/EXACT_CANONICAL_INPUT_BYTES_REQUIRED/);
 for(const mutation of [
  x=>x.events[0].published_at=mins(150),
  x=>x.events[0].severity=null,
  x=>x.events[1].classification_version="unscored",
  x=>x.commercial_eligible=true,
 ]){
  const v=admission();mutation(v);const bytes=Buffer.from(JSON.stringify(v));
  assert.throws(()=>calculateResearchOnlyGriFromExactBytes({
   bytes,expectedSha256:sha(bytes),now
  }));
 }
});

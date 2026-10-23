import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildCompleteIntelligenceGriReview}
 from "./complete-intelligence-gri-review.mjs";
const registry=readFileSync(new URL("../../src/lib/canonical-country-registry-195.ts",
 import.meta.url),"utf8");
const now=Date.parse("2026-10-24T01:00:00.000Z");
const modes=["geopolitics","macro","rare_earth"];
const kind={geopolitics:"security",macro:"monetary policy",rare_earth:"production"};
const signal=(c,i,overrides={})=>({
 id:c+"-"+i.toString(16).padStart(8,"0"),category:c,
 status:"official_release_observed_unscored",
 published_at:new Date(now-i*40_000).toISOString(),
 date_precision:"exact",development_type:kind[c],
 geography:"India",observed_release_count:1,
 severity:null,same_event_corrob_verified:false,
 title:"Secret upstream original headline must never leave journal",
 original_article_body:"Private article text",
 original_article_url:"https://secret.example.com/not-in-review",
 ...overrides
});
test("200 genuine material review hints in each domain traverse 600-row journal, no first-25 loss",()=>{
 const all=modes.flatMap(c=>Array.from({length:200},(_,i)=>signal(c,i)));
 const r=buildCompleteIntelligenceGriReview({signals:all,registrySource:registry,now});
 assert.equal(r.source_journal_rows_examined,600);
 assert.equal(r.source_journal_rows_triaged,600);
 assert.equal(r.review_batches,8);
 assert.deepEqual(r.category_material_review_counts,
  {geopolitics:200,macro:200,rare_earth:200});
 assert.deepEqual(r.category_journal_counts,
  {geopolitics:200,macro:200,rare_earth:200});
 assert.equal(r.independent_numerical_gri_review_completed,false);
 assert.equal(r.customer_chargeable,false);
 assert.equal(r.country_certificates_issued,false);
 assert.equal(r.payments,0);
 const txt=JSON.stringify(r);
 for(const secret of ["secret.example.com","Secret upstream","Private article text"])
  assert.equal(txt.includes(secret),false);
 const candidates=r.batches.flatMap(x=>x.categories.flatMap(c=>c.review_targets));
 assert.equal(new Set(candidates.map(x=>x.derived_event_id)).size,600);
 assert.equal(candidates.every(c=>c.gri_score===null&&
   c.can_promote_from_worklist===false),true);
});
test("nonmaterial newsroom stories remain counted as context but do not become fabricated GRI scores",()=>{
 const xs=[
  signal("geopolitics",0,{development_type:"official update"}),
  signal("macro",0),signal("rare_earth",0,
    {status:"official_feed_candidate_unscored"})];
 const r=buildCompleteIntelligenceGriReview({signals:xs,registrySource:registry,now});
 assert.equal(r.source_journal_rows_examined,3);
 assert.equal(r.total_material_review_candidates,1);
 assert.deepEqual(r.category_nonmaterial_context_counts,
  {geopolitics:1,macro:0,rare_earth:1});
 assert.equal(r.source_specific_rights_requirements_preserved,true);
});
test("empty 72h D1 journal stays empty with zero B2/D1/source calls",()=>{
 const r=buildCompleteIntelligenceGriReview({signals:[],registrySource:registry,now});
 assert.equal(r.review_batches,0);
 assert.equal(r.total_material_review_candidates,0);
 assert.equal(r.signed_hot_3_of_3_verified,false);
});
test("duplicate IDs, fake categories or 601 signals must fail closed",()=>{
 const item=signal("macro",0);
 for(const entries of [[item,item],[{...item,category:"illegal"}],
   Array.from({length:601},(_,i)=>signal("macro",i))]){
  assert.throws(()=>buildCompleteIntelligenceGriReview({
   signals:entries,registrySource:registry,now
  }),/COMPLETE_INTELLIGENCE_GRI_REVIEW_INVALID/);
 }
});

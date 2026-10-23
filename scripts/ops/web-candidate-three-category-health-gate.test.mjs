import test from "node:test";
import assert from "node:assert/strict";
import {inspectWebCandidateThreeCategoryHealth as verify,WEB_CANDIDATE_CATEGORIES as CAT} from "./web-candidate-three-category-health-gate.mjs";
const now=Date.parse("2026-10-23T10:00:00Z");
const full=()=>({
 schema:"geomacro.product-scoped-deep-health.v1",ok:true,
 checked_at:"2026-10-23T10:00:00.000Z",
 legacy_signed_intelligence_gri_risk_indices:"NOT_EVALUATED_IN_THIS_PROFILE",
 x402_payment_authorized:false,fresh_signed_snapshot_readiness_attested:false,
 all_195_countries_fresh_news_verified:false,source_readiness_verified:true,
 categories:Object.fromEntries(CAT.map(name=>[name,{
  status:"SOURCE_OBSERVATIONS_AVAILABLE",source_fetch_accepted:true,
  eligible_observations:2,signed_gro_required:false,
 }])),
});
test("real reviewed three-domain sources allow a read-only candidate, not paid GRO",()=>{
 const result=verify(200,full(),{now});
 assert.equal(result.ready,true);
 assert.equal(result.categories["macro-fx"].accepted,true);
 assert.equal(result.current_signed_hot_products_verified,false);
 assert.equal(result.x402_payment_authorized,false);
});
test("one missing mineral provider remains failed and identifies only the category",()=>{
 const b=full();b.categories["critical-minerals"].source_fetch_accepted=false;
 b.categories["critical-minerals"].status="NO_ELIGIBLE_LIVE_SOURCE_OBSERVATIONS";
 b.categories["critical-minerals"].eligible_observations=0;b.ok=false;
 b.source_readiness_verified=false;
 const report=verify(503,b,{now});
 assert.equal(report.ready,false);
 assert.equal(report.categories["critical-minerals"].gate,
   "SOURCE_FETCH_OR_REVIEWED_OBSERVATIONS_UNAVAILABLE");
 assert.equal(report.categories.geopolitics.accepted,true);
 assert.ok(!JSON.stringify(report).includes("sciencebase"));
});
test("false HTTP 200 with unavailable category never passes",()=>{
 const b=full();b.categories["geopolitics"].source_fetch_accepted=false;
 assert.equal(verify(200,b,{now}).ready,false);
});
test("stale and missing schema cannot become healthy",()=>{
 const b=full();b.checked_at="2026-10-22T10:00:00.000Z";
 assert.equal(verify(200,b,{now}).ready,false);
 const c=full();c.schema="fake";
 assert.equal(verify(200,c,{now}).categories.geopolitics.accepted,false);
});
test("source material, injected credential strings and arbitrary provider names are not emitted",()=>{
 const b=full();b.categories["macro-fx"]={
  ...b.categories["macro-fx"],article_url:"https://private.example",
  api_key:"sensitive",provider_name:"secret provider",
 };
 const s=JSON.stringify(verify(200,b,{now}));
 assert.equal(s.includes("private.example"),false);
 assert.equal(s.includes("sensitive"),false);
 assert.equal(s.includes("secret provider"),false);
});
test("signed or paid scope and future clocks fail closed",()=>{
 for(const change of [
  {x402_payment_authorized:true},
  {fresh_signed_snapshot_readiness_attested:true},
  {all_195_countries_fresh_news_verified:true},
  {checked_at:"2026-10-23T10:07:00Z"},
 ]){
  assert.equal(verify(200,{...full(),...change},{now}).ready,false);
 }
});

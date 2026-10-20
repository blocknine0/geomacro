import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyMinimumFreeProduction} from "./verify-minimum-free-production-health.mjs";

const now=Date.parse("2026-10-21T00:00:00.000Z");
const sha="a".repeat(40);
const goodStory=()=>({
  id:"geopolitics-12345678",category:"geopolitics",
  date_precision:"exact",published_at:"2026-10-20T22:00:00.000Z",
  title:"Geomacro finds a meaningful official geopolitical release",
  severity:null,same_event_corrob_verified:false,
  status:"official_release_observed_unscored",
});
function fixture(stories=[goodStory()]){
  return {journalStatus:200,journal:{
    ok:true,schema:"geomacro.website-derived-news-feed.v1",
    original_release_delay_minutes:15,retention_hours:72,retention_days:3,
    delivery_scope:"free_website_only",signals:stories,
  },siteStatus:200,siteHtml:"<html>What changed in the world GEOMACRO FINDS "+
    stories.map(x=>x.title).join(" ")+"</html>",
  buildStatus:200,build:{schema_version:"geomacro.deployment-build.v1",
    canonical_repository:"blocknine0/geomacro",production_activation_performed:false,
    canonical_main_sha:sha},expectedSha:sha,nowMs:now};
}
test("minimum free site accepts ONE native-dated official story, never claims all 3 or paid signed state",()=>{
  const r=classifyMinimumFreeProduction(fixture());
  assert.equal(r.ok,true);
  assert.equal(r.derived_rows,1);
  assert.deepEqual(r.categories,{geopolitics:1,macro:0,rare_earth:0});
  assert.equal(r.all_three_categories_have_recent_originals,false);
  assert.equal(r.legacy_signed_hot_products_verified,false);
  assert.equal(r.current_numerical_gri_verified,false);
  assert.equal(r.paid_delivery_authorized,false);
  assert.deepEqual([r.b2_requests,r.supabase_requests,r.payments],[0,0,0]);
});
test("all three categories can be observed but without manufacturing a score",()=>{
  const stories=[goodStory(),
    {...goodStory(),id:"macro-12345678",category:"macro",
      title:"Geomacro finds a meaningful official monetary policy release"},
    {...goodStory(),id:"rare_earth-12345678",category:"rare_earth",
      title:"Geomacro finds a meaningful official mineral sector release"}];
  const r=classifyMinimumFreeProduction(fixture(stories));
  assert.equal(r.ok,true);
  assert.equal(r.all_three_categories_have_recent_originals,true);
  assert.equal(r.legacy_signed_hot_products_verified,false);
});
test("rejects expired, too fresh and future first-party event timestamps",()=>{
  for(const stamp of ["2026-10-17T12:00:00.000Z","2026-10-20T23:50:00.000Z",
    "2026-10-21T01:00:00.000Z"]){
    const r=classifyMinimumFreeProduction(fixture([{...goodStory(),published_at:stamp}]));
    assert.equal(r.ok,false,stamp);
  }
});
test("strict conservative publication for day-precision records",()=>{
  const story={...goodStory(),date_precision:"day",published_at:"2026-10-19"};
  assert.equal(classifyMinimumFreeProduction(fixture([story])).ok,true);
  assert.equal(classifyMinimumFreeProduction(fixture([{
    ...story,published_at:"2026-10-20",
  }])).ok,false);
});
test("never accepts bogus score, rightsholder URLs, or missing SSR",()=>{
  for(const field of [
    {severity:21},{same_event_corrob_verified:true},
    {status:"verified_b2"}, {title:"https://example.org/raw"},
    {upstream_url:"https://example.org/article"}]){
    const r=classifyMinimumFreeProduction(fixture([{...goodStory(),...field}]));
    assert.equal(r.ok,false,JSON.stringify(field));
  }
  const f=fixture();
  f.siteHtml="<html>GEOMACRO FINDS What changed in the world</html>";
  assert.equal(classifyMinimumFreeProduction(f).ok,false);
});
test("a wrong build SHA, unavailable D1, or quiet 72h journal cannot be green",()=>{
  for(const bad of [{build:{...fixture().build,canonical_main_sha:"b".repeat(40)}},
    {journalStatus:503},{journal:{...fixture().journal,signals:[]}}]){
    assert.equal(classifyMinimumFreeProduction({...fixture(),...bad}).ok,false);
  }
  assert.equal(classifyMinimumFreeProduction({...fixture(),expectedSha:"bad"}).ok,false);
});

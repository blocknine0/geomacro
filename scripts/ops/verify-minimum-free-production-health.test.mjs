import {test} from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {classifyMinimumFreeProduction,classifyPublishedSourceEquivalence,verifyPublishedSourceEquivalence} from "./verify-minimum-free-production-health.mjs";

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
    checked_at:"2026-10-20T23:00:00.000Z",
    original_release_delay_minutes:0,retention_hours:72,retention_days:3,
    delivery_scope:"free_website_only",scored:false,chargeable:false,
    supabase_dependency:false,signals:stories,
  },siteStatus:200,siteHtml:"<html>What changed in the world GEOMACRO FINDS "+
    stories.map(x=>x.title).join(" ")+"</html>",
  buildStatus:200,build:{schema_version:"geomacro.deployment-build.v1",
    canonical_repository:"blocknine0/geomacro",production_activation_performed:false,
    canonical_main_sha:sha},expectedSha:sha,nowMs:now};
}
test("free read path uses the permanent static archive and makes no D1 journal request",()=>{
 const source=readFileSync(new URL("./verify-minimum-free-production-health.mjs",import.meta.url),"utf8");
 assert.match(source,/https:\/\/geomacro-public-finds-archive\.daspallab202391\.workers\.dev\/latest\.json/u);
 assert.doesNotMatch(source,/geomacro-control-plane\.daspallab202391\.workers\.dev\/v1\/public\/website-derived-news-immediate/u);
});
test("minimum free site accepts ONE native-dated official story, never claims all 3 or paid signed state",()=>{
  const r=classifyMinimumFreeProduction(fixture());
  assert.equal(r.ok,true);
  assert.equal(r.derived_rows,1);
  assert.deepEqual(r.categories,{geopolitics:1,macro:0,rare_earth:0});
  assert.equal(r.all_three_categories_have_recent_originals,false);
  assert.equal(r.legacy_signed_hot_products_verified,false);
  assert.equal(r.current_numerical_gri_verified,false);
  assert.equal(r.paid_delivery_authorized,false);
  assert.deepEqual([r.d1_requests,r.b2_requests,r.supabase_requests,r.payments],[0,0,0,0]);
});
test("unverified OSINT can coexist in the archive but never counts as official-source proof",()=>{
 const official=goodStory();
 const osint={...goodStory(),id:"macro-acde1234",category:"macro",
   title:"Geomacro finds an observed feed item that is explicitly unverified",
   status:"osint_feed_observed_unverified",date_precision:"exact",
   development_type:"unverified OSINT feed observation",geography:null,
   sources_credited:["Monitored feed: example.net"]};
 const r=classifyMinimumFreeProduction(fixture([official,osint]));
 assert.equal(r.ok,true);
 assert.equal(r.derived_rows,1);
 assert.deepEqual(r.categories,{geopolitics:1,macro:0,rare_earth:0});
 // www feed-host attribution is allowed; it is not an article URL or a verification claim.
 const wwwCredit={...osint,sources_credited:["Monitored feed: www.bankofcanada.ca"]};
 const accepted=classifyMinimumFreeProduction(fixture([official,wwwCredit]));
 assert.equal(accepted.ok,true);
 assert.equal(accepted.derived_rows,1);
 assert.deepEqual(accepted.categories,{geopolitics:1,macro:0,rare_earth:0});
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
test("rejects expired, invalid and future first-party event timestamps",()=>{
  for(const stamp of ["2026-10-17T12:00:00.000Z","invalid",
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

test("real published older source is equivalent only for a trusted exact-head ops-only GitHub compare",()=>{
 const site="a".repeat(40),main="b".repeat(40);
 const files=[
  {filename:".github/workflows/website-derived-news-continuity.yml",status:"modified"},
  {filename:"docs/ops/source-recovery.md",status:"added"},
  {filename:"scripts/ops/verify-public-intelligence-browser-freshness.mjs",status:"modified"},
  {filename:"scripts/tests/public-intelligence-browser-freshness.test.mjs",status:"modified"},
  {filename:"src/__tests__/five-minute-original-news-fastlane.test.ts",status:"modified"},
  // Tests do not change published behavior; a server route module does.
  {filename:"src/lib/free-derived-deep-health.server.test.ts",status:"modified"},
 ];
 const compare={status:"ahead",base_commit:{sha:site},
   merge_base_commit:{sha:site},ahead_by:3,behind_by:0,total_commits:3,
   commits:[{sha:"c".repeat(40)},{sha:"d".repeat(40)},{sha:main}],files};
 assert.equal(classifyPublishedSourceEquivalence(compare,site,main),true);
 // A server-only module still changes the live API route and requires publish.
 assert.equal(classifyPublishedSourceEquivalence({...compare,files:[...files,
   {filename:"src/lib/free-derived-deep-health.server.ts",status:"modified"}]},site,main),false);
 const publicResult=classifyMinimumFreeProduction({
  ...fixture(),expectedSha:main,
  websiteSourceEquivalent:classifyPublishedSourceEquivalence(compare,site,main),
 });
 assert.equal(publicResult.ok,true);
 assert.equal(publicResult.website_parity_mode,"VERIFIED_NO_WEBSITE_SOURCE_CHANGES");
 assert.equal(publicResult.paid_delivery_authorized,false);
 assert.equal(publicResult.legacy_signed_hot_products_verified,false);
 for(const filename of ["src/routes/intelligence.tsx","public/index.html","src/lib/free-derived-runtime.ts","src/lib/free-derived-deep-health.server.ts",
    "workers/control-plane/src/index.mjs","lib/risk.js",
    "scripts/lib/global-official-release-feeds.mjs","src/__tests__/runtime.ts",
    "src/__tests__/../../routes/intelligence.test.ts","package-lock.json",
    "vite.config.ts",".github/workflows/../unsafe.yml"]){
    const bad={...compare,files:[...files,{filename,status:"modified"}]};
    assert.equal(classifyPublishedSourceEquivalence(bad,site,main),false,filename);
 }
 for(const bad of [{...compare,status:"diverged"},
  {...compare,behind_by:1},{...compare,base_commit:{sha:main}},
  {...compare,total_commits:900},{...compare,commits:[]},
  {...compare,files:[]},{...compare,files:Array(300).fill(files[0])}]){
   assert.equal(classifyPublishedSourceEquivalence(bad,site,main),false);
 }
 assert.equal(classifyMinimumFreeProduction({
   ...fixture(),expectedSha:main,websiteSourceEquivalent:false,
 }).ok,false);
});
test("network-bounded GitHub comparison refuses invalid, unavailable and noncanonical attestation",async()=>{
 const site="a".repeat(40),main="b".repeat(40);
 const cmp={status:"ahead",base_commit:{sha:site},merge_base_commit:{sha:site},
   ahead_by:1,behind_by:0,total_commits:1,commits:[{sha:main}],
   files:[{filename:"docs/ops/approved.md",status:"modified"}]};
 let calls=0;
 const trusted=async (url,options)=>{
   calls++;
   assert.ok(url.includes("/compare/"+site+"..."+main));
   assert.equal(options.redirect,"error");
   return new Response(JSON.stringify(cmp),{status:200});
 };
 assert.equal(await verifyPublishedSourceEquivalence(site,main,{fetcher:trusted}),true);
 assert.equal(calls,1);
 assert.equal(await verifyPublishedSourceEquivalence(site,site,{fetcher:trusted}),false);
 assert.equal(calls,1);
 assert.equal(await verifyPublishedSourceEquivalence(site,main,{
   fetcher:async()=>new Response("unauthorized",{status:403}),
 }),false);
 assert.equal(await verifyPublishedSourceEquivalence(site,main,{
   fetcher:async()=>{throw Error("network");},
 }),false);
});

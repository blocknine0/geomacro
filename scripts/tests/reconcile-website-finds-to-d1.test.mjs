import test from "node:test";
import assert from "node:assert/strict";
import {reconcileWebsiteFindsToCanonicalD1}
 from "../ops/reconcile-website-finds-to-d1.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {isPermanentArchiveSignal}
 from "../ops/publish-permanent-derived-news-archive.mjs";

const NOW=new Date("2026-10-29T01:40:00.000Z");
const AT=NOW.toISOString();
const story={
 id:"macro-12345678",category:"macro",
 title:"Geomacro finds central bank issued a new monetary policy decision",
 what_changed:"The central bank issued a dated policy announcement about monetary conditions.",
 why_it_matters:"The decision can alter macroeconomic expectations and currency outlooks, without establishing a verified price impact.",
 topic:"monetary policy",geography:null,development_type:"policy update",
 published_at:"2026-10-29T01:20:00.000Z",date_precision:"exact",
 observed_release_count:1,sources_credited:[],
 status:"official_release_observed_unscored",
 same_event_corrob_verified:false,severity:null,
};
const health={ok:true,store:"d1",schema_version:33,
 derived_news_topic_policy_revision:3,deployed_source_sha:"a".repeat(40)};
const latest=(signals=[story],checkedAt=AT)=>({
 ok:true,schema:"geomacro.website-derived-news-feed.v1",
 checked_at:checkedAt,original_release_delay_minutes:0,
 retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
 scored:false,chargeable:false,supabase_dependency:false,signals,
});
const journal=(signals=[])=>({
 ok:true,schema:"geomacro.website-derived-news-bundle.v1",
 checked_at:AT,original_release_delay_minutes:0,
 retention_days:3,retention_hours:72,
 delivery_scope:"free_website_only",complete:true,item_cap:600,
 returned_rows:signals.length,signals,
});
const URLS={
 health:"/health",latest:"/latest.json",
 bundle:"/v1/public/website-derived-news-bundle",
 write:"/v1/website-derived-news",
};
function fake({existing=[],website=[story],failCanonical=false,
 snapshotCheckedAt=AT,transientGetPath=null,uncertainPut=false}={}){
 const requests=[],inserted=[],attempts=new Map();
 const fetchImpl=async (input,opts={})=>{
  const url=String(input),path=new URL(url).pathname;
  const method=opts.method??"GET";
  requests.push({path,method,authorization:opts.headers?.Authorization});
  attempts.set(path,(attempts.get(path)??0)+1);
  if(transientGetPath===path&&method==="GET"&&attempts.get(path)===1)
   throw Error("ONE_TIME_EDGE_TRANSPORT_LOSS");
  if(path===URLS.health)return Response.json(health);
  if(path===URLS.latest)return Response.json(latest(website,snapshotCheckedAt));
  if(path===URLS.bundle){
   if(failCanonical)return Response.json({error:"D1_FREE_QUOTA_EXCEEDED"},{status:503});
   return Response.json(journal([...existing,...inserted]));
  }
  if(path===URLS.write){
   const data=JSON.parse(opts.body);
   assert.equal(data.schema,"geomacro.website-derived-news-batch.v1");
   assert.ok(data.signals.length>0&&data.signals.length<=40);
   for(const s of data.signals)inserted.push(s);
   if(uncertainPut)throw Error("AMBIGUOUS_AFTER_WRITE_CONNECTION_DROPPED");
   return Response.json({ok:true,
    schema:"geomacro.website-derived-news-write-receipt.v1",
    accepted:data.signals.length});
  }
  throw Error("UNKNOWN_ENDPOINT");
 };
 return {fetchImpl,requests,inserted,attempts};
}
test("existing public Finds are canonical-eligible before any write",()=>{
 assert.equal(verifyDerivedStory(story,NOW.getTime()),true);
 assert.equal(isPermanentArchiveSignal(story,NOW.getTime(),
  {allowHistorical:false}),true);
});
test("from Oct 29, missing website items are replayed once through EXISTING GeoMacro owner route",async()=>{
 const f=fake();
 const receipt=await reconcileWebsiteFindsToCanonicalD1({
  fetchImpl:f.fetchImpl,now:NOW,
  env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:"safe-secret-".repeat(5)}
 });
 assert.deepEqual(f.requests.map(x=>x.path),[
  URLS.health,URLS.latest,URLS.bundle,URLS.write,URLS.bundle,
 ]);
 assert.equal(f.requests[3].method,"PUT");
 assert.match(f.requests[3].authorization,/^Bearer [a-f0-9]{64}$/);
 assert.deepEqual(f.inserted,[story]);
 assert.equal(receipt.inserted,1);
 assert.equal(receipt.exact_d1_readback_verified,true);
 assert.equal(receipt.predge_authenticated_readback_verified,false,
  "never greenwash independent protected research delivery");
 assert.deepEqual(receipt.recovered_category_counts,
  {geopolitics:0,macro:1,rare_earth:0});
 assert.equal(receipt.source_fetches,0);
 assert.equal(receipt.payments,0);
});
test("already mirrored items cost zero D1 writes and do not demand owner token",async()=>{
 const f=fake({existing:[story]});
 const result=await reconcileWebsiteFindsToCanonicalD1({
  fetchImpl:f.fetchImpl,now:NOW,env:{}
 });
 assert.equal(result.inserted,0);
 assert.equal(result.same_canonical_derived_ids_verified,true);
 assert.equal(f.requests.some(x=>x.method==="PUT"),false);
});
test("quota outage never fabricates success or writes a card",async()=>{
 const f=fake({failCanonical:true});
 await assert.rejects(reconcileWebsiteFindsToCanonicalD1({
  fetchImpl:f.fetchImpl,now:NOW,
 }),/WEBSITE_D1_RECONCILE_READ_UNAVAILABLE/);
 assert.equal(f.requests.some(x=>x.method==="PUT"),false);
});
test("invalid/stale/duplicate or conflicting website cards fail closed without writes",async()=>{
 for(const website of [
  [{...story,source_url:"https://secret.example"}],
  [{...story,id:"macro-00000001"}, {...story,id:"macro-00000001"}],
  [{...story,published_at:"2025-10-01T01:20:00.000Z"}],
 ]){
  const f=fake({website});
  await assert.rejects(reconcileWebsiteFindsToCanonicalD1({
   fetchImpl:f.fetchImpl,now:NOW,
  }),/WEBSITE_D1_RECONCILE_/);
  assert.equal(f.requests.some(x=>x.method==="PUT"),false);
 }
 const f=fake({existing:[{...story,what_changed:"A different, yet plausible, earlier derived description of the release."}]});
 await assert.rejects(reconcileWebsiteFindsToCanonicalD1({
  fetchImpl:f.fetchImpl,now:NOW,
 }),/WEBSITE_D1_RECONCILE_SAME_ID_CONTENT_CONFLICT_REQUIRES_REVIEW/);
 assert.equal(f.requests.some(x=>x.method==="PUT"),false);
});
test("date gate disallows replay before 2026-10-29 UTC without network",async()=>{
 const f=fake();
 await assert.rejects(reconcileWebsiteFindsToCanonicalD1({
  fetchImpl:f.fetchImpl,now:new Date("2026-10-28T23:59:59Z"),
 }),/WEBSITE_D1_RECONCILE_NOT_STARTED/);
 assert.deepEqual(f.requests,[]);
});

test("natural expiry during static refresh never poisons current D1 replay",async()=>{
 const earlier="2026-10-29T00:20:00.000Z";
 const expired={...story,id:"macro-87654321",
  published_at:"2026-10-26T00:50:00.000Z"};
 const current={...story,id:"macro-abcdef12",
  published_at:"2026-10-28T23:30:00.000Z"};
 assert.equal(isPermanentArchiveSignal(expired,Date.parse(earlier),{allowHistorical:false}),true);
 assert.equal(verifyDerivedStory(expired,Date.parse(earlier)),true);
 assert.equal(verifyDerivedStory(expired,NOW.getTime()),false);
 const f=fake({website:[expired,current],snapshotCheckedAt:earlier});
 const result=await reconcileWebsiteFindsToCanonicalD1({
   now:NOW,env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:"private-owner-token-".repeat(3)},
   fetchImpl:f.fetchImpl});
 assert.equal(result.website_snapshot_rows,2);
 assert.equal(result.expired_since_snapshot,1);
 assert.equal(result.website_latest_eligible,1);
 assert.equal(result.inserted,1);
 assert.deepEqual(f.inserted,[current]);
 assert.equal(result.predge_authenticated_readback_verified,false);
 assert.equal(result.payments,0);
});
test("only newly expired rows yield a successful bounded no-write parity receipt",async()=>{
 const earlier="2026-10-29T00:20:00.000Z";
 const expired={...story,published_at:"2026-10-26T00:50:00.000Z"};
 const f=fake({website:[expired],snapshotCheckedAt:earlier});
 const result=await reconcileWebsiteFindsToCanonicalD1({
   now:NOW,env:{},fetchImpl:f.fetchImpl});
 assert.equal(result.website_snapshot_rows,1);
 assert.equal(result.expired_since_snapshot,1);
 assert.equal(result.website_latest_eligible,0);
 assert.equal(result.inserted,0);
 assert.equal(result.exact_d1_readback_verified,true);
 assert.equal(f.requests.filter(x=>x.method==="PUT").length,0);
});
test("expired row malformed even at snapshot creation fails closed without D1 writes",async()=>{
 const earlier="2026-10-29T00:20:00.000Z";
 for(const bad of [
  {...story,published_at:"2026-10-25T00:50:00.000Z"},
  {...story,published_at:"2026-10-26T00:50:00.000Z",
   status:"official_release_observed_unscored",source_url:"https://private.invalid"},
  {...story,published_at:"2026-10-26T00:50:00.000Z",
   status:"official_release_observed_unscored",topic:"minerals publisher candidate"},
 ]){
  const f=fake({website:[bad],snapshotCheckedAt:earlier});
  await assert.rejects(reconcileWebsiteFindsToCanonicalD1({
    now:NOW,env:{},fetchImpl:f.fetchImpl
  }),/WEBSITE_D1_RECONCILE_WEBSITE_SIGNAL_NOT_CANONICAL_ELIGIBLE/u);
  assert.equal(f.requests.some(x=>x.method==="PUT"),false);
 }
});
test("exact source state is carried unchanged; do not promote unverified OSINT",async()=>{
 const unverified={...story,id:"macro-aabbccdd",
   topic:"unverified original-source feed",
   development_type:"unverified OSINT feed observation",
   status:"osint_feed_observed_unverified",geography:null,
   sources_credited:["Monitored feed: example.org"],
   published_at:"2026-10-29T01:20:00.000Z"};
 // The topic must match the existing Worker policy; this may be
 // rejected rather than remapped or falsely qualified.
 const f=fake({website:[unverified]});
 try {
   await reconcileWebsiteFindsToCanonicalD1({
     now:NOW,env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:"private-owner-token-".repeat(3)},
     fetchImpl:f.fetchImpl});
   assert.equal(f.inserted[0].status,"osint_feed_observed_unverified");
 }catch(e){
   assert.match(e.message,/WEBSITE_D1_RECONCILE_/u);
   assert.equal(f.inserted.length,0);
 }
});
test("transient GET loss is bounded and does not trigger a new publisher write",async()=>{
 const f=fake({existing:[story],transientGetPath:URLS.bundle});
 const result=await reconcileWebsiteFindsToCanonicalD1({
  now:NOW,env:{},fetchImpl:f.fetchImpl});
 assert.equal(result.inserted,0);
 assert.equal(f.attempts.get(URLS.bundle),2);
 assert.equal(f.requests.filter(r=>r.method==="PUT").length,0);
});
test("ambiguous committed PUT failure never auto-retries into duplicate writes",async()=>{
 const f=fake({uncertainPut:true});
 await assert.rejects(reconcileWebsiteFindsToCanonicalD1({
  now:NOW,env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:"private-owner-token-".repeat(3)},
  fetchImpl:f.fetchImpl}),
  /WEBSITE_D1_RECONCILE_WRITE_OUTCOME_UNCERTAIN/u);
 assert.equal(f.requests.filter(r=>r.method==="PUT").length,1);
 assert.deepEqual(f.inserted,[story]);
});
test("D1 quota 503 is hard red, never retried or disguised as empty",async()=>{
 const f=fake({failCanonical:true});
 await assert.rejects(reconcileWebsiteFindsToCanonicalD1({
  now:NOW,fetchImpl:f.fetchImpl}),
  /WEBSITE_D1_RECONCILE_READ_UNAVAILABLE/u);
 assert.equal(f.attempts.get(URLS.bundle),1);
 assert.equal(f.requests.some(r=>r.method==="PUT"),false);
});

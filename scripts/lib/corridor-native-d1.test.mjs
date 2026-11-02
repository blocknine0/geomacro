import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 validateCorridorNativeNewsBatch,putPrivateCorridorNativeNews,
 readPrivateCorridorNativeNews,purgeExpiredCorridorNativeNews
} from "../../workers/control-plane/src/corridor-native-news.mjs";
import {publishPrivateCorridorNews} from "../ops/publish-private-corridor-native-news.mjs";
const fixed=Date.parse("2026-11-02T02:00:00.000Z");
const publisher="https://www.bankofengland.co.uk/rss/news";
const url="https://www.bankofengland.co.uk/news/2026/november/customs";
const published="2026-11-02T01:45:00.000Z";
const hash=s=>createHash("sha256").update(s).digest("hex");
function candidate(){return {
 id:hash("boe_news\x1f"+url+"\x1f"+published),source_id:"boe_news",
 original_publisher_url:publisher,article_url:url,published_at:published,
 source_title_sha256:hash("Bank of England customs policy update"),
 categories:["macro"],source_region_refs:["europe"],
 candidate_corridor_ids:["suez_canal"],attribution:"FIRST_PARTY_NATIVE_FEED_METADATA",
 source_time_is_not_event_time:true,corridor_impact_verified:false,
 original_article_verified:false,independent_corroboration_verified:false,
 article_content_acquired:false,commercial_rights_verified:false,
 customer_delivery_enabled:false
}}
const packet=items=>({
 schema:"geomacro.corridor-native-news-d1-batch.v1",channel:"CORRIDOR_ONLY",
 checked_at:new Date(fixed).toISOString(),items,
 website_intelligence_enabled:false,commercial_rights_verified:false
});
class MockD1{
 constructor(){this.rows=new Map()}
 prepare(query){return {bind:(...params)=>({query,params,
  all:async()=>{
   if(query.includes("WHERE candidate_id IN")){
    const cutoff=params.at(-1);return {results:[...this.rows.values()]
     .filter(r=>params.slice(0,-1).includes(r.candidate_id)&&r.native_published_at>=cutoff)
     .map(r=>({...r}))};
   }
   const cutoff=params[0],limit=params[1];
   return {results:[...this.rows.values()].filter(r=>r.native_published_at>=cutoff)
    .sort((a,b)=>b.native_published_at.localeCompare(a.native_published_at))
    .slice(0,limit)};
  },
  run:async()=>{
   if(query.startsWith("DELETE"))
     for(const [id,row] of this.rows)if(row.native_published_at<params[0])
       this.rows.delete(id);
   return {success:true};
  }
 })}}
 async batch(prepared){
  for(const stmt of prepared){
   assert.match(stmt.query,/INSERT OR IGNORE INTO corridor_native_news_candidates/u);
   const a=stmt.params;
   if(!this.rows.has(a[0]))this.rows.set(a[0],{
    candidate_id:a[0],source_id:a[1],native_published_at:a[2],
    article_url:a[3],source_title_sha256:a[4],candidate_corridor_ids_json:a[6]
   });
  }
  return prepared.map(()=>({success:true}));
 }
}
test("strict corridor-only D1 contract and provenance acceptance",()=>{
 const rows=validateCorridorNativeNewsBatch(packet([candidate()]),fixed);
 assert.equal(rows.length,1);
 assert.equal(rows[0][0],candidate().id);
 for(const patch of [
  {article_url:"https://evil.example/story"},
  {commercial_rights_verified:true},
  {source_id:"fake_news"},
  {published_at:"2026-10-28T01:45:00.000Z"},
  {candidate_corridor_ids:["unknown_route"]},
  {source_time_is_not_event_time:false}
 ]){
  assert.throws(()=>validateCorridorNativeNewsBatch(packet([{...candidate(),...patch}]),fixed),
   /CORRIDOR_PRIVATE_ITEM_INVALID/);
 }
 assert.throws(()=>validateCorridorNativeNewsBatch({
  ...packet([candidate()]),headline:"raw third party headline"},fixed));
});
test("authenticated-only D1 writer deduplicates and independently reads back",async()=>{
 const db=new MockD1();
 for(let i=0;i<2;i++){
  const res=await putPrivateCorridorNativeNews({DB:db},packet([candidate()]),fixed);
  assert.equal(res.status,200);
  const reply=await res.json();
  assert.equal(reply.d1_readback_verified,true);
  assert.equal(reply.submitted,1);
  assert.equal(reply.verified,1);
  assert.equal(reply.website_intelligence_writes,0);
  assert.equal(reply.paid_publication_authorized,false);
 }
 assert.equal(db.rows.size,1);
 const get=await readPrivateCorridorNativeNews({DB:db},new URLSearchParams("limit=25"),fixed);
 const body=await get.json();
 assert.equal(body.count,1);
 assert.equal(body.candidates[0].article_url,url);
 assert.deepEqual(body.candidates[0].candidate_corridor_ids,["suez_canal"]);
 assert.equal(body.commercial_eligible,false);
 const future=fixed+96*3600000;
 const purged=await purgeExpiredCorridorNativeNews({DB:db},future);
 assert.equal(purged.ok,true);
 assert.equal(db.rows.size,0);
 const empty=await readPrivateCorridorNativeNews({DB:db},new URLSearchParams(),future);
 assert.equal((await empty.json()).count,0);
});
test("private writer refuses unknown schema/rights or missing D1 without publication",async()=>{
 const bad=await putPrivateCorridorNativeNews({DB:new MockD1()},
   {...packet([candidate()]),website_intelligence_enabled:true},fixed);
 assert.equal(bad.status,422);
 const missing=await putPrivateCorridorNativeNews({},packet([candidate()]),fixed);
 assert.equal(missing.status,503);
});
test("scheduled publisher requires real D1 PUT and GET readback, not a 200 alone",async()=>{
 const db=new MockD1(),root="R".repeat(64);
 const bearer=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 const receipt={schema:"geomacro.corridor-native-news-candidates.v1",
  channel:"CORRIDOR_ONLY",checked_at:new Date(fixed).toISOString(),
  source_count:37,native_news_sources_polled:6,
  news_candidates:[candidate()],candidate_count:1,
  website_intelligence_enabled:false,commercial_rights_verified:false};
 let requests=0;
 const response=await publishPrivateCorridorNews({receipt,rootToken:root,now:new Date(fixed),
  fetchImpl:async(input,opts)=>{
   requests++;
   assert.equal(opts.headers.Authorization,"Bearer "+bearer);
   if(opts.method==="PUT")return putPrivateCorridorNativeNews(
    {DB:db},JSON.parse(opts.body),fixed);
   assert.equal(opts.method,"GET");
   return readPrivateCorridorNativeNews({DB:db},new URLSearchParams("limit=25"),fixed);
  }});
 assert.equal(response.authenticated_d1_put_readback,true);
 assert.equal(response.authenticated_d1_get_readback,true);
 assert.equal(response.d1_candidate_records_verified,1);
 assert.equal(response.provider_calls,2);
 assert.equal(requests,2);
 assert.equal(response.website_intelligence_writes,0);
});
test("index router is private after existing strong CONTROL_PLANE_TOKEN and never public",()=>{
 const src=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 const auth=src.indexOf("const auth = authorized(request, env)");
 const route=src.indexOf('if(url.pathname==="/v1/internal/corridor-native-news")');
 assert.ok(auth>0);
 assert.ok(route>auth);
 assert.ok(!src.includes('/v1/public/corridor-native-news'));
});

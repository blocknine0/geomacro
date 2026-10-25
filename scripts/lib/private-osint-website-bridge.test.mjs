import test from "node:test";
import assert from "node:assert/strict";
import {collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
import {officialWebsiteCandidateFromOsint,publishPrivateOsintWebsiteSignals}
 from "./private-osint-website-bridge.mjs";

const now=Date.parse("2026-10-25T12:00:00.000Z");
const rows=[
 {source_url:"https://press.un.org/en/rss.xml",category:"geopolitics",
  title:"United Nations Security Council announces new sanctions measures",
  article_url:"https://press.un.org/en/2026/sc12345.doc.htm"},
 {source_url:"https://www.bankofcanada.ca/content_type/press-releases/feed/",category:"macro",
  title:"Bank of Canada announces monetary policy interest rate decision",
  article_url:"https://www.bankofcanada.ca/2026/10/monetary-policy-decision/"},
 {source_url:"https://www.energy.gov/rss/energygov/2193718",category:"rare_earth",
  title:"Department of Energy announces critical minerals supply program",
  article_url:"https://www.energy.gov/articles/critical-minerals-supply-program"},
].map(x=>({...x,published_at:"2026-10-25T11:40:00.000Z"}));

test("all three category observations require exact official publisher permalinks",()=>{
 for(const x of rows){
  const result=officialWebsiteCandidateFromOsint(x,now);
  assert.ok(result,x.category);assert.equal(result.category,x.category);
  assert.equal(result.articleUrl,x.article_url);
  assert.ok(result.credit.length>0);assert.equal(result.publishedAt,x.published_at);
 }
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],article_url:"https://news.google.com/articles/abc"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],category:"macro"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],source_url:"https://example.com/feed"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],published_at:"2026-10-26T11:40:00.000Z"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],title:"Too short"},now),null);
});

test("only new derived source-credited unscored stories are written and read back",async()=>{
 const signal={id:"geopolitics-12345678",category:"geopolitics",
   status:"official_release_observed_unscored",same_event_corrob_verified:false,
   severity:null,sources_credited:["United Nations"]};
 let records=[],calls=0;
 const readAll=async()=>records;
 const fetchImpl=async(url,options)=>{
  assert.match(url,/\/v1\/website-derived-news$/u);
  assert.equal(options.method,"PUT");
  assert.equal(options.headers.Authorization,"Bearer "+"a".repeat(64));
  const body=JSON.parse(options.body);
  assert.equal(body.schema,"geomacro.website-derived-news-batch.v1");
  assert.equal(body.signals.length,1);
  records=[...records,...body.signals];calls++;
  return new Response(JSON.stringify({ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",accepted:body.signals.length,persistent_derived_only:true,chargeable:false}),{status:200});
 };
 const config={signals:[signal],controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   controlToken:"a".repeat(64),readAll,fetchImpl,now};
 const published=await publishPrivateOsintWebsiteSignals(config);
 assert.equal(published.new_derived_stories,1);
 assert.equal(published.journal_readback_verified,true);assert.equal(calls,1);
 const second=await publishPrivateOsintWebsiteSignals(config);
 assert.equal(second.new_derived_stories,0);assert.equal(calls,1);
 await assert.rejects(publishPrivateOsintWebsiteSignals({...config,
   signals:[{...signal,sources_credited:[]}] }),/BRIDGE_SIGNAL_UNSAFE/u);
 await assert.rejects(publishPrivateOsintWebsiteSignals({...config,
   signals:[{...signal,severity:42}] }),/BRIDGE_SIGNAL_UNSAFE/u);
});

test("a claimed write without exact public readback fails closed",async()=>{
 const signal={id:"macro-12345678",category:"macro",status:"official_release_observed_unscored",
   same_event_corrob_verified:false,severity:null,sources_credited:["Bank of Canada"]};
 await assert.rejects(publishPrivateOsintWebsiteSignals({
   signals:[signal],controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   controlToken:"a".repeat(64),now,readAll:async()=>[],
   fetchImpl:async()=>new Response(JSON.stringify({
     ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",
     accepted:1,persistent_derived_only:true,chargeable:false}),{status:200}),
 }),/EXACT_READBACK_FAILED/u);
});

test("collector captures the original RSS permalink ephemerally while keeping private projection source-free",async()=>{
 const date=new Date(now).toUTCString();
 const xml='<?xml version="1.0"?><rss version="2.0"><channel><item>'+
 '<title>United Nations Security Council announces new sanctions measures</title>'+
 '<link>https://press.un.org/en/2026/sc12345.doc.htm</link>'+
 '<pubDate>'+date+'</pubDate></item></channel></rss>';
 const observed=[];
 const res=await collectRegisteredReusableNews({
  now:new Date(now),registry:[{id:"un_press_global",url:"https://press.un.org/en/rss.xml",
   categories:["geopolitics"],type:"rss",supported:true}],
  normalize:input=>({schema:"geomacro.reusable-news-json.v1",
   id:"news-"+"a".repeat(64),category:input.category,
   source:{publisher_name:null,original_url:null,original_published_at:input.published_at},
   delivery:{raw_article_included:false},
   usage_rights:{commercial_reuse_authorized:false}}),
  onOriginalCandidate:x=>observed.push(x),
  fetchImpl:async()=>new Response(xml,{status:200,headers:{"content-type":"application/rss+xml"}}),
 });
 assert.equal(res.items.length,1);
 assert.equal(observed.length,1);
 assert.equal(observed[0].article_url,"https://press.un.org/en/2026/sc12345.doc.htm");
 assert.equal(res.items[0].source.original_url,null);
 assert.equal(officialWebsiteCandidateFromOsint(observed[0],now)?.credit,"United Nations");
});

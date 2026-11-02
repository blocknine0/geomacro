import test from "node:test";
import assert from "node:assert/strict";
import {collectDirectCorridorNativeNews} from "./direct-corridor-native-news.mjs";
const now=new Date("2026-11-02T02:00:00Z");
const sources=[
 {id:"boe_news",url:"https://www.bankofengland.co.uk/rss/news",
  channel:"CORRIDOR_ONLY",website_intelligence_enabled:false,format:"rss",
  state:"POLL_DIRECT_FEED",categories:["macro"],corridors:["europe"]},
 {id:"coindesk_rss",url:"https://www.coindesk.com/arc/outboundfeeds/rss/",
  channel:"CORRIDOR_ONLY",website_intelligence_enabled:false,format:"rss",
  state:"POLL_DIRECT_FEED",categories:["macro","geopolitics"],corridors:["digital-assets"]}
];
const rss=items=>'<rss><channel>'+items.join("")+"</channel></rss>";
const item=(title,url,time="Mon, 02 Nov 2026 01:45:00 GMT")=>
 '<item><title>'+title+'</title><pubDate>'+time+
 '</pubDate><link>'+url+'</link></item>';
test("native original article is a corridor-only structured candidate with immutable timestamp",async()=>{
 const title="Bank of England rate policy affects trade";
 const sourceFeed=rss([item(title,"https://www.bankofengland.co.uk/news/2026/november/rates")]);
 const result=await collectDirectCorridorNativeNews({sources:sources.slice(0,1),now,
   fetchImpl:async()=>new Response(sourceFeed,{status:200})});
 assert.equal(result.candidate_count,1);
 assert.equal(result.source_checks[0].state,"NATIVE_NEWS_CANDIDATES_INGESTED");
 const c=result.news_candidates[0];
 assert.equal(c.source_id,"boe_news");
 assert.equal(c.published_at,"2026-11-02T01:45:00.000Z");
 assert.equal(c.article_url,"https://www.bankofengland.co.uk/news/2026/november/rates");
 assert.deepEqual(c.source_region_refs,["europe"]);
 assert.deepEqual(c.candidate_corridor_ids,[]);
 assert.equal(c.source_time_is_not_event_time,true);
 assert.equal(c.original_article_verified,false);
 assert.equal(c.commercial_rights_verified,false);
 assert.equal(c.customer_delivery_enabled,false);
 assert.equal(result.website_intelligence_writes,0);
 assert.equal(result.d1_writes,0);
 assert.ok(!JSON.stringify(result).includes(title));
});
test("explicit corridor headline yields a route hint but never a verified risk event",async()=>{
 const title="Suez Canal vessel delays shake global freight markets";
 const feed=rss([item(title,"https://www.coindesk.com/business/suez-freight")]);
 const result=await collectDirectCorridorNativeNews({sources:sources.slice(1),now,
   fetchImpl:async()=>new Response(feed)});
 assert.equal(result.news_candidates.length,1);
 assert.deepEqual(result.news_candidates[0].candidate_corridor_ids,["suez_canal"]);
 assert.equal(result.news_candidates[0].corridor_impact_verified,false);
 assert.equal(result.source_checks[0].candidate_corridor_records,1);
});
test("ATOM alternate href with source-native published time is supported",async()=>{
 const xml='<feed><entry><title>Bank of England trade and customs announcement</title>'+
 '<published>2026-11-02T01:45:00Z</published>'+
 '<link rel="alternate" href="https://www.bankofengland.co.uk/news/a"/></entry></feed>';
 const output=await collectDirectCorridorNativeNews({sources:sources.slice(0,1),now,
   fetchImpl:async()=>new Response(xml)});
 assert.equal(output.candidate_count,1);
});
test("stale, missing native clock, foreign host and duplicate records are rejected",async()=>{
 const feed=rss([
 item("Current monetary policy update","https://www.bankofengland.co.uk/news/a"),
 item("Current monetary policy update","https://www.bankofengland.co.uk/news/a"),
 item("External link to another publisher","https://evil.example/story"),
 item("Stale source financial news","https://www.bankofengland.co.uk/news/old",
   "Mon, 26 Oct 2026 01:45:00 GMT"),
 "<item><title>Updates without original native date</title>"+
 "<link>https://www.bankofengland.co.uk/news/undated</link></item>"
 ]);
 const result=await collectDirectCorridorNativeNews({sources:sources.slice(0,1),now,
   fetchImpl:async()=>new Response(feed)});
 assert.equal(result.candidate_count,1);
 assert.equal(result.source_checks[0].duplicate_records,1);
 assert.equal(result.source_checks[0].verified_native_permalinks,2);
});
test("HTTP 403 is not bypassed or marked as operational ingestion",async()=>{
 const out=await collectDirectCorridorNativeNews({sources,now,
   fetchImpl:async()=>new Response("",{status:403})});
 assert.equal(out.candidate_count,0);
 assert.ok(out.source_checks.every(x=>x.state==="DENIED_NO_RETRY"));
});
test("DOCTYPE, spoofed XML and disallowed publisher routes do not ingest items",async()=>{
 const doc='<!DOCTYPE rss [<!ENTITY x "bad">]><rss><channel>'+
   item("Suez canal closure","https://www.bankofengland.co.uk/news/b")+
   "</channel></rss>";
 const out=await collectDirectCorridorNativeNews({sources:sources.slice(0,1),now,
   fetchImpl:async()=>new Response(doc)});
 assert.equal(out.candidate_count,0);
 assert.equal(out.source_checks[0].state,"NOT_A_NATIVE_FEED");
 await assert.rejects(()=>collectDirectCorridorNativeNews({sources:[
  {...sources[0],channel:"WEBSITE_INTELLIGENCE"}],now}),/CORRIDOR_NATIVE_NEWS_INPUT_INVALID/);
});

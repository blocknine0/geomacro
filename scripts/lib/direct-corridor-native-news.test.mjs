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
test("transient CoinDesk transport 503 recovers with one bounded retry",async()=>{
 let calls=0;
 const feed=rss([item("Bitcoin ETF market liquidity and policy",
  "https://www.coindesk.com/markets/2026/11/02/etf-liquidity")]);
 const out=await collectDirectCorridorNativeNews({
  sources:sources.slice(1),now,
  fetchImpl:async()=>{calls++;
   if(calls===1)return new Response("",{status:503});
   return new Response(feed,{status:200});
  }
 });
 assert.equal(calls,2);
 assert.equal(out.candidate_count,1);
 assert.equal(out.source_checks[0].state,"NATIVE_NEWS_CANDIDATES_INGESTED");
 assert.equal(out.news_candidates[0].commercial_rights_verified,false);
});
test("403 and 429 never retry or produce invented news",async()=>{
 for(const status of [403,429]){
  let calls=0;
  const out=await collectDirectCorridorNativeNews({
   sources:sources.slice(1),now,
   fetchImpl:async()=>{calls++;return new Response("",{status});}
  });
  assert.equal(calls,1);
  assert.equal(out.candidate_count,0);
  assert.equal(out.source_checks[0].state,"DENIED_NO_RETRY");
 }
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

test("cross-feed same original article URL is deduplicated despite native clock differences",async()=>{
 const sameHost=[sources[0],{...sources[0],id:"boe_speeches_official",
   url:"https://www.bankofengland.co.uk/rss/speeches"}];
 const original="https://www.bankofengland.co.uk/news/2026/november/rates";
 const out=await collectDirectCorridorNativeNews({sources:sameHost,now,
   fetchImpl:async url=>new Response(rss([item(
      "Bank of England updates rate guidance",original,
      url.includes("speeches")?"Mon, 02 Nov 2026 01:50:00 GMT":
      "Mon, 02 Nov 2026 01:45:00 GMT")]))
 });
 assert.equal(out.candidate_count,1);
 assert.equal(out.source_checks[1].duplicate_records,1);
 assert.equal(out.news_candidates[0].source_id,"boe_news");
 assert.equal(out.news_candidates[0].original_article_verified,false);
 assert.equal(out.news_candidates[0].independent_corroboration_verified,false);
});
test("different original publishers or URLs are not merged just for a similar headline",async()=>{
 const headline="Central banks update monetary policy outlook";
 const a="https://www.bankofengland.co.uk/news/2026/november/rates";
 const b="https://www.coindesk.com/business/central-bank-rates";
 const out=await collectDirectCorridorNativeNews({sources,now,fetchImpl:async url=>
  new Response(rss([item(headline,url.includes("bankofengland")?a:b)]))});
 assert.equal(out.candidate_count,2);
 assert.equal(new Set(out.news_candidates.map(x=>x.article_url)).size,2);
 assert.ok(out.news_candidates.every(x=>x.original_article_verified===false));
});

test("Fed press-all 404 fails over only to its own first-party monetary RSS",async()=>{
 const spec={...sources[0],id:"federal_reserve",
  url:"https://www.federalreserve.gov/feeds/press_all.xml"};
 const observations=[];
 const article="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261102a.htm";
 const out=await collectDirectCorridorNativeNews({sources:[spec],now,
  fetchImpl:async u=>{
   observations.push(u);
   if(u===spec.url)return new Response("",{status:404});
   if(u==="https://www.federalreserve.gov/feeds/press_monetary.xml")
    return new Response(rss([item("Federal Reserve monetary policy action",article)]));
   return new Response("",{status:500});
  }});
 assert.deepEqual(observations,[spec.url,
  "https://www.federalreserve.gov/feeds/press_monetary.xml"]);
 assert.equal(out.candidate_count,1);
 assert.equal(out.news_candidates[0].article_url,article);
 assert.equal(out.news_candidates[0].original_publisher_url,
   "https://www.federalreserve.gov/feeds/press_monetary.xml");
 assert.equal(out.news_candidates[0].original_article_verified,false);
});
test("publisher 403 never triggers Fed fallback or an invented source",async()=>{
 const spec={...sources[0],id:"federal_reserve",
  url:"https://www.federalreserve.gov/feeds/press_all.xml"};
 const probes=[];
 const out=await collectDirectCorridorNativeNews({sources:[spec],now,
  fetchImpl:async url=>{probes.push(url);return new Response("",{status:403});}});
 assert.equal(out.candidate_count,0);
 assert.deepEqual(probes,[spec.url]);
 assert.equal(out.source_checks[0].state,"DENIED_NO_RETRY");
});

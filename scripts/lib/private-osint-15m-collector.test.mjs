import test from "node:test";
import assert from "node:assert/strict";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";
import {registeredReusableNewsSources} from "./registered-reusable-news-source-collector.mjs";
const now=new Date("2026-10-25T12:00:00.000Z");
const titles=[
 "India central bank announces inflation monetary policy change",
 "India government announces ceasefire and sanctions measures",
 "India government announces critical minerals lithium mining policy"
];
const rss="<rss><channel>"+titles.map(t=>"<item><title>"+t+"</title><pubDate>Sun, 25 Oct 2026 11:52:00 GMT</pubDate></item>").join("")+"</channel></rss>";
const normalize=x=>({
 schema:"geomacro.reusable-news-json.v1",category:x.category,
 country_iso3:x.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:x.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false}
});
const mockSources=Array.from({length:18},(_,i)=>({
 id:"issuer_"+i,url:"https://publisher-"+i+".example.org/rss.xml",
 type:"rss",supported:true,categories:[["geopolitics","macro","rare_earth"][i%3]]
}));
test("all 18 registered endpoint URLs are polled on ONE tick, no 15m registry rotation omissions",async()=>{
 const called=new Set();
 let active=0,high=0;
 const doc=await collectPrivateOsint15m({
  now,registry:mockSources,normalize,resolveCountry:x=>x.includes("India")?"IND":null,
  concurrency:3,
  fetchImpl:async url=>{
    called.add(url);active++;high=Math.max(high,active);
    await Promise.resolve();active--;
    return new Response(rss,{status:200});
  },
 });
 assert.equal(called.size,18);
 assert.equal(doc.summary.source_endpoints_attempted,18);
 assert.equal(doc.checks.length,18);
 assert.equal(doc.summary.configured_country_routes,195);
 assert.equal(doc.summary.configured_country_category_routes,585);
 assert.equal(doc.summary.discovered_within_15m_native_clock,18);
 assert.ok(high<=3,"Bounded group concurrency");
 assert.ok(doc.items.every(x=>x.category&&x.country_iso3==="IND"));
 assert.ok(!JSON.stringify(doc).includes("India central bank announces"));
 assert.ok(!JSON.stringify(doc).includes("publisher-1.example.org"));
 assert.equal(doc.summary.all_world_breaking_claimed,false);
 assert.equal(doc.summary.publicly_served,false);
 assert.equal(doc.summary.rights_verified,false);
});
test("DENIED and unsupported channels do not create unverifiable publications",async()=>{
 const registry=[
  {id:"denied",url:"https://one.example.org/feed",type:"rss",supported:true,categories:["geopolitics"]},
  {id:"unparseable",url:"https://two.example.org/index",type:"html",supported:false,categories:["macro"]},
  {id:"good",url:"https://three.example.org/feed",type:"rss",supported:true,categories:["rare_earth"]},
 ];
 const doc=await collectPrivateOsint15m({now,registry,normalize,
  resolveCountry:()=>null,
  fetchImpl:async url=>new Response(url.includes("one.example.org")?"denied":rss,
    {status:url.includes("one.example.org")?403:200})});
 assert.equal(doc.summary.source_endpoints_attempted,3);
 assert.equal(doc.checks.length,3);
 assert.equal(doc.summary.source_states.DENIED,1);
 assert.equal(doc.summary.source_states.UNSUPPORTED_FORMAT,1);
 assert.equal(doc.items.length,1);
 assert.equal(doc.items[0].country_iso3,undefined);
 assert.equal(doc.summary.source_original_page_independently_verified,false);
});
test("actual registry remains fixed, three-domain and does not activate Telegram or claim every country",()=>{
 const sources=registeredReusableNewsSources();
 assert.ok(sources.length>=30);
 assert.ok(sources.length<=120);
 assert.ok(sources.every(x=>x.url.startsWith("https://")&&!x.url.includes("t.me/")));
 for(const category of ["geopolitics","macro","rare_earth"])
  assert.ok(sources.some(x=>x.categories.includes(category)));
});
test("untrusted duplicate URL and invented country router are rejected",async()=>{
 await assert.rejects(collectPrivateOsint15m({now,registry:[mockSources[0],mockSources[0]],
  normalize,resolveCountry:()=>null}),/PRIVATE_OSINT_SOURCE_NOT_REGISTERED/);
 await assert.rejects(collectPrivateOsint15m({now,registry:mockSources,
  normalize,resolveCountry:()=>null,concurrency:100}),/PRIVATE_OSINT_COLLECTOR_CONFIG_INVALID/);
});

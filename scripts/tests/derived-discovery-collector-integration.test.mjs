import test from "node:test";
import assert from "node:assert/strict";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
const now=new Date("2026-10-25T12:00:00.000Z");
const feed="<rss><channel>"+Array.from({length:12},(_,i)=>
 "<item><title>Central bank announces inflation policy adjustment number "+i+
 "</title><pubDate>Sun, 25 Oct 2026 11:50:00 GMT</pubDate></item>"
).join("")+"</channel></rss>";
const normalize=row=>({
 schema:"geomacro.reusable-news-json.v1",category:row.category,
 country_iso3:row.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:row.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false}
});
test("12 distinct native-timestamp source observations survive parser and private collection",async()=>{
 const registry=[{id:"test_issuer",url:"https://publisher.example.org/rss",
  type:"rss",supported:true,categories:["macro"]}];
 const result=await collectPrivateOsint15m({
  now,registry,normalize,resolveCountry:()=>null,
  fetchImpl:async()=>new Response(feed,{status:200,
   headers:{"content-type":"application/rss+xml"}})
 });
 assert.equal(result.summary.source_endpoints_attempted,1);
 assert.equal(result.checks[0].state,"OBSERVED");
 assert.equal(result.items.length,12);
 assert.equal(new Set(result.items.map(x=>x.id)).size,12);
 assert.ok(result.items.every(x=>x.category==="macro"&&
   x.delivery.raw_article_included===false &&
   x.usage_rights.commercial_reuse_authorized===false));
 // Offline controlled fixture: parser support, NOT live publisher receipt,
 // D1 persistence, commercial rights or independently reviewed GRI.
});

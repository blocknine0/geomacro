import test from "node:test";
import assert from "node:assert/strict";
import {p0bFirstPartyFeedNews} from "../lib/p0b-first-party-rss.mjs";
import {p0bGlobalNewsFallback} from "../lib/p0b-live-global-search.mjs";
const now=Date.parse("2026-10-30T09:00:00.000Z");
const xml='<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'+
 '<item><title>United Nations announces sanctions on Ukraine exports</title>'+
 '<link>https://news.un.org/en/story/2026/10/1234567</link>'+
 '<pubDate>Fri, 30 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
const stub=async url=>{
 const u=new URL(url);
 const isFeed=u.hostname==="news.un.org";
 const body=isFeed?xml:u.hostname==="www.gov.uk"?
  JSON.stringify({results:[]}):JSON.stringify({articles:[]});
 return {status:200,redirected:false,
  headers:{get:k=>k==="content-type"?(isFeed?"application/rss+xml":"application/json"):null},
  text:async()=>body};
};
test("verified first-party UN RSS source metadata yields factual private five-part",async()=>{
 const r=await p0bFirstPartyFeedNews({countryIso3:"UKR",countryName:"Ukraine",
  category:"geopolitics",question:"Ukraine sanctions",now,fetchImpl:stub});
 assert.equal(r.status,"FIRST_PARTY_FEED_METADATA_GROUNDED");
 assert.equal(r.items.length,1);
 const x=r.items[0];
 assert.equal(x.first_party_feed_metadata_verified,true);
 assert.equal(x.original_page_independently_verified,false);
 assert.equal(x.five_part.evidence_and_confidence.paid_eligible,false);
 assert.equal(x.five_part.evidence_and_confidence.source_published_at,
  "2026-10-30T08:00:00.000Z");
 assert.match(x.five_part.what_happened.text,/sanctions on Ukraine exports/u);
 assert.match(x.five_part.why_it_matters.text,/sanctions on Ukraine exports/u);
 assert.equal(Object.hasOwn(x,"original_url"),false);
 assert.equal(Object.hasOwn(x,"original_title"),false);
});
test("global search combines actual source RSS evidence with GOV and GDELT discovery",async()=>{
 const r=await p0bGlobalNewsFallback({countryIso3:"UKR",category:"geopolitics",
  question:"Ukraine sanctions",now,fetchImpl:stub});
 assert.equal(r.first_party_rss_verified_count,1);
 assert.equal(r.first_party_matches.length,1);
 assert.equal(r.provider_diagnostics.rss,"FIRST_PARTY_FEED_METADATA_GROUNDED");
 assert.equal(r.status,"FIRST_PARTY_METADATA_GROUNDED");
 assert.equal(r.provider_errors,0);
});
test("untrusted feed link, publication time and country are never promoted",async()=>{
 const invalid=xml.replace("https://news.un.org/en/story/2026/10/1234567",
  "https://untrusted.example.org/en/story/2026/10/1234567");
 const fake=async()=>({status:200,redirected:false,
  headers:{get:()=>"application/rss+xml"},text:async()=>invalid});
 const r=await p0bFirstPartyFeedNews({countryIso3:"UKR",countryName:"Ukraine",
  category:"geopolitics",question:"Ukraine sanctions",now,fetchImpl:fake});
 assert.equal(r.items.length,0);
});


test("original US BLS employment-cost feed grounds a USA macro release, never a measured change",async()=>{
 const rss='<?xml version="1.0"?><rss><channel><item>'+
  '<title>Employment Cost Index Update</title>'+
  '<link>https://www.bls.gov/news.release/eci.nr0.htm</link>'+
  '<pubDate>Fri, 30 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
 const fetchImpl=async url=>({
  status:200,redirected:false,
  headers:{get:()=> "application/rss+xml"},
  text:async()=>url.includes("/feed/bls_latest.rss")?rss:"<rss><channel></channel></rss>"
 });
 const result=await p0bFirstPartyFeedNews({
  countryIso3:"USA",countryName:"United States",
  category:"macro",question:"United States employment cost index",
  now,fetchImpl});
 assert.equal(result.items.length,1);
 const item=result.items[0];
 assert.equal(item.issuer_country_verified,"USA");
 assert.equal(item.country_attribution_basis,"FIRST_PARTY_NATIONAL_STATISTICAL_ISSUER");
 assert.match(item.five_part.what_happened.text,/published an Employment Cost Index update/u);
 assert.match(item.five_part.why_it_matters.text,/no reported value/u);
 assert.equal(item.five_part.market_relevance.price_change,null);
 assert.equal(item.paid_eligible,false);
 const wrong=await p0bFirstPartyFeedNews({
  countryIso3:"CAN",countryName:"Canada",
  category:"macro",question:"Canada employment cost index",
  now,fetchImpl});
 assert.equal(wrong.items.length,0);
});


test("BC provincial source can establish CAN mineral release jurisdiction without claiming nationwide effects",async()=>{
 const rss='<?xml version="1.0"?><rss><channel><item>'+
  '<title>BC Ministry announces critical minerals investment</title>'+
  '<link>https://news.gov.bc.ca/releases/2026EMLI0059-000999</link>'+
  '<pubDate>Fri, 30 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>';
 const fetchImpl=async()=>({status:200,redirected:false,
  headers:{get:()=>"application/rss+xml"},text:async()=>rss});
 const r=await p0bFirstPartyFeedNews({countryIso3:"CAN",countryName:"Canada",
  category:"rare_earth",question:"Canada critical minerals",
  now,fetchImpl});
 assert.equal(r.items.length,1);
 const one=r.items[0];
 assert.equal(one.issuer_country_verified,"CAN");
 assert.equal(one.country_attribution_basis,"FIRST_PARTY_PROVINCIAL_MINERAL_ISSUER");
 assert.match(one.five_part.what_happened.text,/critical minerals investment/u);
 assert.equal(one.five_part.evidence_and_confidence.paid_eligible,false);
});

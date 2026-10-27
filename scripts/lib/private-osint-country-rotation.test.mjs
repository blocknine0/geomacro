import test from "node:test";
import assert from "node:assert/strict";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";
import {
 rotatingPrivateCountryDiscoverySources,privateOsintRuntimeSources,
 COUNTRY_DISCOVERY_PER_TICK,COUNTRY_DISCOVERY_NOMINAL_CYCLE_MINUTES
} from "./private-osint-country-rotation.mjs";

const at=new Date("2026-10-25T12:00:00.000Z");
const min=15*60000;
const normalized=item=>({
 schema:"geomacro.reusable-news-json.v1",category:item.category,
 country_iso3:item.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:item.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false},
});
test("195 countries rotate across exactly four nominal slots with 3 topical lanes",()=>{
 assert.equal(COUNTRY_DISCOVERY_PER_TICK,49);
 assert.equal(COUNTRY_DISCOVERY_NOMINAL_CYCLE_MINUTES,60);
 const batches=[0,1,2,3].map(n=>rotatingPrivateCountryDiscoverySources(new Date(at.getTime()+n*min)));
 assert.deepEqual(batches.map(b=>b.length),[49,49,49,48]);
 const all=batches.flat();
 assert.equal(all.length,195);
 assert.deepEqual(new Set(all.map(s=>s.discovery_country_iso3)),
   new Set(COUNTRIES_195.map(c=>c.iso3)));
 assert.equal(new Set(all.map(s=>s.url)).size,195);
 const congo=all.find(s=>s.discovery_country_iso3==="COD");
 assert.ok(new URL(congo.url).searchParams.get("q").includes('"DRC"'));
 const myanmar=all.find(s=>s.discovery_country_iso3==="MMR");
 assert.ok(new URL(myanmar.url).searchParams.get("q").includes('"Burma"'));
 for(const source of all){
  const url=new URL(source.url);
  assert.equal(url.origin,"https://news.google.com");
  assert.equal(url.pathname,"/rss/search");
  assert.equal(url.searchParams.get("hl"),"en-US");
  assert.equal(url.searchParams.get("ceid"),"US:en");
  assert.ok(url.searchParams.get("q").includes("when:1d"));
  assert.deepEqual(source.categories,["geopolitics","macro","rare_earth"]);
  assert.equal(source.publisher_country_iso3,null);
  assert.equal(source.private_discovery_index_only,true);
  assert.equal(source.index_timestamp_not_original_page_clock,true);
  assert.equal(source.transport_verified_at_registration,false);
  assert.equal(source.commercial_eligible,false);
  assert.equal(source.publicly_deliverable,false);
 }
 assert.deepEqual(rotatingPrivateCountryDiscoverySources(new Date(at.getTime()+4*min)).map(s=>s.url),
   batches[0].map(s=>s.url));
});
test("country search indices never masquerade as country-local issuer feeds",()=>{
 const base=[{id:"pinned_issuer",url:"https://pinned.example.org/rss.xml",
  categories:["macro"],continent:"global",publisher_country_iso3:null,supported:true,type:"rss"}];
 const merged=privateOsintRuntimeSources(at,base);
 assert.equal(merged.length,50);
 assert.equal(merged[0].id,base[0].id);
 assert.equal(merged.filter(s=>s.publisher_country_iso3).length,0);
 assert.equal(merged.filter(s=>s.private_discovery_index_only).length,49);
 assert.throws(()=>privateOsintRuntimeSources(at,Array(500).fill(base[0])),/PRIVATE_OSINT_COUNTRY_INDEX_BASE_DUPLICATE/);
 assert.throws(()=>privateOsintRuntimeSources(at,Array.from({length:500},(_,i)=>({
  ...base[0],url:"https://pinned.example.org/"+i
 }))),/PRIVATE_OSINT_COUNTRY_INDEX_SOURCE_CEILING/);
});
test("private index results enter dated 3-domain collector, de-dupe, and never trigger public candidate callback",async()=>{
 const src=rotatingPrivateCountryDiscoverySources(at).slice(0,2);
 const headlines=[
 "Central bank announces inflation and foreign exchange policy changes",
 "Foreign ministry announces ceasefire treaty and security measures",
 "Government announces critical minerals lithium and copper mining rules",
 ];
 const rss='<rss version="2.0"><channel>'+
   headlines.map((title,i)=>'<item><title>'+title+'</title>'+
   '<link>https://original.example.org/article-'+i+'</link>'+
   '<pubDate>Sun, 25 Oct 2026 11:52:00 GMT</pubDate></item>').join("")+
   '</channel></rss>';
 let called=0,requests=0;
 const result=await collectPrivateOsint15m({now:at,registry:src,normalize:normalized,
  resolveCountry:()=>null,
  onOriginalCandidate:()=>{called++},
  fetchImpl:async()=>{requests++;return new Response(rss,{status:200})},
 });
 assert.equal(requests,2);
 assert.equal(called,0,"index metadata must not enter the existing public editorial callback");
 assert.equal(result.checks.length,6);
 assert.deepEqual(new Set(result.items.map(x=>x.category)),
   new Set(["geopolitics","macro","rare_earth"]));
 assert.equal(result.items.length,3,"one Google-indexed title is not one event per search query");
 assert.ok(result.items.every(x=>x.country_iso3===null));
 assert.ok(result.items.every(x=>x.usage_rights.commercial_reuse_authorized===false));
 assert.equal(result.summary.rotating_country_index_sources_this_tick,2);
 assert.equal(result.summary.rotating_country_index_does_not_supply_event_country,true);
});

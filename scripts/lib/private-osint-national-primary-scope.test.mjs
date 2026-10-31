import test from "node:test";
import assert from "node:assert/strict";
import {qualifyPrivateNationalPrimaryScope,sourceIsPinnedNationalPrimary} from "./private-osint-national-primary-scope.mjs";
import {privateOsintCountryMention,privateOsintCountryMentions} from "./private-osint-country-mentions.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
import {PRIVATE_OSINT_TOPICS} from "./private-osint-global-sources.mjs";
import {privateOsintRuntimeSources} from "./private-osint-country-rotation.mjs";
const now=new Date("2026-10-31T12:00:00Z");
const source=qualifyPrivateNationalPrimaryScope({
 id:"private_rba",url:"https://www.rba.gov.au/rss/rss-cb-media-releases.xml",
 publisher_country_iso3:"AUS",categories:["macro","rare_earth"],type:"rss",supported:true});
const normalize=x=>({schema:"geomacro.reusable-news-json.v1",
 country_iso3:x.country_iso3??null,category:x.category,
 source:{original_published_at:x.published_at},
 delivery:{raw_article_included:false},
 usage_rights:{commercial_reuse_authorized:false}});
const feed=titles=>'<rss><channel>'+titles.map(t=>'<item><title>'+t+'</title><pubDate>Sat, 31 Oct 2026 11:55:00 GMT</pubDate></item>').join("")+'</channel></rss>';
const collect=async(s,titles)=>collectRegisteredReusableNews({now,registry:[s],normalize,
 topicPatterns:PRIVATE_OSINT_TOPICS,resolveCountry:()=>null,
 fetchImpl:async()=>new Response(feed(titles),{status:200})});
test("only exact government issuer URL and publisher code can be domestic scoped",()=>{
 assert.equal(sourceIsPinnedNationalPrimary(source),true);
 for(const bad of [
  {...source,url:"https://news.google.com/rss/search?q=AUS"},
  {...source,publisher_country_iso3:"CHL"},
  {...source,private_discovery_index_only:true},
 ])assert.equal(sourceIsPinnedNationalPrimary(qualifyPrivateNationalPrimaryScope(bad)),false);
});
test("domestic publisher headline with no country name can gain provisional country, not paid rights",async()=>{
 const x=await collect(source,["Central bank announces new monetary policy interest rate decision"]);
 assert.equal(x.items.length,1);
 assert.equal(x.items[0].country_iso3,"AUS");
 assert.equal(x.summary.issuer_context_country_fallbacks_not_independently_verified,1);
 assert.equal(x.summary.paid_publication_authorized,false);
});
test("explicit other or multiple countries suppress issuer-country fallback",async()=>{
 const a=await collect(source,["Chile copper export mining production policy announcement"]);
 assert.equal(a.items[0].country_iso3,null);
 assert.equal(a.summary.issuer_context_country_fallbacks_not_independently_verified,0);
 const b=await collect(source,["Chile and Indonesia announce new nickel mining policies"]);
 assert.equal(b.items[0].country_iso3,null);
 assert.deepEqual(privateOsintCountryMentions("Chile and Indonesia announce trade pact",COUNTRIES_195),["CHL","IDN"]);
});
test("ordinary news, news index and unverifiable registries cannot inherit source fallback",async()=>{
 const generic={...source,id:"regional",url:"https://example.org/rss",scope:undefined};
 const x=await collect(generic,["Central bank announces new inflation policy changes"]);
 assert.equal(x.items[0].country_iso3,null);
});
test("mineral topic multilingual precise matches, generic ambiguous words rejected",()=>{
 for(const title of [
  "Indonesia memperluas hilirisasi nikel di Sulawesi",
  "Evolución de la producción de níquel y cobre",
  "Investissements nouveaux dans les métaux critiques",
  "Governo anuncia planos de terras raras",
 ])assert.equal(PRIVATE_OSINT_TOPICS.rare_earth.test(title),true,title);
 assert.equal(PRIVATE_OSINT_TOPICS.rare_earth.test("Visite de mines historiques"),false);
 assert.equal(PRIVATE_OSINT_TOPICS.rare_earth.test("Tambang baru ditemukan"),false);
 assert.equal(privateOsintCountryMention("Australia and Chile sign deal",COUNTRIES_195),null);
});
test("real runtime tags issuer subset while retaining 512 GET and all country rotation metadata",()=>{
 const all=privateOsintRuntimeSources(now);
 assert.ok(all.length<=512);
 const rba=all.find(s=>s.url===source.url);
 assert.equal(sourceIsPinnedNationalPrimary(rba),true);
 assert.equal(all.some(s=>s.private_discovery_index_only&&s.scope==="national_primary"),false);
});


test("seven official Indian PIB feeds are pinned in production and callback carries country only on country-quiet title",async()=>{
 const runtime=privateOsintRuntimeSources(now);
 for(const reg of [1,3,5,6,17,20,22]){
  const url="https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid="+reg;
  const src=runtime.find(s=>s.url===url);
  assert.ok(src,"missing official PIB RSS register "+reg);
  assert.equal(sourceIsPinnedNationalPrimary(src),true);
 }
 const src=runtime.find(s=>s.url==="https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3");
 const collected=[];
 await collectRegisteredReusableNews({
  now,registry:[src],normalize,topicPatterns:PRIVATE_OSINT_TOPICS,
  resolveCountry:()=>null,onOriginalCandidate:r=>collected.push(r),
  fetchImpl:async()=>new Response(feed([
   "Government announces lithium mineral production processing policy",
   "Australia nickel export mining policy announced"]),{status:200})
 });
 assert.ok(collected.length>0);
 assert.ok(collected.some(x=>x.title.startsWith("Government announces")&&
   x.issuer_context_country_iso3==="IND"));
 assert.ok(collected.every(x=>!x.title.startsWith("Australia nickel")||
   !x.issuer_context_country_iso3));
});

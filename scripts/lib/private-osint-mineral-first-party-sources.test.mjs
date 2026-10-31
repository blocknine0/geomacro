import test from "node:test";
import assert from "node:assert/strict";
import {privateMineralNationalRssSources} from "./private-osint-mineral-first-party-sources.mjs";
import {privateOsintRuntimeSources} from "./private-osint-country-rotation.mjs";
import {sourceIsPinnedNationalPrimary} from "./private-osint-national-primary-scope.mjs";
import {collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
import {PRIVATE_OSINT_TOPICS} from "./private-osint-global-sources.mjs";
const now=new Date("2026-10-31T12:00:00Z");
const norm=x=>({schema:"geomacro.reusable-news-json.v1",category:x.category,
 country_iso3:x.country_iso3??null,delivery:{raw_article_included:false},
 usage_rights:{commercial_reuse_authorized:false}});
test("four publisher-listed native RSS feed links enter capped 15m rotation",()=>{
 const urls=privateMineralNationalRssSources();
 assert.equal(urls.length,4);
 const base=privateOsintRuntimeSources(now);
 assert.ok(base.length<=512);
 for(const source of urls){
  const loaded=base.find(s=>s.url===source.url);
  assert.ok(loaded,source.id);
  assert.equal(sourceIsPinnedNationalPrimary(loaded),source.scope==="national_primary");
  assert.ok(loaded.categories.includes("rare_earth"));
 }
 assert.equal(new Set(base.map(s=>s.url)).size,base.length);
});
test("issuer-only Spanish copper release gains Chile provisional context; foreign release cannot",async()=>{
 const source=privateOsintRuntimeSources(now).find(s=>s.id==="private_mineral_chl_cochilco_news");
 assert.ok(source);
 const titles=["Comisión entrega nueva información de producción de cobre",
  "Cobre de Australia aumenta tras acuerdo de minería"];
 const xml='<rss><channel>'+titles.map(t=>'<item><title>'+t+'</title>'+
 '<pubDate>Sat, 31 Oct 2026 11:20:00 GMT</pubDate></item>').join("")+'</channel></rss>';
 const r=await collectRegisteredReusableNews({now,registry:[source],normalize:norm,
   topicPatterns:PRIVATE_OSINT_TOPICS,resolveCountry:()=>null,
   fetchImpl:async()=>new Response(xml)});
 assert.equal(r.items.length,2);
 assert.deepEqual(r.items.map(x=>x.country_iso3),["CHL",null]);
 assert.equal(r.summary.issuer_context_country_fallbacks_not_independently_verified,1);
 assert.equal(r.summary.paid_publication_authorized,false);
});

test("Indonesian national newswire has NO government country fallback or paid rights",async()=>{
 const source=privateOsintRuntimeSources(now).find(s=>s.id==="private_mineral_idn_antara_business");
 assert.ok(source);
 assert.equal(sourceIsPinnedNationalPrimary(source),false);
 const xml='<rss><channel><item><title>Nickel smelter production investment expanded</title>'+
  '<pubDate>Sat, 31 Oct 2026 11:20:00 GMT</pubDate></item></channel></rss>';
 const r=await collectRegisteredReusableNews({now,registry:[source],normalize:norm,
  resolveCountry:()=>null,topicPatterns:PRIVATE_OSINT_TOPICS,
  fetchImpl:async()=>new Response(xml)});
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].country_iso3,null);
 assert.equal(r.summary.issuer_context_country_fallbacks_not_independently_verified,0);
 assert.equal(r.summary.paid_publication_authorized,false);
});
test("previously unavailable industry.gov.au/news.xml is excluded from private rotation",()=>{
 const urls=privateOsintRuntimeSources(now).map(s=>s.url);
 assert.ok(!urls.includes("https://www.industry.gov.au/news.xml"));
 assert.ok(urls.includes("https://www.dmpr.gov.za/Media-Centre/News/ctl/rss/mid/2215"));
 assert.ok(urls.includes("https://www.minister.industry.gov.au/feed/all-media/rss.xml"));
});

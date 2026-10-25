import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateOsintGlobalSources,privateOsintContinentCoverage,PRIVATE_OSINT_TOPICS} from "./private-osint-global-sources.mjs";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";
import {collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
import {privateOsintCountryMention} from "./private-osint-country-mentions.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
const now=new Date("2026-10-25T12:00:00.000Z");
const normalize=x=>({schema:"geomacro.reusable-news-json.v1",category:x.category,country_iso3:x.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:x.published_at},
 delivery:{raw_article_included:false},usage_rights:{commercial_reuse_authorized:false}});
test("accepted global source inventory has distinct pinned feeds in six continents and 195x3 routing",()=>{
 const sources=privateOsintGlobalSources();
 assert.ok(sources.length>100);
 assert.equal(new Set(sources.map(s=>s.url)).size,sources.length);
 assert.ok(sources.every(s=>s.supported));
 const coverage=privateOsintContinentCoverage(sources,[],[]);
 assert.equal(Object.keys(coverage).length,6);
 assert.equal(Object.values(coverage).reduce((n,c)=>n+c.country_routes,0),195);
 assert.equal(Object.values(coverage).reduce((n,c)=>n+c.category_routes,0),585);
 assert.ok(Object.values(coverage).every(c=>c.regional_endpoints>0&&c.working_regional_endpoints===0&&c.observed_country_category_cells===0));
 const manifest=JSON.parse(readFileSync(new URL('../../config/private-osint-working-sources.v1.json',import.meta.url)));
 assert.equal(manifest.accepted_endpoint_count,manifest.sources.length);
 assert.ok(manifest.sources.every(s=>s.acceptance.http_status===200&&s.acceptance.feed_parsed&&s.acceptance.bounded_feed_bytes<=1024*1024));
});
test("live denial/HTML sources emit no items and never enter working endpoint counts",async()=>{
 const registry=[
 {id:"ok",url:"https://ok.example.org/rss",type:"rss",supported:true,continent:"africa",categories:["macro"]},
 {id:"bad",url:"https://denied.example.org/rss",type:"rss",supported:true,continent:"asia",categories:["macro"]},
 {id:"html",url:"https://html.example.org/rss",type:"rss",supported:true,continent:"europe",categories:["macro"]},
 ];
 const rss='<rss><channel><item><title>Kenya central bank announces inflation policy measures</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate></item></channel></rss>';
 const result=await collectPrivateOsint15m({now,registry,normalize,resolveCountry:()=>"KEN",
 fetchImpl:async u=>u.includes('denied')?new Response('',{status:403}):new Response(u.includes('html')?'<html>sign in</html>':rss)});
 assert.equal(result.summary.working_source_endpoints,1);
 assert.equal(result.items.length,1);
 assert.equal(result.summary.continent_coverage.africa.working_regional_endpoints,1);
 assert.equal(result.summary.continent_coverage.asia.working_regional_endpoints,0);
});
test("native-language topics and country names route without assigning the publisher's country",()=>{
 for(const [title,iso] of [
  ['Brasil anuncia novas medidas para inflação e política monetária','BRA'],
  ['La France annonce des sanctions et de nouvelles mesures diplomatiques','FRA'],
  ['中国宣布关键矿产和稀土出口新政策','CHN'],
  ['ভারত নতুন খনিজ নীতি ঘোষণা করেছে','IND'],
  ['Россия объявляет новые экономические меры','RUS'],
 ])assert.equal(privateOsintCountryMention(title,COUNTRIES_195),iso,title);
 assert.equal(privateOsintCountryMention('France and China announce new trade measures',COUNTRIES_195),null);
 assert.equal(privateOsintCountryMention('Central bank announces a monetary policy decision',COUNTRIES_195),null);
 assert.ok(PRIVATE_OSINT_TOPICS.macro.test('Brasil anuncia queda da inflação'));
 assert.ok(PRIVATE_OSINT_TOPICS.rare_earth.test('Novas regras para mineração de lítio e terras raras'));
 assert.ok(PRIVATE_OSINT_TOPICS.geopolitics.test('La France annonce un cessez-le-feu et des sanctions'));
});
test("RSS1 publisher dc:date works only in private mode; Atom updated stays ineligible",async()=>{
 const registry=[{id:'rba',url:'https://rba.example.org/feed',categories:['macro'],type:'rdf',supported:true}];
 const body='<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Central bank announces new inflation monetary policy decision</title><dc:date>2026-10-25T11:55:00Z</dc:date></item></rdf:RDF>';
 const opts={now,registry,normalize,resolveCountry:()=>null,fetchImpl:async()=>new Response(body)};
 assert.equal((await collectRegisteredReusableNews(opts)).items.length,0);
 assert.equal((await collectRegisteredReusableNews({...opts,allowRdfNativeDates:true})).items.length,1);
 const atom='<feed><entry><title>Central bank announces new inflation monetary policy decision</title><updated>2026-10-25T11:55:00Z</updated></entry></feed>';
 assert.equal((await collectRegisteredReusableNews({...opts,allowRdfNativeDates:true,fetchImpl:async()=>new Response(atom)})).items.length,0);
});

test("uploaded India PIB official RSS feeds join only the private OSINT discovery lane",async()=>{
 const cfg=JSON.parse(readFileSync(new URL("../../config/private-osint-official-feed-additions.v1.json",import.meta.url)));
 assert.equal(cfg.schema,"geomacro.private-osint-official-feed-additions.v1");
 assert.equal(cfg.scope,"PROTECTED_INTERNAL_OSINT_ONLY");
 assert.equal(cfg.sources.length,2);
 assert.ok(cfg.sources.every(s=>s.provider_rights_verified===false&&s.commercial_eligible===false&&
  s.access_verified_in_production===false&&s.publicly_deliverable===false&&
  s.activation_state==="RUNTIME_PROBE_REQUIRED"));
 const full=privateOsintGlobalSources();
 for(const candidate of cfg.sources){
   const saved=full.filter(s=>s.url===candidate.url);
   assert.equal(saved.length,1);
   assert.equal(saved[0].publisher_country_iso3,"IND");
   assert.deepEqual(saved[0].categories,["geopolitics","macro","rare_earth"]);
   assert.equal(saved[0].transport_verified_at_registration,false);
 }
 const r=await collectPrivateOsint15m({now,normalize,resolveCountry:()=>null,
   registry:full.filter(s=>cfg.sources.some(x=>x.url===s.url)),
   fetchImpl:async()=>new Response("not available",{status:403})});
 assert.equal(r.items.length,0);
 assert.equal(r.summary.working_source_endpoints,0);
 assert.ok(r.checks.every(c=>c.state==="DENIED"));
 assert.equal(r.summary.confidential_private_osint_only,true);
 assert.equal(r.summary.independent_verification_required_for_ingestion,false);
});

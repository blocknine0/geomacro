import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {privateOsintGlobalSources,privateOsintContinentCoverage,privateOsintCorridorReferenceCoverage,privateOsintCorridorSourceCoverage,privateOsintPublisherCountryCoverage,privateOsintCountryCategoryCoverage,privateOsintCategoryLiveCoverage,PRIVATE_OSINT_TOPICS} from "./private-osint-global-sources.mjs";
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
 const publisherCoverage=privateOsintPublisherCountryCoverage(sources,[],{includeDetails:true});
 assert.equal(publisherCoverage.country_count,195);
 assert.equal(publisherCoverage.country_category_slots,585);
 assert.equal(Object.keys(publisherCoverage.by_country).length,195);
 assert.equal(publisherCoverage.working_country_category_cells,0);
 assert.ok(publisherCoverage.missing_registered_country_category_cells>0);
 assert.ok(publisherCoverage.countries_without_publisher_specific_endpoint.length>0);
 assert.equal(publisherCoverage.interpretation.startsWith("Publisher-country inventory only"),true);
 const sourceMatrix=privateOsintCountryCategoryCoverage(sources,[],[],{includeCells:true});
 assert.equal(sourceMatrix.expected_country_category_cells,585);
 assert.equal(sourceMatrix.returned_country_category_cells,585);
 assert.equal(sourceMatrix.coverage.cells_with_any_configured_source,585);
 assert.equal(sourceMatrix.coverage.cells_with_global_fallback,585);
 assert.equal(sourceMatrix.coverage.cells_with_any_healthy_source,0);
 assert.equal(sourceMatrix.coverage.cells_without_configured_source,0);
 assert.equal(sourceMatrix.country_specific_source_countries_registered,65);
 assert.equal(sourceMatrix.countries_without_country_specific_publisher_source.length,130);
 assert.equal(sourceMatrix.scope,"PRIVATE_SOURCE_ACQUISITION_COVERAGE_NOT_PUBLIC_FIND_COVERAGE");
 const unGenevaCandidate=JSON.parse(readFileSync(new URL("../../config/private-osint-regional-corridor-additions.v1.json",import.meta.url),"utf8")).sources.find(s=>s.id==="private_expansion_ungeneva_press_rss");
 assert.equal(liveSources.filter(source=>source.url===unGenevaCandidate.url).length,1);
 assert.equal(liveSources.find(source=>source.url===unGenevaCandidate.url).id,"ungeneva_press_global");
 const liveSources=privateOsintGlobalSources();
 assert.ok(["geopolitics","macro","rare_earth"].every(category=>liveSources.filter(source=>source.categories.includes(category)).length>=12));
 const manifest=JSON.parse(readFileSync(new URL('../../config/private-osint-working-sources.v1.json',import.meta.url)));
 assert.equal(manifest.accepted_endpoint_count,manifest.sources.length);
 assert.ok(manifest.sources.every(s=>s.acceptance.http_status===200&&s.acceptance.feed_parsed&&s.acceptance.bounded_feed_bytes<=1024*1024));
});
test("eight-repository intake admits every accepted unique endpoint and retains source provenance",()=>{
 const audit=JSON.parse(readFileSync(new URL('../../config/private-osint-eight-repository-intake.v1.json',import.meta.url)));
 const manifest=JSON.parse(readFileSync(new URL('../../config/private-osint-working-sources.v1.json',import.meta.url)));
 const urls=new Set(manifest.sources.map(s=>s.url));
 assert.equal(audit.repository_count,8);assert.equal(audit.repositories.length,8);
 assert.equal(audit.total_private_endpoint_count,manifest.sources.length);
 assert.equal(audit.new_endpoint_count,audit.endpoints.filter(e=>e.state==='ADDED_LIVE_VERIFIED').length);
 assert.ok(manifest.sources.length<=512);
 for(const row of audit.endpoints.filter(e=>['ADDED_LIVE_VERIFIED','ALREADY_REGISTERED'].includes(e.state)))
  assert.ok(urls.has(row.canonical_url??row.url));
 assert.ok(manifest.sources.filter(s=>s.id.startsWith('private_repo_')).every(s=>s.discovery_references.length>0));
 assert.equal(audit.repositories.find(r=>r.repository==='krypt1kdr3amer/OSINT-WatchDog').candidate_endpoints,0);
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
  ['ישראל מכריזה על מדיניות ריבית וכלכלה חדשה','ISR'],
  ['Україна оголошує нові економічні заходи','UKR'],
 ])assert.equal(privateOsintCountryMention(title,COUNTRIES_195),iso,title);
 assert.equal(privateOsintCountryMention('France and China announce new trade measures',COUNTRIES_195),null);
 assert.equal(privateOsintCountryMention('Central bank announces a monetary policy decision',COUNTRIES_195),null);
 assert.ok(PRIVATE_OSINT_TOPICS.macro.test('Brasil anuncia queda da inflação'));
 assert.ok(PRIVATE_OSINT_TOPICS.rare_earth.test('Novas regras para mineração de lítio e terras raras'));
 assert.ok(PRIVATE_OSINT_TOPICS.geopolitics.test('La France annonce un cessez-le-feu et des sanctions'));
 assert.ok(PRIVATE_OSINT_TOPICS.geopolitics.test('ישראל מכריזה על הפסקת אש'));
 assert.ok(PRIVATE_OSINT_TOPICS.macro.test('ישראל מכריזה על מדיניות ריבית חדשה'));
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
 assert.equal(cfg.sources.length,7);
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

test("new macro/FX and critical-metals feeds are private only and deduplicated",async()=>{
 const config=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-macro-minerals-additions.v1.json",import.meta.url)));
 const sources=privateOsintGlobalSources();
 assert.equal(config.sources.length,7);
 assert.equal(config.scope,"PROTECTED_INTERNAL_OSINT_ONLY");
 assert.ok(config.sources.every(s=>!s.commercial_eligible&&!s.provider_rights_verified&&
  !s.access_verified_in_production&&!s.publicly_deliverable));
 for(const s of config.sources){
  const matching=sources.filter(x=>x.url===s.url);
  assert.equal(matching.length,1,s.id);
  assert.deepEqual(matching[0].categories,s.categories);
  assert.equal(matching[0].transport_verified_at_registration,false);
 }
 assert.ok(sources.length<=512);
 const selected=sources.filter(x=>
  ["private_repo8_can_boc_release","private_repo8_uk_lme_metals"].includes(x.id));
 const feed=title=>'<rss><channel><item><title>'+title+
  '</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate></item></channel></rss>';
 const testBatch=await collectPrivateOsint15m({now,normalize,resolveCountry:()=>null,
  registry:selected,fetchImpl:async url=>new Response(feed(url.includes("bankofcanada")?
   "Bank of Canada announces new monetary policy exchange rate decision":
   "London Metal Exchange reports copper and nickel minerals supply change"))});
 assert.equal(testBatch.items.length,2);
 assert.equal(testBatch.summary.selected_items_by_category.macro,1);
 assert.equal(testBatch.summary.selected_items_by_category.rare_earth,1);
 assert.ok(testBatch.items.every(x=>x.usage_rights.commercial_reuse_authorized===false));
 const denied=await collectPrivateOsint15m({now,normalize,resolveCountry:()=>null,
  registry:selected,fetchImpl:async()=>new Response("",{status:403})});
 assert.equal(denied.items.length,0);
 assert.equal(denied.summary.working_source_endpoints,0);
});

test("195x3 source-coverage priority distinguishes local, regional and global fallback health",()=>{
 const sources=privateOsintGlobalSources();
 const local={id:"coverage_test_local_aus_macro",url:"https://coverage-test.example/aus/macro",continent:"oceania",publisher_country_iso3:"AUS",categories:["macro"],supported:true};
 const regional={id:"coverage_test_regional_oceania_macro",url:"https://coverage-test.example/oceania/macro",continent:"oceania",publisher_country_iso3:null,categories:["macro"],supported:true};
 const globalMacro={id:"coverage_test_global_macro",url:"https://coverage-test.example/global/macro",continent:"global",publisher_country_iso3:null,categories:["macro"],supported:true};
 const globalGeo={id:"coverage_test_global_geo",url:"https://coverage-test.example/global/geo",continent:"global",publisher_country_iso3:null,categories:["geopolitics"],supported:true};
 const globalMinerals={id:"coverage_test_global_minerals",url:"https://coverage-test.example/global/minerals",continent:"global",publisher_country_iso3:null,categories:["rare_earth"],supported:true};
 const ref=(source,category)=>createHash("sha256").update([source.id,source.url,category].join("\n")).digest("hex");
 const checks=[
  {source_ref:ref(local,"macro"),state:"DENIED"},
  {source_ref:ref(regional,"macro"),state:"OBSERVED"},
  {source_ref:ref(globalMacro,"macro"),state:"OBSERVED"},
  {source_ref:ref(globalGeo,"geopolitics"),state:"OBSERVED"},
  {source_ref:ref(globalMinerals,"rare_earth"),state:"EMPTY_OR_OUTSIDE_WINDOW"},
 ];
 const items=[{country_iso3:"AUS",category:"macro"},{country_iso3:"AUS",category:"rare_earth"}];
 const matrix=privateOsintCountryCategoryCoverage([...sources,local,regional,globalMacro,globalGeo,globalMinerals],checks,items,{includeCells:true});
 const ausMacro=matrix.cells.find(c=>c.country_iso3==="AUS"&&c.category==="macro");
 const ausGeo=matrix.cells.find(c=>c.country_iso3==="AUS"&&c.category==="geopolitics");
 const ausRare=matrix.cells.find(c=>c.country_iso3==="AUS"&&c.category==="rare_earth");
 assert.equal(ausMacro.local.healthy,0);
 assert.equal(ausMacro.regional.healthy,1);
 assert.equal(ausMacro.source_tier_status,"REGIONAL_FALLBACK_HEALTHY");
 assert.equal(ausMacro.observed_private_items_this_tick,1);
 assert.equal(ausGeo.source_tier_status,"GLOBAL_FALLBACK_HEALTHY");
 assert.equal(ausRare.global.healthy,1);
 assert.equal(ausRare.source_tier_status,"GLOBAL_FALLBACK_HEALTHY");
 assert.equal(ausRare.observed_private_items_this_tick,1);
 assert.equal(ausRare.event_country_verified,false);
 assert.equal(ausRare.commercially_eligible,false);
});

test("new regional macro/minerals and maritime corridor candidates are deduplicated, bounded, private",async()=>{
 const additions=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-regional-corridor-additions.v1.json",import.meta.url),"utf8"));
 assert.equal(additions.sources.length,32);
 const complete=privateOsintGlobalSources();
 assert.ok(complete.length<=512);
 assert.equal(new Set(complete.map(s=>s.url)).size,complete.length);
 for(const item of additions.sources){
  const found=complete.filter(s=>s.url===item.url);
  assert.equal(found.length,1,item.id);
  const canonicalId=item.id==="private_expansion_ungeneva_press_rss"?"ungeneva_press_global":item.id;
   assert.equal(found[0].id,canonicalId,item.id);
  assert.equal(found[0].transport_verified_at_registration,false);
  assert.equal(found[0].commercial_eligible,false);
  assert.equal(found[0].publicly_deliverable,false);
 }
 const selected=complete.filter(s=>[
  "private_expansion_wto_trade_news",
  "private_expansion_mining_dot_com",
 ].includes(s.id));
 const rss='<rss><channel><item><title>WTO publishes inflation economic trade statistics update</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate></item></channel></rss>';
 const minerals='<rss><channel><item><title>Global mining industry announces lithium and rare-earth mineral supply changes</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate></item></channel></rss>';
 const mock=await collectPrivateOsint15m({now,registry:selected,normalize,resolveCountry:()=>null,
  fetchImpl:async url=>new Response(url.includes("mining.com")?minerals:rss)});
 assert.equal(mock.summary.selected_items_by_category.macro,1);
 assert.equal(mock.summary.selected_items_by_category.rare_earth,1);
 assert.equal(mock.summary.corridor_discovery_reference_coverage.commercial_delivery_enabled,false);
 const blocked=await collectPrivateOsint15m({now,registry:selected,normalize,resolveCountry:()=>null,
  fetchImpl:async()=>new Response("",{status:403})});
 assert.equal(blocked.items.length,0);
 assert.equal(blocked.summary.working_source_endpoints,0);
});

test("regional official and sector feeds are deduplicated private candidates, and synthetic observations remain unverified",async()=>{
 const additions=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-regional-corridor-additions.v1.json",import.meta.url),"utf8"));
 const complete=privateOsintGlobalSources();
 const ids=["private_expansion_au_industry_news","private_expansion_za_dsti_news",
  "private_expansion_za_sars_news","private_expansion_kr_msit_press",
  "private_expansion_ind_tax_press","private_expansion_ph_pna_news"];
 const selected=complete.filter(s=>ids.includes(s.id));
 assert.equal(selected.length,6);
 assert.ok(additions.sources.some(s=>s.id==="private_expansion_ph_pna_news"&&s.categories[0]==="geopolitics"));
 assert.ok(additions.sources.filter(s=>ids.includes(s.id)).every(s=>
  s.activation_state==="RUNTIME_PROBE_REQUIRED"&&s.provider_rights_verified===false&&
  s.commercial_eligible===false&&s.access_verified_in_production===false&&
  s.publicly_deliverable===false&&typeof s.provenance_note==="string"&&
  typeof s.discovery_reference_url==="string"&&
  new URL(s.discovery_reference_url).protocol==="https:"));
 const bodyFor=url=>{
  const title=url.includes("industry.gov.au")
   ?"Australia announces critical minerals lithium and rare-earth processing project"
   :url.includes("dsti.gov.za")
    ?"South Africa announces critical minerals research and rare-earth mineral policy"
    :url.includes("sars.gov.za")
     ?"South Africa customs announces new import tariffs and trade policy measures"
     :url.includes("msit.go.kr")
      ?"Korea announces critical minerals lithium and rare-earth policy"
      :url.includes("incometaxindia.gov.in")
       ?"India income tax department issues new tax policy and revenue administration update"
       :"Philippines government announces border security treaty and diplomatic agreement";
  return "<rss><channel><item><title>"+title+
   "</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate><link>https://example.org/story</link></item></channel></rss>";
 };
 const result=await collectPrivateOsint15m({now,registry:selected,normalize,resolveCountry:()=>null,
  fetchImpl:async url=>new Response(bodyFor(url),{status:200,headers:{"content-type":"application/rss+xml"}})});
 assert.equal(result.summary.source_endpoints_attempted,6);
 assert.equal(result.summary.source_states.OBSERVED,6);
 assert.equal(result.items.length,6);
 assert.equal(result.summary.selected_items_by_category.geopolitics,1);
 assert.equal(result.summary.selected_items_by_category.macro,2);
 assert.equal(result.summary.selected_items_by_category.rare_earth,3);
 assert.ok(result.items.every(item=>item.usage_rights.commercial_reuse_authorized===false));
 assert.equal(result.summary.publicly_served,false);
 assert.equal(result.summary.rights_verified,false);
 const coverage=privateOsintPublisherCountryCoverage(selected,result.checks,{includeDetails:true});
 assert.ok(coverage.working_country_category_cells>=6);
 assert.ok(coverage.by_country.AUS.working_categories.includes("rare_earth"));
 assert.ok(coverage.by_country.ZAF.working_categories.includes("macro"));
 assert.ok(coverage.by_country.PHL.working_categories.includes("geopolitics"));
 assert.ok(coverage.by_country.IND.working_categories.includes("macro"));
});

test("official local/regional feeds are source-registered with correct categories and current-tick probes",async()=>{
 const additions=JSON.parse(readFileSync(new URL("../../config/private-osint-regional-corridor-additions.v1.json",import.meta.url),"utf8"));
 const all=privateOsintGlobalSources();
 assert.equal(additions.sources.length,32);
 const ids=[
  "private_expansion_adb_asia_pacific",
  "private_expansion_bw_bankofbotswana_fx",
  "private_expansion_bw_bankofbotswana_press",
  "private_expansion_nrcan_atom",
  "private_expansion_statcan_trade_atom",
  "private_expansion_statcan_business_atom",
  "private_expansion_eurostat_economy_atom",
  "private_expansion_eurostat_trade_atom",
  "private_expansion_uk_dbt_atom",
  "private_expansion_uk_fcdo_atom",
 ];
 const selected=all.filter(s=>ids.includes(s.id));
 assert.equal(selected.length,ids.length);
 const byId=new Map(additions.sources.map(s=>[s.id,s]));
 for(const id of ids){
  const row=byId.get(id);
  assert.ok(row,id);
  assert.ok(row.discovery_reference_url,id);
  assert.ok(row.provenance_note.length>25,id);
  assert.equal(row.activation_state,"RUNTIME_PROBE_REQUIRED",id);
  assert.equal(row.provider_rights_verified,false,id);
  assert.equal(row.commercial_eligible,false,id);
  assert.equal(row.access_verified_in_production,false,id);
  assert.equal(row.publicly_deliverable,false,id);
 }
 assert.equal(byId.get("private_expansion_nrcan_atom").type,"atom");
 assert.ok(byId.get("private_expansion_nrcan_atom").categories.includes("rare_earth"));
 assert.ok(byId.get("private_expansion_uk_fcdo_atom").categories.includes("geopolitics"));
 assert.ok(byId.get("private_expansion_eurostat_economy_atom").categories.includes("macro"));
 const atom=(title)=>"<feed xmlns=\"http://www.w3.org/2005/Atom\"><title>source feed</title><entry><title>"+title+"</title><published>2026-10-25T11:55:00Z</published><updated>2026-10-25T11:55:00Z</updated><link href=\"https://example.org/story\" rel=\"alternate\"/></entry></feed>";
 const rss=(title)=>"<rss version=\"2.0\"><channel><item><title>"+title+"</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate><link>https://example.org/story</link></item></channel></rss>";
 const cases=[
  ["private_expansion_uk_fcdo_atom","geopolitics","UK foreign office announces new ceasefire and diplomatic sanctions statement"],
  ["private_expansion_eurostat_economy_atom","macro","Eurostat reports inflation and GDP economic statistics"],
  ["private_expansion_nrcan_atom","rare_earth","Canada announces critical minerals lithium and rare-earth supply policy"],
 ];
 const probe=selected.filter(s=>cases.some(c=>c[0]===s.id));
 const result=await collectPrivateOsint15m({now,registry:probe,normalize,resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
  fetchImpl:async url=>{
   const source=probe.find(s=>s.url===url);
   const title=cases.find(c=>c[0]===source.id)[2];
   return new Response(source.type==="atom"?atom(title):rss(title),{status:200,headers:{"content-type":source.type==="atom"?"application/atom+xml":"application/rss+xml"}});
  }});
 assert.equal(result.summary.source_endpoints_attempted,3);
 assert.ok(result.checks.length>=4);
 assert.equal(result.summary.selected_items_by_category.geopolitics,1);
 assert.ok(result.summary.selected_items_by_category.macro>=1);
 assert.ok(result.summary.selected_items_by_category.rare_earth>=1);
 const health=result.summary.category_live_source_coverage;
 assert.equal(health.categories_with_any_healthy_feed_this_tick,3);
 assert.equal(health.all_categories_have_healthy_feed_this_tick,true);
 assert.deepEqual(health.category_coverage.map(row=>row.category),["geopolitics","macro","rare_earth"]);
 assert.ok(health.category_coverage.every(row=>row.status==="LIVE_FEED_HEALTHY_THIS_TICK"));
 assert.ok(result.items.every(item=>item.usage_rights.commercial_reuse_authorized===false));
 assert.equal(result.summary.publicly_served,false);
 assert.equal(result.summary.rights_verified,false);
 const blocked=await collectPrivateOsint15m({now,registry:probe,normalize,resolveCountry:()=>null,fetchImpl:async()=>new Response("",{status:403})});
 assert.equal(blocked.summary.category_live_source_coverage.categories_with_any_healthy_feed_this_tick,0);
 assert.ok(blocked.summary.category_live_source_coverage.category_coverage.every(row=>row.status==="NO_HEALTHY_FEED_THIS_TICK"));
});
test("new Botswana and Thailand official RSS feeds improve local publisher-country coverage",async()=>{
 const additions=JSON.parse(readFileSync(new URL("../../config/private-osint-regional-corridor-additions.v1.json",import.meta.url),"utf8"));
 const all=privateOsintGlobalSources();
 const ids=["private_expansion_bw_bankofbotswana_news","private_expansion_th_mdes_news"];
 const selected=all.filter(s=>ids.includes(s.id));
 assert.equal(selected.length,2);
 assert.equal(additions.sources.length,32);
 const byId=new Map(additions.sources.map(s=>[s.id,s]));
 assert.equal(byId.get(ids[0]).url,"https://www.bankofbotswana.bw/rss/latest_news");
 assert.equal(byId.get(ids[1]).url,"https://mdes.go.th/news/rss/3");
 for(const id of ids){
  const entry=byId.get(id);
  assert.ok(entry.discovery_reference_url);
  assert.ok(entry.provenance_note.length>25);
  assert.equal(entry.activation_state,"RUNTIME_PROBE_REQUIRED");
  assert.equal(entry.provider_rights_verified,false);
  assert.equal(entry.commercial_eligible,false);
  assert.equal(entry.publicly_deliverable,false);
 }
 const feed=(title)=>"<rss><channel><item><title>"+title+"</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate><link>https://example.org/story</link></item></channel></rss>";
 const result=await collectPrivateOsint15m({now,registry:selected,normalize,
  resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
  fetchImpl:async url=>new Response(feed(url.includes("bankofbotswana")
   ?"Botswana central bank announces inflation monetary policy and interest-rate decision"
   :"Thailand ministry announces cybersecurity security policy and digital economy regulation"),
   {status:200,headers:{"content-type":"application/rss+xml"}})});
 assert.equal(result.summary.source_endpoints_attempted,2);
 assert.equal(result.checks.length,4);
 assert.equal(result.summary.selected_items_by_category.macro,2);
 assert.equal(result.summary.selected_items_by_category.geopolitics,1);
 assert.deepEqual(new Set(result.items.map(x=>x.country_iso3)),new Set(["BWA","THA"]));
 const matrix=privateOsintCountryCategoryCoverage(all,result.checks,result.items,{includeCells:true});
 const botswana=matrix.cells.find(x=>x.country_iso3==="BWA"&&x.category==="macro");
 const thailandMacro=matrix.cells.find(x=>x.country_iso3==="THA"&&x.category==="macro");
 const thailandGeo=matrix.cells.find(x=>x.country_iso3==="THA"&&x.category==="geopolitics");
 assert.ok(botswana.local.healthy>0);
 assert.equal(botswana.source_tier_status,"LOCAL_SOURCE_HEALTHY");
 assert.ok(thailandMacro.local.healthy>0);
 assert.equal(thailandMacro.source_tier_status,"LOCAL_SOURCE_HEALTHY");
 assert.ok(thailandGeo.local.healthy>0);
 assert.equal(thailandGeo.source_tier_status,"LOCAL_SOURCE_HEALTHY");
 assert.equal(botswana.event_country_verified,false);
 assert.equal(thailandMacro.commercially_eligible,false);
});

test("58-corridor matrix separates reference-only routes from healthy private feeds",()=>{
 const source={id:"coverage_test_hormuz_feed",url:"https://coverage-test.example/hormuz",continent:"global",publisher_country_iso3:null,
  categories:["macro"],related_corridor_ids:["strait_of_hormuz"],supported:true};
 const sourceRef=createHash("sha256").update([source.id,source.url,"macro"].join("\n")).digest("hex");
 const report=privateOsintCorridorSourceCoverage([source],[{source_ref:sourceRef,state:"OBSERVED"}],{includeCells:true});
 assert.equal(report.corridor_count,58);
 assert.equal(report.returned_corridors,58);
 assert.ok(report.coverage.with_canonical_monitor_reference>0);
 assert.ok(report.coverage.with_overlay_reference_surface>0);
 assert.ok(report.coverage.with_private_feed_candidate>0);
 assert.ok(report.coverage.with_private_feed_healthy_this_tick>0);
 assert.equal(report.physical_flow_verified,false);
 assert.equal(report.route_geometry_certified,false);
 const hormuz=report.cells.find(x=>x.corridor_id==="strait_of_hormuz");
 assert.equal(hormuz.private_osint_feed_candidate_count,1);
 assert.equal(hormuz.private_osint_feed_sources_healthy_this_tick,1);
 assert.equal(hormuz.acquisition_status,"PRIVATE_FEED_HEALTHY_THIS_TICK");
 assert.equal(hormuz.commercially_eligible,false);
 const sundas=report.cells.find(x=>x.corridor_id==="sunda_lombok_straits");
 assert.equal(sundas.private_osint_feed_candidate_count,0);
 assert.equal(sundas.acquisition_status,"REFERENCE_ONLY_NOT_LIVE");
 assert.equal(sundas.current_disruption_verified,false);
});

test("official corridor reference overlay only covers existing named routes, never asserts live transport",()=>{
 const overlay=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-corridor-reference-overlay.v1.json",import.meta.url),"utf8"));
 const canonical=JSON.parse(readFileSync(new URL(
  "../../config/operator-corridor-source-crosswalk.v1.json",import.meta.url),"utf8"));
 const known=new Set(canonical.corridors.map(x=>x.id));
 assert.equal(overlay.sources.length,22);
 for(const source of overlay.sources){
  assert.ok(source.related_corridor_ids.every(id=>known.has(id)));
  assert.equal(source.transport_tested,false);
  assert.equal(source.auto_ingest_enabled,false);
  assert.equal(source.commercial_eligible,false);
 }
 const c=privateOsintCorridorReferenceCoverage();
 assert.equal(c.total_canonical_corridors,58);
 assert.equal(c.newly_registered_reference_surfaces,22);
 assert.ok(c.referenced_corridors>10);
 assert.equal(c.automatic_scraping_enabled,false);
 assert.equal(c.route_geometry_certified,false);
 assert.equal(c.commercial_delivery_enabled,false);
});

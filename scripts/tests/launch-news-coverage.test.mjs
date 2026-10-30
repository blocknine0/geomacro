import test from 'node:test';
import assert from 'node:assert/strict';
import {marketRelevantOfficialCommunication} from '../../src/lib/global-macro-news-policy.ts';
import {MACRO_NEWS_SOURCES,planMacroSources} from '../lib/macro-fx-metals.mjs';
import {parseMacroFeed} from '../lib/macro-fastlane-collector.mjs';
import {HOT_TOPIC_FAMILIES} from '../../src/lib/hot-topic-taxonomy.ts';
import {LAUNCH_NEWS_FAMILY_CATEGORIES,launchNewsCoveragePolicy} from '../../src/lib/launch-news-coverage.ts';
import {PRIVATE_OSINT_TOPICS,privateOsintGlobalSources} from '../lib/private-osint-global-sources.mjs';
import {COUNTRIES_195} from '../../src/lib/canonical-country-registry-195.ts';
import {rotatingPrivateCountryDiscoverySources,COUNTRY_MACRO_DISCOVERY_TERMS,COUNTRY_MINERAL_DISCOVERY_TERMS,privateOsintRuntimeSources} from '../lib/private-osint-country-rotation.mjs';
import {LAUNCH_PRIORITY_WATCHES} from '../lib/launch-priority-watch-sources.mjs';
import {collectPrivateOsint15m} from '../lib/private-osint-15m-collector.mjs';
import {normalizeReusableNewsJson} from '../../src/lib/reusable-news-json.ts';

test('all reviewed hot-topic families have ingestion routing; news policy cannot authorize a sale',()=>{
 assert.equal(HOT_TOPIC_FAMILIES.length,36,'new families require a reviewed launch coverage change');
 assert.deepEqual(new Set(Object.values(LAUNCH_NEWS_FAMILY_CATEGORIES).flat()),new Set(HOT_TOPIC_FAMILIES));
 const p=launchNewsCoveragePolicy();
 assert.equal(p.guaranteed_latency,false);
 assert.equal(p.paid_delivery_requires_request_scoped_evidence_rights_and_signature,true);
 assert.equal(p.source_registration_is_live_coverage,false);
 assert.equal(p.index_time_is_original_time,false);
 assert.equal(p.raw_redistribution_authorized,false);
});
test('runtime catches wars, corridor, systemic and mineral shocks without routing bullion to rare earths',()=>{
 for(const [category,title] of [
  ['geopolitics','Authorities report telecom internet shutdown after cyber attack'],
  ['geopolitics','Officials announce ceasefire after missile strikes'],
  ['macro','Insurers announce war risk premium increases for cargo vessels'],
  ['macro','Authorities report payment outage across settlement system'],
  ['macro','Silver industrial demand rises on solar manufacturing'],
  ['rare_earth','Officials announce strategic material shortage affecting factories'],
  ['rare_earth','Ministry announces antimony export restrictions'],
 ])assert.ok(PRIVATE_OSINT_TOPICS[category].test(title),title);
 for(const title of ['Gold reserves buying increases','Silver industrial demand rises'])
  assert.equal(PRIVATE_OSINT_TOPICS.rare_earth.test(title),false);
 assert.equal(PRIVATE_OSINT_TOPICS.macro.test('Gold medal awarded to a champion'),false);
});
test('global watches replace three existing slots and retain 195-country/512 endpoint budget',()=>{
 const base=privateOsintGlobalSources(),at=new Date('2026-10-28T07:00:00Z');
 const result=privateOsintRuntimeSources(at,base,undefined,{includeLocalGapLane:true});
 assert.ok(result.length<=base.length+49+3); // retired catalogue IDs are excluded before the 24 local + 25 country + 3 hub budget
 assert.ok(result.length<=512);
 const watch=result.filter(s=>s.launch_watch);
 assert.equal(watch.length,3);
 assert.deepEqual(new Set(watch.map(s=>s.id)),new Set(LAUNCH_PRIORITY_WATCHES.map(s=>s.id)));
 assert.deepEqual(result.slice(0,3).map(s=>s.id),watch.map(s=>s.id));
 for(const s of watch){
  const u=new URL(s.url),q=u.searchParams.get('q');
  assert.equal(u.origin,'https://news.google.com');
  assert.ok(q.endsWith('when:1d'));
  assert.equal((q.match(/\(/g)||[]).length,(q.match(/\)/g)||[]).length);
  assert.equal(s.private_discovery_index_only,true);
  assert.equal(s.continent,'global');
  assert.equal(s.index_timestamp_not_original_page_clock,true);
  assert.equal(s.commercial_eligible,false);
  assert.equal(s.publicly_deliverable,false);
 }
});
test('new watch reports ingest only as private dated unverified observations, never original-page evidence',async()=>{
 const at=new Date('2026-10-28T07:00:00Z');
 const registry=privateOsintRuntimeSources(at).filter(s=>s.launch_watch);
 const titles=['Authorities announce internet shutdown after cyber attack','Insurers announce war risk premium increases for cargo vessels','Ministry announces strategic material shortage affecting factories'];
 let originalCallbacks=0,requests=0;
 const result=await collectPrivateOsint15m({now:at,registry,normalize:normalizeReusableNewsJson,
  resolveCountry:()=>null,onOriginalCandidate:()=>{originalCallbacks++},
  fetchImpl:async()=>{requests++;return new Response('<rss><channel>'+titles.map((t,i)=>'<item><title>'+t+'</title><link>https://news.google.com/rss/articles/'+i+'</link><pubDate>Wed, 28 Oct 2026 06:55:00 GMT</pubDate></item>').join('')+'</channel></rss>')}
 });
 assert.equal(requests,3);assert.equal(originalCallbacks,0);
 assert.ok(result.items.length>0);
 assert.ok(result.items.some(i=>i.facts.event_types.includes('telecom_internet_shutdown')));
 assert.ok(result.items.some(i=>i.facts.event_types.includes('insurance_market_withdrawal_war_risk')));
 assert.ok(result.items.every(i=>i.facts.event_types.length<=12));
 for(const item of result.items){assert.equal(item.usage_rights.commercial_reuse_authorized,false);assert.equal(item.country_iso3,null);}
 const text=JSON.stringify(result.items);
 assert.ok(titles.every(t=>!text.includes(t)),'no raw titles may be persisted');
});


test('global monetary, banking, trade and leader communications use Macro without invented price reaction',()=>{
 for(const title of [
  'Fed Chair delivers remarks at a conference',
  'Bank of Canada governor speaks at a conference',
  'ECB president delivers a statement on the economy',
  'Prime minister announces new tariffs on imported goods',
  'Finance minister announces borrowing plans',
  'Statistics office reports CPI inflation data',
  'Agency publishes retail sales and industrial production figures',
  'Authority publishes bank liquidity and non-performing loans data',
  'Officials announce shipping restrictions in the Strait of Hormuz',
 ]){
  assert.equal(PRIVATE_OSINT_TOPICS.macro.test(title),true,title);
  const item=normalizeReusableNewsJson({category:'macro',text:title,published_at:'2026-10-28T06:55:00.000Z',license:'unknown'});
  assert.equal(item.usage_rights.commercial_reuse_authorized,false);
  assert.ok(item.facts.event_types.length>0,title);
 }
 assert.equal(marketRelevantOfficialCommunication('President gives birthday greetings'),false);
 assert.equal(marketRelevantOfficialCommunication('A famous actor gives an interview'),false);
 assert.equal(marketRelevantOfficialCommunication('Prime minister announces trade tariffs'),true);
});
test('official Fed speeches poll every admitted fastlane slot inside the original nine-source ceiling',()=>{
 const at=Date.parse('2026-10-28T07:00:00Z');
 for(let i=0;i<12;i++)for(const reusedIds of [[],['fed_press','ecb_press']]){
  const plan=planMacroSources(at+i*300000,{reusedIds});
  assert.ok(plan.length<=9);assert.ok(plan.some(s=>s.id==='fed_speeches'));
 }
 const spec=MACRO_NEWS_SOURCES.find(s=>s.id==='fed_speeches');
 const xml='<rss><channel><item><title>Speech by Governor on the long term outlook</title><link>https://www.federalreserve.gov/newsevents/speech/governor20261028a.htm</link><pubDate>Wed, 28 Oct 2026 06:55:00 GMT</pubDate></item></channel></rss>';
 assert.equal(parseMacroFeed(xml,spec,at).length,1);
 assert.equal(parseMacroFeed(xml.replace('www.federalreserve.gov','attacker.example'),spec,at).length,0);
 assert.equal(parseMacroFeed(xml.replace('06:55:00','07:55:00'),spec,at).length,0);
});

test('all 195 countries receive explicit macro search coverage within the unchanged eight-slot local-lane cycle',()=>{
 const at=Date.parse('2026-10-28T07:00:00Z'),seen=new Set();
 for(let slot=0;slot<8;slot++){
  const sources=rotatingPrivateCountryDiscoverySources(new Date(at+slot*15*60000),COUNTRIES_195,25);
  assert.ok(sources.length<=25);
  for(const source of sources){
   const q=new URL(source.url).searchParams.get('q');
   for(const term of COUNTRY_MACRO_DISCOVERY_TERMS)assert.ok(q.includes(term));
   assert.ok(source.categories.includes('macro'));
   assert.equal(source.publisher_country_iso3,null);
   assert.equal(source.index_timestamp_not_original_page_clock,true);
   assert.equal(source.publicly_deliverable,false);
   seen.add(source.discovery_country_iso3);
  }
 }
 assert.deepEqual(seen,new Set(COUNTRIES_195.map(c=>c.iso3)));
 const policy=launchNewsCoveragePolicy().country_macro_routing;
 assert.equal(policy.countries,seen.size);assert.equal(policy.nominal_cycle_minutes,120);
 assert.equal(policy.full_current_coverage_asserted,false);
});


test('195-country mineral lifecycle discovery preserves attribution, macro coverage and bounded rotation',()=>{
 const at=Date.parse('2026-10-28T07:00:00Z'),seen=new Set();
 for(let slot=0;slot<8;slot++){
  const sources=privateOsintRuntimeSources(new Date(at+slot*15*60000),undefined,undefined,{includeLocalGapLane:true});
  assert.ok(sources.length<=512);
  const countries=sources.filter(s=>s.id.startsWith('private_country_index_'));
  assert.ok(countries.length<=25);
  for(const source of countries){
   const q=new URL(source.url).searchParams.get('q');
   for(const term of [...COUNTRY_MACRO_DISCOVERY_TERMS,...COUNTRY_MINERAL_DISCOVERY_TERMS])assert.ok(q.includes(term),term);
   assert.ok(source.url.length<2000,'bounded single source request');
   assert.ok(source.categories.includes('rare_earth'));
   assert.equal(source.publisher_country_iso3,null);
   assert.equal(source.commercial_eligible,false);
   assert.equal(source.publicly_deliverable,false);
   seen.add(source.discovery_country_iso3);
  }
 }
 assert.deepEqual(seen,new Set(COUNTRIES_195.map(c=>c.iso3)));
 const policy=launchNewsCoveragePolicy().country_minerals_routing;
 assert.equal(policy.countries,seen.size);
 assert.equal(policy.nominal_cycle_minutes,120);
 assert.equal(policy.full_current_coverage_asserted,false);
 assert.equal(policy.bullion_category,'macro');
 for(const title of [
  'Ministry approves lithium mine permit and processing plant investment',
  'Government changes mining royalties for copper production',
  'Company announces graphite mineral recycling and offtake agreement',
  'Antimony smelter outage disrupts export supply',
  'Survey revises rare earth mineral reserves',
 ])assert.ok(PRIVATE_OSINT_TOPICS.rare_earth.test(title),title);
});

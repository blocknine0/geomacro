import test from 'node:test';
import assert from 'node:assert/strict';
import {HOT_TOPIC_FAMILIES} from '../../src/lib/hot-topic-taxonomy.ts';
import {LAUNCH_NEWS_FAMILY_CATEGORIES,launchNewsCoveragePolicy} from '../../src/lib/launch-news-coverage.ts';
import {PRIVATE_OSINT_TOPICS,privateOsintGlobalSources} from '../lib/private-osint-global-sources.mjs';
import {privateOsintRuntimeSources} from '../lib/private-osint-country-rotation.mjs';
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
 assert.equal(result.length,base.length+49);
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
 for(const item of result.items){assert.equal(item.usage_rights.commercial_reuse_authorized,false);assert.equal(item.country_iso3,null);}
 const text=JSON.stringify(result.items);
 assert.ok(titles.every(t=>!text.includes(t)),'no raw titles may be persisted');
});

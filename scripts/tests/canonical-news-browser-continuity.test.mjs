import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCurrentCanonicalWebsiteNews} from '../../src/lib/public-derived-news-client.ts';
import {readIncrementalWebsiteCategoryFeed} from '../../workers/control-plane/src/website-incremental-feed.mjs';
const now=Date.parse('2026-11-07T15:00:00.000Z');
const cats=['geopolitics','macro','rare_earth'];
const signal=category=>({id:category+'-1234abcd',category,
 title:'Geomacro finds monetary policy update for bank liquidity',
 what_changed:'An official publisher issued a monetary policy update concerning liquidity.',
 why_it_matters:'A change in funding conditions may affect financing and foreign exchange risk.',
 topic:'monetary policy',geography:null,development_type:'monetary policy',
 published_at:new Date(now-3600000).toISOString(),date_precision:'exact',
 observed_release_count:1,sources_credited:[],status:'official_release_observed_unscored',
 same_event_corrob_verified:false,severity:null});
const response=(category,{originHeader=null,change={}}={})=>Response.json({
 ok:true,schema:'geomacro.canonical-category-edge-feed.v1',category,checked_at:new Date(now).toISOString(),
 source:'CANONICAL_WEBSITE_D1_JOURNAL',original_publisher_text_redistributed:false,
 origin_readback:'D1_CANONICAL',gro_verified_publication:false,independent_event_verified:false,
 scored:false,chargeable:false,journal_retention_hours:72,rows_returned:1,signals:[signal(category)],...change
},{headers:originHeader===null?{}:{'X-GeoMacro-Data-Origin':originHeader}});
test('browser-filtered custom header does not erase a fully validated three-category feed',async()=>{
 const calls=[];
 const read=async url=>{calls.push(url);return response(url.split('/').at(-1));};
 const rows=await fetchCurrentCanonicalWebsiteNews(read,now);
 assert.equal(rows.length,3);assert.deepEqual(new Set(rows.map(x=>x.category)),new Set(cats));
 assert.equal(calls.length,3);assert.ok(calls.every(x=>x.includes('/api/v1/feed/')));
});
test('one failed or malformed category does not suppress the other independently validated categories',async()=>{
 const rows=await fetchCurrentCanonicalWebsiteNews(async url=>{
  const c=url.split('/').at(-1);
  return c==='geopolitics'?new Response('unavailable',{status:404}):response(c);
 },now);
 assert.deepEqual(new Set(rows.map(x=>x.category)),new Set(['macro','rare_earth']));
});
test('visible origin mismatch, forged body, wrong category, stale and future clocks are rejected',async()=>{
 const cases=[{originHeader:'some-other-store'},
  {change:{origin_readback:'UNVERIFIED'}},{change:{scored:true}},{change:{chargeable:true}},
  {change:{category:'other'}},{change:{checked_at:new Date(now-120001).toISOString()}},
  {change:{checked_at:new Date(now+60001).toISOString()}}];
 for(const options of cases)await assert.rejects(fetchCurrentCanonicalWebsiteNews(
  async url=>response(url.split('/').at(-1),options),now),/CANONICAL_CATEGORY/);
});
test('Worker exposes provenance headers for actual cross-origin browser clients',async()=>{
 const s=signal('macro');
 const db={prepare(){return {bind(){return {all:async()=>({results:[{id:s.id,category:s.category,
  published_at:s.published_at,date_precision:s.date_precision,story_json:JSON.stringify(s),first_seen_at:s.published_at}]})}}}}};
 const out=await readIncrementalWebsiteCategoryFeed({DB:db},'macro',now);
 assert.equal(out.status,200);
 assert.match(out.headers.get('Access-Control-Expose-Headers'),/X-GeoMacro-Data-Origin/);
 assert.equal(out.headers.get('X-GeoMacro-Data-Origin'),'canonical-d1');
});

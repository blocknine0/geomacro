import test from 'node:test';
import assert from 'node:assert/strict';
import {MINERALS_MESH,MINERALS_SOURCE_IDS}
 from '../lib/critical-minerals-registry.mjs';
import {collectCriticalMineralsFastlane} from '../lib/critical-minerals-fastlane.mjs';
test('known unavailable or restricted feeds are not actively polled as commercial originals',()=>{
 const all=MINERALS_MESH.flatMap(g=>[g.primary,g.fallback]).filter(Boolean);
 assert.equal(all.some(s=>s.url==='https://www.adb.org/rss.xml'),false);
 assert.equal(all.some(s=>s.url==='https://www.industry.gov.au/news.xml'),false);
 assert.equal(all.some(s=>s.url==='https://www.fxstreet.com/rss/news'),false);
 assert.equal(MINERALS_SOURCE_IDS.includes('fxstreet_news'),false);
 const au=MINERALS_MESH.find(g=>g.region==='oceania');
 assert.equal(au.primary.url,'https://www.minister.industry.gov.au/feed/t-ayres/rss.xml');
 const asia=MINERALS_MESH.find(g=>g.region==='asia');
 assert.equal(asia.primary,null);
 assert.equal(asia.fallback.url,'https://www.energy.gov/rss/energygov/2193718');
 assert.equal(asia.fallback.region,'global');
});
test('denied upstream official fallback fails closed, not minted as verified Asia event',async()=>{
 const requests=[];
 const report=await collectCriticalMineralsFastlane({now:Date.parse('2026-11-18T10:00:00Z'),
  fetchImpl:async url=>{requests.push(url);return new Response(null,{status:403})}});
 assert.equal(report.receipt.raw_content_persisted,false);
 assert.equal(report.receipt.all_country_events_guaranteed,false);
 assert.equal(report.signals.length,0);
 const requestedHosts=new Set(requests.map(value=>new URL(value).hostname));
 assert.equal(requestedHosts.has('www.adb.org'),false);
 assert.equal(requestedHosts.has('www.fxstreet.com'),false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {privateOsintGlobalHubSources,GLOBAL_HUB_OVERLAY_COUNT} from "./private-osint-global-hub-overlay.mjs";
import {privateOsintGlobalSources} from "./private-osint-global-sources.mjs";
import {privateOsintRuntimeSources} from "./private-osint-country-rotation.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";

const at=new Date("2026-10-31T00:00:00.000Z");
const slot=15*60000;
const normalize=x=>({schema:"geomacro.reusable-news-json.v1",
 category:x.category,country_iso3:null,
 source:{publisher_name:null,original_url:null,original_published_at:x.published_at},
 delivery:{raw_article_included:false},usage_rights:{commercial_reuse_authorized:false}});

test("global multilateral hub candidates are pinned, discovery-only and never grant source rights",()=>{
 const hubs=privateOsintGlobalHubSources();
 assert.equal(hubs.length,GLOBAL_HUB_OVERLAY_COUNT);
 assert.equal(hubs.length,3);
 assert.equal(new Set(hubs.map(x=>x.url)).size,3);
 assert.deepEqual(hubs.map(s=>s.categories),[
  ["macro"],["geopolitics","macro","rare_earth"],["geopolitics"]]);
 for(const source of hubs){
  assert.equal(new URL(source.url).protocol,"https:");
  assert.equal(source.type,"rss");
  assert.equal(source.publisher_native_dates_required,true);
  assert.equal(source.transport_verified_at_registration,false);
  assert.equal(source.commercial_eligible,false);
  assert.equal(source.provider_rights_verified,false);
  assert.equal(source.publicly_deliverable,false);
 }
});

test("real 463-source registry adds 3 candidate hubs without any extra fetch, dedup or missing country",()=>{
 const base=privateOsintGlobalSources();
 assert.equal(base.length,463);
 const hubs=privateOsintGlobalHubSources();
 const union=new Set();
 for(let n=0;n<9;n++){
  const now=new Date(at.getTime()+slot*n);
  const sources=privateOsintRuntimeSources(now,base,COUNTRIES_195,{includeLocalGapLane:true});
  assert.equal(sources.length,512);
  assert.equal(new Set(sources.map(x=>x.url)).size,512);
  assert.equal(sources.filter(x=>x.private_country_local_candidate).length,24);
  assert.equal(sources.filter(x=>x.private_discovery_index_only).length,
   n===8?19:22);
  for(const hub of hubs)assert.equal(sources.filter(s=>s.url===hub.url).length,1);
  for(const row of sources.filter(s=>s.private_discovery_index_only))union.add(row.discovery_country_iso3);
 }
 assert.equal(union.size,195);
 assert.deepEqual(union,new Set(COUNTRIES_195.map(x=>x.iso3)));
});

test("a verified-native RSS hub report enters private collector; denial and missing clock do not",async()=>{
 const [bis]=privateOsintGlobalHubSources();
 const body='<rss><channel><item><title>Central bank announces inflation monetary policy decision</title>'+
  '<link>https://www.bis.org/review/r261031a.htm</link>'+
  '<pubDate>Sat, 31 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>';
 const opts={now:new Date("2026-10-31T00:05:00.000Z"),registry:[bis],normalize,
  resolveCountry:()=>null};
 const good=await collectPrivateOsint15m({...opts,fetchImpl:async()=>new Response(body,{status:200})});
 assert.equal(good.items.length,1);
 assert.equal(good.items[0].category,"macro");
 assert.equal(good.items[0].usage_rights.commercial_reuse_authorized,false);
 const denied=await collectPrivateOsint15m({...opts,fetchImpl:async()=>new Response("",{status:403})});
 assert.equal(denied.items.length,0);
 const missingClock=await collectPrivateOsint15m({...opts,fetchImpl:async()=>new Response(body.replace(/<pubDate>[^<]+<\\/pubDate>/u,""),{status:200})});
 assert.equal(missingClock.items.length,0);
});

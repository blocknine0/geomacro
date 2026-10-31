import test from "node:test";
import assert from "node:assert/strict";
import {privateOsintOfficialPrioritySources,OFFICIAL_PRIORITY_CANDIDATE_COUNT} from "./private-osint-official-priority-sources.mjs";
import {privateOsintRuntimeSources} from "./private-osint-country-rotation.mjs";
import {privateOsintGlobalSources} from "./private-osint-global-sources.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {PRIVATE_OSINT_RETIRED_SOURCE_IDS} from "./private-osint-retired-sources.mjs";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";
const at=new Date("2026-10-31T12:00:00Z");
test("six issuer-pinned priority candidates remain private, dated and never presumed paid-qualified",()=>{
 const sources=privateOsintOfficialPrioritySources();
 assert.equal(sources.length,OFFICIAL_PRIORITY_CANDIDATE_COUNT);
 assert.equal(sources.length,6);
 assert.equal(new Set(sources.map(s=>s.url)).size,sources.length);
 for(const s of sources){
  assert.equal(s.publisher_native_dates_required,true);
  assert.equal(s.transport_verified_at_registration,false);
  assert.equal(s.commercial_eligible,false);
  assert.equal(s.publicly_deliverable,false);
  assert.equal(s.private_priority_official,true);
 }
});
test("all priority candidates join every 15-minute tick, excluding retired and duplicate URLs within 512 GETs",()=>{
 const active=privateOsintGlobalSources();
 const retirement=new Set(PRIVATE_OSINT_RETIRED_SOURCE_IDS);
 const newSources=privateOsintOfficialPrioritySources();
 for(let slot=0;slot<8;slot++){
  const batch=privateOsintRuntimeSources(new Date(at.getTime()+slot*900000),active,COUNTRIES_195,{includeLocalGapLane:true});
  assert.ok(batch.length<=512);
  assert.equal(new Set(batch.map(s=>s.url)).size,batch.length);
  assert.ok(batch.every(s=>!retirement.has(s.id)));
  for(const s of newSources)assert.equal(batch.filter(row=>row.url===s.url).length,1);
  assert.equal(batch.filter(s=>s.private_country_local_candidate).length,24);
 }
});
test("publisher HTTP denial or missing native publication time cannot create a qualified item",async()=>{
 const [source]=privateOsintOfficialPrioritySources();
 const opts={now:at,registry:[source],normalize:item=>({schema:"geomacro.reusable-news-json.v1",
  category:item.category,country_iso3:null,source:{publisher_name:null,original_url:null,original_published_at:item.published_at},
  delivery:{raw_article_included:false},usage_rights:{commercial_reuse_authorized:false}}),resolveCountry:()=>null};
 const xml='<rss><channel><item><title>Australia announces new lithium mining project</title><link>https://www.ga.gov.au/news/critical-minerals</link><pubDate>Sat, 31 Oct 2026 11:55:00 GMT</pubDate></item></channel></rss>';
 const live=await collectPrivateOsint15m({...opts,fetchImpl:async()=>new Response(xml,{status:200})});
 assert.ok(live.items.length>0);
 assert.ok(live.items.every(i=>i.usage_rights?.commercial_reuse_authorized===false));
 const denied=await collectPrivateOsint15m({...opts,fetchImpl:async()=>new Response("",{status:403})});
 assert.equal(denied.items.length,0);
 const undated=await collectPrivateOsint15m({...opts,fetchImpl:async()=>new Response(xml.replace(/<pubDate>.*?<\/pubDate>/u,""),{status:200})});
 assert.equal(undated.items.length,0);
});

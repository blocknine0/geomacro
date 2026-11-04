import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {threeDomainGlobal20mPublisherRegistry,GLOBAL_DIRECT_20M_MAX_REQUESTS}
 from "./three-domain-global-direct-20m-sources.mjs";
import {hot50Direct20mPublisherRegistry} from "./hot-50-direct-20m-sources.mjs";
import {PRIVATE_OSINT_RETIRED_SOURCE_IDS}
 from "./private-osint-retired-sources.mjs";

const now=new Date("2026-11-04T03:00:00Z");
const categories=["geopolitics","macro","rare_earth"];
test("true 20-minute production registry includes all Hot-50 native feeds plus non-Hot50 global native feeds",()=>{
 const hot=hot50Direct20mPublisherRegistry().registry;
 const {registry,summary}=threeDomainGlobal20mPublisherRegistry(now);
 const urls=new Set(registry.map(x=>x.url));
 assert.equal(GLOBAL_DIRECT_20M_MAX_REQUESTS,512);
 assert.ok(registry.length>hot.length, "not merely the Hot-50 subset");
 assert.ok(registry.length<=504);
 assert.equal(new Set(registry.map(x=>x.url)).size,registry.length);
 assert.equal(summary.hot50_distinct_direct_feeds_pinned,hot.length);
 assert.ok(hot.every(x=>urls.has(x.url)), "never omit a pinned Hot-50 direct source");
 assert.deepEqual([...summary.categories_configured],categories);
 assert.ok(categories.every(x=>registry.some(s=>s.categories.includes(x))));
 assert.equal(summary.google_index_urls_polled,0);
 assert.equal(summary.telegram_messages_polled,0);
 assert.equal(summary.paid_credentials_used,0);
 assert.ok(registry.every(x=>!x.private_discovery_index_only&&
  x.publisher_native_dates_required===true&&
  x.commercial_eligible===false&&
  x.publicly_deliverable===false&&
  x.original_article_verified===false&&
  !PRIVATE_OSINT_RETIRED_SOURCE_IDS.includes(x.id)));
 assert.ok(registry.every(x=>{
  const u=new URL(x.url);
  return u.protocol==="https:"&&u.hostname!=="news.google.com"&&
   u.hostname!=="t.me"&&u.username===""&&u.password==="";
 }));
});
test("over-cap global nonpriority direct publishers fairly rotate without losing Hot-50 or exceeding 512 GETs",()=>{
 const hot=hot50Direct20mPublisherRegistry().registry;
 const global=Array.from({length:430},(_,i)=>({
  id:"private_test_global_"+i,url:"https://pinned.example.org/news/"+i+".xml",
  type:"rss",categories:[categories[i%3]],supported:true,
 }));
 const seen=new Set();
 const firstSlot=Math.floor(now.getTime()/1200000);
 const aligned=new Date(firstSlot*1200000);
 for(let slot=0;slot<2;slot++){
  const {registry,summary}=threeDomainGlobal20mPublisherRegistry(
   new Date(aligned.getTime()+slot*1200000),{base:global,hot50:hot});
  const urls=new Set(registry.map(x=>x.url));
  assert.equal(registry.length,504);
  assert.equal(summary.other_direct_feeds_deferred_this_tick,35);
  assert.ok(hot.every(x=>urls.has(x.url)));
  for(const src of registry)if(src.id.startsWith("private_test_global_"))
   seen.add(src.id);
 }
 assert.equal(seen.size,430);
});
test("actual production 20m schedule admits D1 only with headroom, and otherwise keeps replayable encrypted source observations",()=>{
 const file=readFileSync(new URL(
  "../../.github/workflows/hot50-direct-original-news-20m.yml",import.meta.url),"utf8");
 assert.match(file,/cron:\s*"6,26,46 \* \* \* \*"/);
 assert.match(file,/GEOMACRO_SOURCE_REGISTRY_MODE:\s*THREE_DOMAIN_DIRECT_20M/);
 assert.match(file,/node --test scripts\/lib\/three-domain-global-direct-20m-sources.test.mjs/);
 assert.match(file,/PHASE2I_PROVIDER_SOURCE_INTAKE/);
 assert.match(file,/geomacro-permanent-news-publication/);
 assert.match(file,/scripts\/ops\/phase2i-source-only-raw-tick\.ts/);
 assert.match(file,/geomacro-private-phase2i-72h-ciphertext/);
 assert.match(file,/encrypted-held-three-domain-20m:/);
 assert.match(file,/scripts\/ops\/private-osint-stage-held\.ts/);
 assert.match(file,/geomacro-encrypted-private-osint-held/);
 assert.match(file,/source_intake != 'true'/);
 assert.match(file,/github.event_name == 'schedule'/);
 assert.doesNotMatch(file,/TELEGRAM_SESSION|TRADING_ECONOMICS_API_KEY|MARINETRAFFIC_API_KEY/);
});
test("read-only evidence from provider sources does not automatically activate paid risk gates",()=>{
 const s=readFileSync(new URL(
  "config/four-lane-free-source-rights.v1.json",new URL("../../",import.meta.url)),"utf8");
 const doc=JSON.parse(s);
 assert.equal(doc.allow_commercial_billing_from_registration,false);
 assert.equal(doc.existing_scheduled_collectors_unchanged,true);
 assert.ok(doc.providers.every(row=>row.paid_risk_gate_eligible===false));
});

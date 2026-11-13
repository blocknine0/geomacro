import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hot50Direct20mPublisherRegistry,hot50Direct20mFailoverCategories,HOT50_DIRECT_20M_FREQUENCY_MINUTES,HOT50_RETIRED_REPROBES_PER_SLOT}
 from "./hot-50-direct-20m-sources.mjs";
import {hot50FourLaneSourceCrosswalk} from "./hot-50-four-lane-source-crosswalk.mjs";
import {PRIVATE_OSINT_RETIRED_SOURCE_IDS} from "./private-osint-retired-sources.mjs";

test("all 225 catalogue pins remain auditable while retired endpoints never re-enter polling",()=>{
 const {registry,summary}=hot50Direct20mPublisherRegistry(new Date("2026-11-04T00:00:00Z"));
 const {snapshot}=hot50FourLaneSourceCrosswalk();
 assert.equal(HOT50_DIRECT_20M_FREQUENCY_MINUTES,20);
 assert.equal(snapshot.countries.length,50);
 assert.equal(summary.direct_pinned_country_entries,225);
 assert.ok(registry.length>0&&registry.length<=225);
 assert.equal(new Set(registry.map(s=>s.url)).size,registry.length);
 assert.equal(new Set(registry.map(s=>s.id)).size,registry.length);
 assert.equal(summary.distinct_nonretired_direct_endpoints,
  registry.filter(s=>s.private_hot50_retired_reprobe!==true).length);
 assert.equal(summary.retired_source_ids.length,27);
 assert.equal(HOT50_RETIRED_REPROBES_PER_SLOT,0);
 assert.equal(summary.retired_reprobes_this_tick,0);
 assert.equal(summary.previously_retired_excluded,27);
 assert.equal(summary.retired_reprobe_full_cycle_nominal_minutes,null);
 assert.equal(summary.retired_reprobe_does_not_prove_recovery,true);
 assert.ok(registry.every(s=>["rss","atom","rdf","xml","json"].includes(s.type)&&
  s.url.startsWith("https://")&&s.supported===true));
 assert.ok(registry.every(s=>!PRIVATE_OSINT_RETIRED_SOURCE_IDS.includes(s.id)||
  s.private_hot50_retired_reprobe===true&&
  s.activation_state==="RETIRED_TRANSPORT_REPROBE_ONLY"));
 assert.equal(summary.google_news_index_included,false);
 assert.equal(summary.telegram_ingestion_included,false);
 assert.ok(registry.every(s=>new URL(s.url).hostname!=="news.google.com"&&
  !new URL(s.url).hostname.endsWith("t.me")&&
  s.private_discovery_index_only===false&&
  s.private_hot50_direct_20m===true));
});

test("all Hot50 country-category discovery cells have non-retired configured lanes",()=>{
 const {snapshot}=hot50FourLaneSourceCrosswalk();
 const expected=["geopolitics","macro","rare_earth"];
 assert.equal(snapshot.countries.length,50);
 const cells=[];
 for(const country of snapshot.countries){
  assert.equal(country.google_news_category_watches.length,3,country.country_iso3);
  for(const category of expected){
   assert.ok(country.google_news_category_watches.includes(category),
    `missing search discovery lane: ${country.country_iso3}/${category}`);
   assert.equal(country.on_demand_gdelt_shared,true,
    `missing shared GDELT lane: ${country.country_iso3}/${category}`);
   const direct=country.direct_news_osint_feeds.filter(source=>source.categories.includes(category));
   cells.push({country:country.country_iso3,category,direct_candidates:direct.length,
    search_discovery:true,gdelt_discovery:true});
  }
 }
 assert.equal(cells.length,150);
 assert.equal(cells.filter(cell=>cell.direct_candidates===0).length,0);
 assert.ok(cells.every(cell=>cell.search_discovery&&cell.gdelt_discovery));
 // Historical crosswalk pins remain auditable, but the runtime registry above
 // excludes retired URLs. This discovery matrix is not proof of live feed health,
 // first-party publisher status, country-event attribution, rights or delivery.
});

test("empty or failed Hot50 primaries request existing global hub backups without rights promotion",()=>{
 const {registry,fallback_registry,cell_failover_plan}=hot50Direct20mPublisherRegistry();
 assert.equal(cell_failover_plan.length,150);
 assert.equal(fallback_registry.length,6);
 assert.ok(fallback_registry.every(x=>x.private_hot50_backup===true&&
  x.rights_verified===false&&x.commercial_eligible===false&&
  x.transport_verified_at_registration===false));
 const categories=hot50Direct20mFailoverCategories(cell_failover_plan,registry,[]);
 assert.ok(categories.includes("geopolitics"));
 assert.ok(categories.includes("rare_earth"));
});
test("three consecutive 20m slots never re-probe any permanently removed endpoint",()=>{
 const seen=new Set();
 const start=Date.parse("2026-11-04T00:00:00Z");
 const registered=hot50Direct20mPublisherRegistry(new Date(start)).summary.retired_source_ids;
 for(let i=0;i<3;i++){
  const {registry,summary}=hot50Direct20mPublisherRegistry(new Date(start+i*20*60_000));
  assert.equal(summary.retired_reprobes_this_tick,0);
  assert.equal(registry.filter(x=>x.private_hot50_retired_reprobe===true).length,0);
  for(const id of summary.retired_reprobe_ids_this_tick)seen.add(id);
 }
 assert.equal(registered.length,27);
 assert.equal(seen.size,0);
});
test("direct-only cannot obtain article, verified transport, country attribution or commercial rights from registration",()=>{
 const {registry,summary}=hot50Direct20mPublisherRegistry();
 assert.equal(summary.original_article_or_rights_verified_by_catalogue,false);
 assert.ok(registry.every(s=>s.rights_verified===false&&
  s.commercial_eligible===false&&s.publicly_deliverable===false&&
  s.transport_verified_at_registration===false&&
  s.original_article_verified===false&&
  s.publisher_native_dates_required===true));
 const cats=new Set(registry.flatMap(s=>s.categories));
 assert.deepEqual([...cats].sort(),["geopolitics","macro","rare_earth"].sort());
});
test("20m workflow has 3 cron offsets per hour, production guard, canonical D1 writer, AEAD backlog and shared mutex",()=>{
 const file=readFileSync(new URL("../../.github/workflows/hot50-direct-original-news-20m.yml",import.meta.url),"utf8");
 assert.match(file,/cron:\s*["']6,26,46 \* \* \* \*["']/);
 assert.match(file,/geomacro-permanent-news-publication/);
 assert.match(file,/scripts\/ops\/plan-d1-bundled-work\.mjs/);
 assert.match(file,/scripts\/ops\/preload-phase2i-encrypted-backlog\.mjs/);
 assert.match(file,/scripts\/ops\/phase2i-source-only-raw-tick\.ts/);
 assert.match(file,/GEOMACRO_SOURCE_REGISTRY_MODE:\s*THREE_DOMAIN_DIRECT_20M/);
 assert.match(file,/geomacro-private-phase2i-72h-ciphertext/);
 assert.match(file,/github\.event_name == 'schedule'/);
 assert.doesNotMatch(file,/private-osint-15m-tick\.ts/);
 assert.doesNotMatch(file,/workflow_run:/);
});

test("source and spool workflows keep valid event paths and secret-free if contexts",()=>{
 for(const path of ["../../.github/workflows/hot50-direct-original-news-20m.yml","../../.github/workflows/p0b-admission-tests.yml"]){
  const file=readFileSync(new URL(path,import.meta.url),"utf8");
  // GitHub rejects the whole workflow before any job when secrets is used
  // directly in an if condition or a quoted path contains literal newlines.
  assert.doesNotMatch(file,/^\s*if:.*\bsecrets\./m);
  assert.doesNotMatch(file,/['"]\\n\s*-\s*['"]/);
 }
});

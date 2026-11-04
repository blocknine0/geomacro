import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hot50Direct20mPublisherRegistry,HOT50_DIRECT_20M_FREQUENCY_MINUTES}
 from "./hot-50-direct-20m-sources.mjs";
import {hot50FourLaneSourceCrosswalk} from "./hot-50-four-lane-source-crosswalk.mjs";
import {PRIVATE_OSINT_RETIRED_SOURCE_IDS} from "./private-osint-retired-sources.mjs";

test("all 124 registered country-pinned direct candidates are reconciled once, with genuine retired endpoints excluded",()=>{
 const {registry,summary}=hot50Direct20mPublisherRegistry();
 const {snapshot}=hot50FourLaneSourceCrosswalk();
 assert.equal(HOT50_DIRECT_20M_FREQUENCY_MINUTES,20);
 assert.equal(snapshot.countries.length,50);
 assert.equal(summary.direct_pinned_country_entries,124);
 assert.ok(registry.length>0&&registry.length<=124);
 assert.equal(new Set(registry.map(s=>s.url)).size,registry.length);
 assert.equal(new Set(registry.map(s=>s.id)).size,registry.length);
 assert.equal(summary.distinct_nonretired_direct_endpoints,registry.length);
 assert.ok(registry.every(s=>["rss","atom","rdf","xml","json"].includes(s.type)&&
  s.url.startsWith("https://")&&s.supported===true));
 assert.ok(registry.every(s=>!PRIVATE_OSINT_RETIRED_SOURCE_IDS.includes(s.id)));
 assert.equal(summary.google_news_index_included,false);
 assert.equal(summary.telegram_ingestion_included,false);
 assert.ok(registry.every(s=>new URL(s.url).hostname!=="news.google.com"&&
  !new URL(s.url).hostname.endsWith("t.me")&&
  s.private_discovery_index_only===false&&
  s.private_hot50_direct_20m===true));
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

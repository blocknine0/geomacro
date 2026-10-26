import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateOsintGlobalSources,privateOsintCountryCategoryCoverage,PRIVATE_OSINT_CATEGORIES} from "./private-osint-global-sources.mjs";
import {privateOsintRuntimeSources,rotatingPrivateCountryDiscoverySources} from "./private-osint-country-rotation.mjs";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";

const config=JSON.parse(readFileSync(new URL("../../config/private-osint-national-gap-feeds.v1.json",import.meta.url),"utf8"));
const fixed=new Date("2026-10-27T06:00:00.000Z");
const normalize=row=>({
 schema:"geomacro.reusable-news-json.v1",category:row.category,
 country_iso3:row.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:row.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false},
});

test("new private national feeds occupy only available source slots and are not pre-certified",()=>{
 assert.equal(config.scope,"PROTECTED_INTERNAL_OSINT_ONLY");
 assert.equal(config.sources.length,16);
 assert.equal(new Set(config.sources.map(s=>s.publisher_country_iso3)).size,14);
 const sources=privateOsintGlobalSources();
 assert.equal(new Set(sources.map(s=>s.url)).size,sources.length);
 assert.ok(sources.length+49<=512,"leave room for all 49 canonical country discovery probes per tick");
 const rows=config.sources.map(s=>sources.find(x=>x.url===s.url));
 assert.ok(rows.every(Boolean));
 assert.ok(rows.every(s=>s.supported===true&&s.transport_verified_at_registration===false&&
  s.activation_state==="RUNTIME_PROBE_REQUIRED"&&s.publicly_deliverable===false));
 assert.ok(config.sources.every(s=>s.publisher_native_dates_required===true&&
  s.access_verified_in_production===false&&s.commercial_eligible===false));
 assert.ok(rows.every(s=>s.categories.every(c=>PRIVATE_OSINT_CATEGORIES.includes(c))));
 const runtime=privateOsintRuntimeSources(fixed,sources);
 assert.equal(runtime.length,sources.length+49);
 assert.ok(runtime.length<=512);
 assert.equal(rotatingPrivateCountryDiscoverySources(fixed).length,49);
 const matrix=privateOsintCountryCategoryCoverage(sources);
 assert.equal(matrix.expected_country_category_cells,585);
 assert.ok(matrix.country_specific_source_countries_registered>=98);
 assert.equal(matrix.coverage.cells_with_any_healthy_source,0,
  "registration must never be mistaken for a successful live fetch");
 assert.equal(matrix.coverage.observed_country_category_cells_this_tick,0);
});
test("new original-country feed only counts genuinely dated and topical stories",async()=>{
 const source=privateOsintGlobalSources().find(s=>s.id==="private_gap_ukr_cabinet");
 assert.ok(source);
 const rss="<rss><channel><item><title>Ukraine government announces new inflation, sanctions and critical minerals export rules</title>"+
   "<pubDate>Tue, 27 Oct 2026 05:56:00 GMT</pubDate></item></channel></rss>";
 const read=await collectPrivateOsint15m({
  now:fixed,registry:[source],normalize,resolveCountry:()=>null,
  fetchImpl:async()=>new Response(rss,{status:200}),
 });
 assert.equal(read.summary.working_source_endpoints,1);
 assert.ok(read.items.length>=1);
 assert.ok(read.items.every(s=>s.country_iso3===null));
 assert.ok(read.items.every(s=>s.source.original_published_at==="2026-10-27T05:56:00.000Z"));
 assert.ok(read.items.every(s=>s.delivery.raw_article_included===false));
 const denied=await collectPrivateOsint15m({
  now:fixed,registry:[source],normalize,resolveCountry:()=>null,
  fetchImpl:async()=>new Response("blocked",{status:403}),
 });
 assert.equal(denied.items.length,0);
 assert.equal(denied.summary.working_source_endpoints,0);
 assert.ok(denied.checks.every(x=>x.state==="DENIED"));
});

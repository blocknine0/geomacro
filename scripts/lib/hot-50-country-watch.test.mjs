import test from "node:test";
import assert from "node:assert/strict";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {
 HOT50_COUNTRY_ISO3,HOT50_COUNTRY_SET,selectHot50CountryDiscoveryBatch,
 hot50NominalIndexCadence
} from "./hot-50-country-watch.mjs";
import {hot50OfficialOriginalFeeds,HOT50_OFFICIAL_OGL_FEED_COUNT}
 from "./hot-50-official-original-feeds.mjs";
import {privateOsintRuntimeSources,rotatingPrivateCountryDiscoverySources}
 from "./private-osint-country-rotation.mjs";

const instant=new Date("2026-11-04T00:00:00.000Z");
const period=15*60_000;
test("Hot-50 is a canonical, unique 50-country, three-domain private watch",()=>{
 assert.equal(HOT50_COUNTRY_ISO3.length,50);
 assert.equal(new Set(HOT50_COUNTRY_ISO3).size,50);
 assert.ok(HOT50_COUNTRY_ISO3.every(c=>COUNTRIES_195.some(x=>x.iso3===c)));
 assert.equal(COUNTRIES_195.filter(c=>!HOT50_COUNTRY_SET.has(c.iso3)).length,145);
});
test("at 25 allocated index fetches per slot, Hot-50 and other 145 complete each <=180 minute cycle",()=>{
 const registry=[];
 const actualHot=new Set(),actualOther=new Set();
 for(let i=0;i<12;i++){
  const at=new Date(instant.getTime()+i*period);
  const selected=selectHot50CountryDiscoveryBatch(at,COUNTRIES_195,25);
  assert.ok(selected.length>=1 && selected.length<=25);
  assert.equal(new Set(selected.map(x=>x.iso3)).size,selected.length);
  for(const row of selected){
   if(HOT50_COUNTRY_SET.has(row.iso3))actualHot.add(row.iso3);
   else actualOther.add(row.iso3);
  }
  registry.push(...rotatingPrivateCountryDiscoverySources(at,COUNTRIES_195,25,{hot50Priority:true}));
 }
 assert.equal(actualHot.size,50);
 assert.equal(actualOther.size,145);
 assert.equal(hot50NominalIndexCadence(25).hot50_cycle_minutes,120);
 assert.equal(hot50NominalIndexCadence(25).other145_cycle_minutes,120);
 assert.ok(registry.every(x=>x.private_discovery_index_only===true &&
  x.index_timestamp_not_original_page_clock===true &&
  x.commercial_eligible===false &&
  x.publicly_deliverable===false &&
  x.categories.length===3));
});
test("small source budgets preserve 145-country fairness and do not fabricate 3h success",()=>{
 const sampledHot=new Set(),sampledOther=new Set();
 for(let i=0;i<195*3;i++){
  const batch=selectHot50CountryDiscoveryBatch(
   new Date(instant.getTime()+i*period),COUNTRIES_195,1);
  assert.equal(batch.length,1);
  const country=batch[0].iso3;
  if(HOT50_COUNTRY_SET.has(country))sampledHot.add(country);
  else sampledOther.add(country);
 }
 assert.equal(sampledHot.size,50);
 assert.equal(sampledOther.size,145);
 assert.equal(hot50NominalIndexCadence(0).hot50_under_180_minutes,false);
 assert.equal(hot50NominalIndexCadence(1).hot50_under_180_minutes,false);
 assert.equal(hot50NominalIndexCadence(8).hot50_under_180_minutes,false);
 assert.equal(hot50NominalIndexCadence(25).hot50_under_180_minutes,true);
});
test("pinned first-party OGL native Atom candidates stay private and without rights promotion",()=>{
 const feeds=hot50OfficialOriginalFeeds();
 assert.equal(feeds.length,HOT50_OFFICIAL_OGL_FEED_COUNT);
 assert.equal(feeds.length,7);
 assert.equal(new Set(feeds.map(x=>x.url)).size,feeds.length);
 assert.deepEqual(new Set(feeds.flatMap(x=>x.categories)),
  new Set(["geopolitics","macro","rare_earth"]));
 assert.ok(feeds.every(x=>x.publisher_country_iso3==="GBR" &&
  x.type==="atom" && x.url.startsWith("https://www.gov.uk/government/organisations/") &&
  x.commercial_eligible===false && x.rights_verified===false &&
  x.transport_verified_at_registration===false &&
  x.publicly_deliverable===false));
});
test("real private runtime uses at most 512 native/index URLs and retains all three domains",()=>{
 const registry=privateOsintRuntimeSources(instant,undefined,COUNTRIES_195,{includeLocalGapLane:true});
 assert.ok(registry.length<=512);
 assert.equal(new Set(registry.map(x=>x.url)).size,registry.length);
 assert.equal(new Set(registry.flatMap(x=>x.categories)).size,3);
 assert.ok(registry.some(x=>x.private_hot50_original_candidate===true));
 assert.ok(registry.some(x=>x.private_discovery_index_only===true));
 const indices=registry.filter(x=>x.private_discovery_index_only===true);
 assert.ok(indices.length>0 && indices.every(x=>COUNTRIES_195.some(c=>
  c.iso3===x.discovery_country_iso3)));
 assert.ok(registry.filter(x=>x.private_hot50_original_candidate===true)
  .every(x=>x.commercial_eligible===false));
});

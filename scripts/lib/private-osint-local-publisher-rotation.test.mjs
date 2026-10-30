import test from "node:test";
import assert from "node:assert/strict";
import {privateOsintGlobalSources} from "./private-osint-global-sources.mjs";
import {privateOsintRuntimeSources,rotatingPrivateCountryDiscoverySources,
 COUNTRY_DISCOVERY_LOCAL_LANE_CYCLE_MINUTES} from "./private-osint-country-rotation.mjs";
import {PRIVATE_LOCAL_FEEDS_PER_TICK,PRIVATE_LOCAL_NOMINAL_CYCLE_MINUTES,
 privateLocalPublisherCandidates,rotatingPrivateLocalPublisherSources} from
 "./private-osint-local-publisher-rotation.mjs";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

const at=new Date("2026-10-27T06:00:00.000Z");
const quarter=15*60000;
const mock=row=>({
 schema:"geomacro.reusable-news-json.v1",category:row.category,
 country_iso3:row.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:row.published_at},
 usage_rights:{commercial_reuse_authorized:false},delivery:{raw_article_included:false},
});
test("exact 96 pinned local RSS candidate URLs cover 94 country-publisher routes with no rights promotion",()=>{
 const src=privateLocalPublisherCandidates();
 assert.equal(src.length,96);
 assert.equal(new Set(src.map(x=>x.id)).size,96);
 assert.equal(new Set(src.map(x=>x.url)).size,96);
 assert.equal(new Set(src.map(x=>x.publisher_country_iso3)).size,94);
 const countries=new Set(COUNTRIES_195.map(c=>c.iso3));
 for(const row of src){
  assert.ok(countries.has(row.publisher_country_iso3));
  assert.ok(row.url.startsWith("https://"));
  assert.equal(row.supported,true);
  assert.equal(row.private_country_local_candidate,true);
  assert.deepEqual(row.categories,["geopolitics","macro","rare_earth"]);
  assert.equal(row.transport_verified_at_registration,false);
  assert.equal(row.rights_verified,false);
  assert.equal(row.commercial_eligible,false);
  assert.equal(row.publicly_deliverable,false);
 }
});
test("every local publisher receives nominal 60m polling without exceeding existing 49 source GET positions",()=>{
 const base=privateOsintGlobalSources();
 assert.ok(base.length+49<=512);
 const slots=[0,1,2,3].map(n=>{
  const when=new Date(at.getTime()+n*quarter);
  return {local:rotatingPrivateLocalPublisherSources(when),
    sources:privateOsintRuntimeSources(when,base,COUNTRIES_195,{includeLocalGapLane:true})};
 });
 assert.equal(PRIVATE_LOCAL_FEEDS_PER_TICK,24);
 assert.equal(PRIVATE_LOCAL_NOMINAL_CYCLE_MINUTES,60);
 for(const slot of slots){
  assert.equal(slot.local.length,24);
  assert.ok(slot.sources.length<=512);
  assert.ok(slot.sources.length<=base.length+49);
  assert.equal(new Set(slot.sources.map(x=>x.url)).size,slot.sources.length);
  assert.equal(slot.sources.filter(x=>x.private_country_local_candidate).length,24);
  assert.equal(slot.sources.filter(x=>x.private_discovery_index_only&&x.discovery_country_iso3).length,22);
  assert.equal(slot.sources.filter(x=>x.launch_watch&&x.private_discovery_index_only).length,3);
 }
 const all=slots.flatMap(x=>x.local);
 assert.equal(new Set(all.map(x=>x.id)).size,96);
 assert.equal(new Set(all.map(x=>x.publisher_country_iso3)).size,94);
 assert.deepEqual(rotatingPrivateLocalPublisherSources(new Date(at.getTime()+4*quarter))
  .map(x=>x.id),slots[0].local.map(x=>x.id));
});
test("all 195 global index leads remain reachable after exactly eight delivered 15m slots",()=>{
 const slots=Array.from({length:8},(_,n)=>rotatingPrivateCountryDiscoverySources(
  new Date(at.getTime()+n*quarter),COUNTRIES_195,25));
 assert.deepEqual(slots.map(xs=>xs.length),[25,25,25,25,25,25,25,20]);
 const all=slots.flat();
 assert.equal(new Set(all.map(x=>x.discovery_country_iso3)).size,195);
 assert.equal(COUNTRY_DISCOVERY_LOCAL_LANE_CYCLE_MINUTES,120);
 assert.ok(all.every(x=>x.private_discovery_index_only===true&&x.commercial_eligible===false));
});
test("native dated local-source headlines enter 3 private lanes without inventing event country",async()=>{
 const source=rotatingPrivateLocalPublisherSources(at)[0];
 const xml="<rss><channel>"+
  ["Local government announces sanctions, security and ceasefire measures",
   "National central bank announces inflation and foreign exchange outlook",
   "Mining ministry announces lithium cobalt critical minerals supply policy"].map(t=>
   "<item><title>"+t+"</title><pubDate>Tue, 27 Oct 2026 05:50:00 GMT</pubDate></item>").join("")+
  "</channel></rss>";
 const r=await collectPrivateOsint15m({
  now:at,registry:[source],normalize:mock,resolveCountry:()=>null,
  fetchImpl:async()=>new Response(xml,{status:200}),
 });
 assert.equal(r.checks.length,3);
 assert.equal(r.summary.local_publisher_candidate_endpoints_this_tick,1);
 assert.equal(r.summary.local_publisher_country_candidates_this_tick,1);
 assert.deepEqual(new Set(r.items.map(x=>x.category)),
  new Set(["geopolitics","macro","rare_earth"]));
 assert.ok(r.items.every(x=>x.country_iso3===null&&
  x.usage_rights.commercial_reuse_authorized===false));
 assert.ok(!JSON.stringify(r).includes("Local government announces"));
 const denied=await collectPrivateOsint15m({now:at,registry:[source],normalize:mock,
  resolveCountry:()=>null,fetchImpl:async()=>new Response("denied",{status:403})});
 assert.equal(denied.items.length,0);
 assert.ok(denied.checks.every(x=>x.state==="DENIED"));
});
test("local manifest rejects duplicate URLs and forged permissions, never adding unreviewed URLs",()=>{
 const good=privateLocalPublisherCandidates();
 // The adapter takes the pinned reviewed manifest, not arbitrary caller-provided URL strings.
 const invalid={schema:"geomacro.private-osint-local-gaplane.v1",
  scope:"PROTECTED_INTERNAL_OSINT_ONLY",
  sources:Array.from({length:96},(_,i)=>({
   id:"private_gaplane_fake_"+i,url:"https://attacker.example/feed",
   discovery_reference_url:"https://attacker.example/",
   publisher_country_iso3:"IND",type:"rss",
   categories:["geopolitics","macro","rare_earth"],
   activation_state:"RUNTIME_PROBE_REQUIRED",
   publisher_native_dates_required:true,transport_verified_at_registration:false,
   commercial_eligible:false,publicly_deliverable:false,
  }))};
 assert.equal(good.length,96);
 assert.throws(()=>privateLocalPublisherCandidates(invalid),/PRIVATE_LOCAL_PUBLISHER_CANDIDATE_UNSAFE/);
});

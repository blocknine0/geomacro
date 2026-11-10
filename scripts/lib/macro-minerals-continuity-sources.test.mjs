import test from "node:test";
import assert from "node:assert/strict";
import {macroMineralsContinuitySources} from "./macro-minerals-continuity-sources.mjs";
import {threeDomainGlobal20mPublisherRegistry} from "./three-domain-global-direct-20m-sources.mjs";
test("pin ten UK Atom and seven international official RSS candidates to every 20-minute run",()=>{
 const feeds=macroMineralsContinuitySources();
 assert.deepEqual(feeds.map(s=>s.categories[0]),["macro","macro","rare_earth","rare_earth","macro","macro","macro","macro","rare_earth","rare_earth","macro","macro","macro","macro","rare_earth","rare_earth","macro"]);
 const {registry,summary}=threeDomainGlobal20mPublisherRegistry(new Date("2026-11-04T08:00:00Z"));
 assert.equal(summary.macro_minerals_continuity_sources_pinned,17);
 assert.equal(summary.macro_minerals_continuity_transport_verified_by_registration,false);
 assert.ok(registry.length<=504);
 for(const feed of feeds){
  const matches=registry.filter(s=>s.url===feed.url);
  assert.equal(matches.length,1,feed.id);
  const kept=matches[0];
  assert.ok(kept.categories.includes(feed.categories[0]));
  assert.equal(kept.publisher_native_dates_required,true);
  assert.equal(kept.original_article_verified,false);
  assert.equal(kept.commercial_eligible,false);
  assert.equal(kept.publicly_deliverable,false);
 }
});
test("manifest candidates are only discovery: no unverified event, payment or denial bypass",()=>{
 const feeds=macroMineralsContinuitySources();
 assert.equal(new Set(feeds.map(s=>s.url)).size,feeds.length);
 for(const feed of feeds){
  const u=new URL(feed.url);
  assert.ok(["www.gov.uk","www.federalreserve.gov","www.bankofcanada.ca",
   "apps.bea.gov","www.boj.or.jp","www.usgs.gov","news.gov.bc.ca","www.bcb.gov.br"].includes(u.hostname));
  assert.ok(feed.type==="atom"||feed.type==="rss");
  assert.equal(feed.provider_rights_verified,false);
  assert.equal(feed.transport_verified_at_registration,false);
  assert.equal(feed.private_only,true);
 }
});

test("Brazil central bank official feed is pinned as a Macro candidate without rights promotion",()=>{
 const feeds=macroMineralsContinuitySources();
 const brazil=feeds.filter(s=>s.publisher_country_iso3==="BRA");
 assert.equal(brazil.length,1);
 assert.equal(brazil[0].url,"https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/focus");
 assert.deepEqual(brazil[0].categories,["macro"]);
 assert.equal(brazil[0].continent,"south_america");
 assert.equal(brazil[0].transport_verified_at_registration,false);
 assert.equal(brazil[0].provider_rights_verified,false);
 assert.equal(brazil[0].commercial_eligible,false);
});

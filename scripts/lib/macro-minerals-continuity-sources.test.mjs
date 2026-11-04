import test from "node:test";
import assert from "node:assert/strict";
import {macroMineralsContinuitySources} from "./macro-minerals-continuity-sources.mjs";
import {threeDomainGlobal20mPublisherRegistry} from "./three-domain-global-direct-20m-sources.mjs";
test("pin ten independent official Atom source candidates to every 20-minute run",()=>{
 const feeds=macroMineralsContinuitySources();
 assert.deepEqual(feeds.map(s=>s.categories[0]),["macro","macro","rare_earth","rare_earth","macro","macro","macro","macro","rare_earth","rare_earth"]);
 const {registry,summary}=threeDomainGlobal20mPublisherRegistry(new Date("2026-11-04T08:00:00Z"));
 assert.equal(summary.macro_minerals_continuity_sources_pinned,10);
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
  assert.match(feed.url,/^https:\/\/www\.gov\.uk\/government\/organisations\/[^/]+\.atom$/u);
  assert.equal(feed.provider_rights_verified,false);
  assert.equal(feed.transport_verified_at_registration,false);
  assert.equal(feed.private_only,true);
 }
});

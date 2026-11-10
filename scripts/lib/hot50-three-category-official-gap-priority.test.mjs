import test from "node:test";
import assert from "node:assert/strict";
import {hot50ThreeCategoryOfficialPrioritySources} from "./hot50-three-category-official-gap-priority.mjs";
import {threeDomainGlobal20mPublisherRegistry} from "./three-domain-global-direct-20m-sources.mjs";
import {PRIVATE_OSINT_RETIRED_SOURCE_IDS} from "./private-osint-retired-sources.mjs";
test("exact non-retired 23 original-publisher candidates across all 3 lanes",()=>{
 const sources=hot50ThreeCategoryOfficialPrioritySources();
 assert.equal(sources.length,23);
 assert.equal(new Set(sources.map(x=>x.url)).size,23);
 assert.equal(new Set(sources.map(x=>x.id)).size,23);
 assert.deepEqual(["geopolitics","macro","rare_earth"].map(c=>
  sources.some(x=>x.categories.includes(c))),[true,true,true]);
 for(const s of sources){
  assert(!PRIVATE_OSINT_RETIRED_SOURCE_IDS.includes(s.id));
  assert.equal(s.publisher_native_dates_required,true);
  assert.equal(s.transport_verified_at_registration,false);
  assert.equal(s.original_article_verified,false);
  assert.equal(s.commercial_eligible,false);
  assert.equal(s.provider_rights_verified,false);
  assert.equal(s.publicly_deliverable,false);
  assert.equal(s.private_only,true);
 }
});
test("all official gap pins are present exactly once in priority 20m registry",()=>{
 const sources=hot50ThreeCategoryOfficialPrioritySources();
 const {registry,summary}=threeDomainGlobal20mPublisherRegistry(new Date("2026-11-11T00:00:00Z"));
 const urls=new Set(registry.map(x=>x.url));
 assert.equal(summary.first_party_gap_source_candidates_pinned,23);
 assert.ok(summary.first_party_gap_priority_new_direct_urls>=1);
 assert.ok(registry.length<=504);
 assert.ok(sources.every(s=>urls.has(s.url)));
 for(const s of sources){
  const found=registry.filter(x=>x.url===s.url);
  assert.equal(found.length,1);
  assert.ok(s.categories.every(c=>found[0].categories.includes(c)));
  assert.equal(found[0].private_official_hot50_gap_priority,true);
  assert.equal(found[0].commercial_eligible,false);
  assert.equal(found[0].publicly_deliverable,false);
 }
 assert.equal(summary.provider_rights_or_event_verified_by_registration,false);
});

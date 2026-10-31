import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {buildMineralNationalPortalRepair} from "../ops/build-mineral-national-portal-repair.mjs";
const manifest=JSON.parse(readFileSync(new URL("../../config/private-osint-mineral-national-portals.v1.json",import.meta.url),"utf8"));
const report={schema:"geomacro.native-country-195x3-repair-worklist.v1",probed_at:"2026-10-31T12:00:00Z",
 priority_worklist:COUNTRIES_195.flatMap(country=>
  ["geopolitics","macro","rare_earth"].map(category=>({
   country_iso3:country.iso3,category,
   native_country_attributed_items_this_tick:country.iso3==="CHL"&&category==="rare_earth"?2:0,
   diagnosis:"HEALTHY_NO_NATIVE_ITEM_THIS_TICK",local_feed_healthy_this_tick:true})))};
test("20 priority national mineral targets are source discovery only and do not create fake news",()=>{
 const r=buildMineralNationalPortalRepair(report,manifest);
 assert.equal(r.priority_countries,20);
 assert.equal(r.countries_with_dated_items_this_tick,1);
 assert.equal(r.countries_without_dated_items_this_tick,19);
 assert.equal(r.next_source_checks_extra_gets,0);
 assert.ok(r.sources.every(x=>x.live_feed_added_by_this_worklist===false));
 assert.ok(r.sources.every(x=>x.news_record_created===false));
});
test("portal homepage cannot masquerade as native RSS observation",()=>{
 const clone=structuredClone(manifest);
 clone.targets[0].verified_native_feed_url=clone.targets[0].authority_homepage;
 assert.throws(()=>buildMineralNationalPortalRepair(report,clone),/MINERAL_PORTAL_TARGET_UNSAFE/);
});

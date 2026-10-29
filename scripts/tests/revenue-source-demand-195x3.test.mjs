import test from "node:test";
import assert from "node:assert/strict";
import {buildRevenueSourceDemand} from "../ops/build-revenue-source-demand-195x3.mjs";
const countries=Array.from({length:195},(_,i)=>String.fromCharCode(65+Math.floor(i/26),65+i%26,65));
const cats=["geopolitics","macro","rare_earth"];
function fixture(){
 const items=countries.flatMap((code,i)=>cats.map((category,j)=>({
   country_iso3:code,category,priority:(i+j)%6,
   diagnosis:["NO_HEALTHY_SOURCE","LOCAL_SOURCE_UNHEALTHY","GLOBAL_FALLBACK_ONLY",
      "REGIONAL_FALLBACK_ONLY","HEALTHY_NO_NATIVE_ITEM_THIS_TICK","LOCAL_HEALTHY_NATIVE_ITEM"][(i+j)%6],
   native_country_attributed_items_this_tick:(i+j)%6===5?2:0,
   event_country_verified:false,live_ingestion_585_verified:false
 })));
 return {
  schema:"geomacro.native-country-195x3-repair-worklist.v1",
  cells:585,country_count:195,category_count:3,
  source_checks_completed:1390,
  observed_native_country_cells_this_tick:items.filter(x=>x.native_country_attributed_items_this_tick>0).length,
  probed_at:"2026-10-29T16:30:00Z",
  all_585_native_ingestion_verified:false,priority_worklist:items
 };
}
test("every canonical country and category becomes distinct priced-product evidence sourcing work",()=>{
 const r=buildRevenueSourceDemand(fixture());
 assert.equal(r.prioritized_sourcing_queue.length,585);
 assert.deepEqual(Object.keys(r.demand_by_category),cats);
 assert.ok(r.demand_by_category.macro.repair_or_missing_first_party_cells>0);
 assert.equal(r.demand_by_category.rare_earth.independently_qualified_paid_cells,0);
 assert.equal(r.ingestion_and_d1_b2_write_verified_by_this_receipt,false);
 assert.equal(r.mainnet_settlement_verified_by_this_receipt,false);
 assert.equal(r.predge_modified,false);
 assert.ok(r.prioritized_sourcing_queue.every(x=>x.customer_charge_authorized===false
   && x.reviewed_rights_verified===false && x.signed_readback_verified===false));
});
test("a healthy, quiet publisher must never be treated as a made-up current news sale",()=>{
 const r=buildRevenueSourceDemand(fixture());
 const quiet=r.prioritized_sourcing_queue.find(x=>x.diagnosis==="HEALTHY_NO_NATIVE_ITEM_THIS_TICK");
 assert.equal(quiet.source_need,"KEEP_CHECKING_ORIGINAL_PUBLICATION_NOT_FORCE_AN_EVENT");
 assert.equal(quiet.qualified_original_event_verified,false);
 assert.equal(quiet.customer_charge_authorized,false);
});
test("reject source health only or country registry without 585 actual measured entries",()=>{
 const src=fixture();
 src.priority_worklist.pop();
 assert.throws(()=>buildRevenueSourceDemand(src),/INPUT_NOT_VERIFIED/);
 const b=fixture();
 b.priority_worklist[0]={...b.priority_worklist[1]};
 assert.throws(()=>buildRevenueSourceDemand(b),/CELL_UNSAFE/);
 const c=fixture();c.priority_worklist[0].event_country_verified=true;
 assert.throws(()=>buildRevenueSourceDemand(c),/CELL_UNSAFE/);
 const d=fixture();d.priority_worklist[0].priority=5;
 assert.throws(()=>buildRevenueSourceDemand(d),/CELL_UNSAFE/);
});

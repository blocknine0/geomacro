import test from "node:test";
import assert from "node:assert/strict";
import {
 aggregatePredgeDailyLedger,parsePartnerReport,reconcilePredgePartnerReport,
 renderPredgeDailyCsv
} from "../ops/reconcile-predge-daily-delivery.mjs";

const hash=(n)=>String(n).padStart(64,"0");
const created=[
 {gro_id:hash(1),country_iso3:"USA",category:"GEOPOLITICS",
  created_at:"2026-11-18T01:00:00.000Z",
  payload_json:JSON.stringify({eligible_tiers:["basic_focused","standard"]})},
 {gro_id:hash(2),country_iso3:"CHL",category:"CRITICAL_MINERALS",
  created_at:"2026-11-18T03:00:00.000Z",
  payload_json:JSON.stringify({tier:"complex_full"})},
 {gro_id:hash(3),country_iso3:"USA",category:"MACRO_FX",
  created_at:"2026-11-17T23:59:59.999Z",payload_json:"{}"}
];
const deliveries=[
 {gro_id:hash(1),receipt_sha256:hash(10),day_utc:"2026-11-18",country_iso3:"USA",
  category:"GEOPOLITICS",tier:"BASIC",customer_price_usd:0.15,
  geomacro_net_usd:0.10,predge_fee_usd:0.05,delivery_status:"DELIVERED"},
 {gro_id:hash(2),receipt_sha256:hash(11),day_utc:"2026-11-18",country_iso3:"CHL",
  category:"CRITICAL_MINERALS",tier:"COMPLEX",customer_price_usd:0.30,
  geomacro_net_usd:0.25,predge_fee_usd:0.05,delivery_status:"FAILED"},
 {gro_id:hash(4),receipt_sha256:hash(12),day_utc:"2026-11-18",country_iso3:"USA",
  category:"MACRO_FX",tier:"STANDARD",customer_price_usd:0.20,
  geomacro_net_usd:0.15,predge_fee_usd:0.05,delivery_status:"SENT"}
];

test("daily aggregation counts distinct GROs, tiers, cells, delivery outcomes and net",()=>{
 const report=aggregatePredgeDailyLedger(created,deliveries,{day:"2026-11-18"});
 assert.equal(report.created_total,2);
 assert.equal(report.created_by_tier.BASIC,1);
 assert.equal(report.created_by_tier.STANDARD,1);
 assert.equal(report.created_by_tier.COMPLEX,1);
 assert.equal(report.sent_to_predge_total,2);
 assert.equal(report.delivered_total,1);
 assert.equal(report.failed_total,1);
 assert.equal(report.expected_geomacro_net_usd,"0.10");
 assert.deepEqual(report.created_by_country_category,[
  {country_iso3:"CHL",category:"CRITICAL_MINERALS",created_total:1},
  {country_iso3:"USA",category:"GEOPOLITICS",created_total:1}
 ]);
 assert.ok(report.created_by_country_category.every(x=>
  ["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].includes(x.category)));
 assert.match(renderPredgeDailyCsv(report),/^day_utc,country_iso3,category,tier,/u);
});

test("partner report JSON and CSV reconcile on gro_id plus receipt hash",()=>{
 const csv="gro_id,receipt_sha256,status\n"+hash(1)+","+hash(10)+",delivered\n"+
  hash(9)+","+hash(19)+",delivered\n";
 const partner=parsePartnerReport(csv,{name:"partner.csv"});
 const diff=reconcilePredgePartnerReport(deliveries,partner);
 assert.equal(diff.matched_count,1);
 assert.equal(diff.missing_in_predge_count,1);
 assert.equal(diff.extra_in_predge_count,1);
 assert.deepEqual(diff.missing_in_predge,[{gro_id:hash(4),receipt_sha256:hash(12)}]);
 assert.deepEqual(diff.extra_in_predge,[{gro_id:hash(9),receipt_sha256:hash(19)}]);
 const json=parsePartnerReport(JSON.stringify({deliveries:[{
  groId:hash(1),receiptSha256:hash(10)
 }]}),{name:"partner.json"});
 assert.equal(json.length,1);
});

test("daily aggregation rejects categories outside the three-category schema",()=>{
 assert.throws(()=>aggregatePredgeDailyLedger([
  {gro_id:hash(1),country_iso3:"USA",category:"OTHER",
   created_at:"2026-11-18T00:00:00.000Z",payload_json:"{}"}
 ],[],{day:"2026-11-18"}),/CREATED_ROW_INVALID/u);
});

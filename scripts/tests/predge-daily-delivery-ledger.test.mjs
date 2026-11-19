import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {normalizePredgeTier,reconcilePredgeDaily,dailySummaryCsv,recordPredgeDeliveryObservation} from "../../workers/control-plane/src/predge-daily-delivery-ledger.mjs";

const migration=readFileSync(new URL("../../workers/control-plane/migrations/0225_predge_daily_delivery_ledger.sql",import.meta.url),"utf8");
const day="2026-11-18";
const sha=(n)=>String(n).repeat(64).slice(0,64);

test("0225 migration creates observational delivery rows with tier and status terms",()=>{
 const db=new DatabaseSync(":memory:");db.exec(migration);
 const table=db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get("risk_stream_predge_daily_delivery_ledger");
 assert.ok(table?.sql.includes("delivery_status IN ('SENT','DELIVERED','FAILED')"));
 assert.ok(table?.sql.includes("category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')"));
 const indexes=db.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all().map(x=>x.name);
 assert.ok(indexes.includes("idx_predge_daily_delivery_day_tier_status"));
 assert.ok(indexes.includes("idx_predge_daily_delivery_gro_receipt"));db.close();
});

test("daily aggregation counts tiers, country-category cells, delivery outcomes, and net",()=>{
 const createdRows=[
  {created_at:`${day}T01:00:00.000Z`,country_iso3:"USA",category:"GEOPOLITICS",tier:"BASIC"},
  {created_at:`${day}T02:00:00.000Z`,country_iso3:"USA",category:"GEOPOLITICS",payload_json:JSON.stringify({eligible_derived_score:{agent_decision:{tier:"STANDARD"}}})},
  {created_at:`${day}T03:00:00.000Z`,country_iso3:"CHL",category:"CRITICAL_MINERALS",tier:"COMPLEX"},
  {created_at:"2026-11-17T23:59:59.000Z",country_iso3:"USA",category:"MACRO_FX",tier:"COMPLEX"}
 ];
 const deliveryRows=[
  {day_utc:day,tier:"BASIC",delivery_status:"DELIVERED"},
  {day_utc:day,tier:"STANDARD",delivery_status:"FAILED"},
  {day_utc:day,tier:"COMPLEX",delivery_status:"SENT"},
  {day_utc:day,tier:"COMPLEX",delivery_status:"DELIVERED"},
  {day_utc:"2026-11-17",tier:"BASIC",delivery_status:"DELIVERED"}
 ];
 const summary=reconcilePredgeDaily({day,createdRows,deliveryRows});
 assert.deepEqual({created:summary.created_total,sent:summary.sent_to_predge_total,
  delivered:summary.delivered_total,failed:summary.failed_total,net:summary.expected_geomacro_net_usd},
  {created:3,sent:3,delivered:2,failed:1,net:0.35});
 assert.deepEqual(summary.tier_breakdown.STANDARD,{created:1,sent_to_predge:0,delivered:0,failed:1,expected_geomacro_net_usd:0});
 assert.equal(summary.created_by_country_category["USA:GEOPOLITICS"].created_total,2);
 assert.equal(summary.created_by_country_category["USA:GEOPOLITICS"].tier_breakdown.STANDARD,1);
 assert.match(dailySummaryCsv(summary),/"TOTAL","2026-11-18"/u);
 assert.match(dailySummaryCsv(summary),/"CELL","2026-11-18","USA","GEOPOLITICS"/u);
});

test("partner report reconciliation matches both GRO and receipt and returns exact missing and extra IDs",()=>{
 const rows=[
  {day_utc:day,tier:"STANDARD",delivery_status:"DELIVERED",gro_id:sha("1"),receipt_sha256:sha("a")},
  {day_utc:day,tier:"BASIC",delivery_status:"DELIVERED",gro_id:sha("2"),receipt_sha256:sha("b")},
  {day_utc:day,tier:"COMPLEX",delivery_status:"FAILED",gro_id:sha("3"),receipt_sha256:sha("c")}
 ];
 const report=[{gro_id:sha("1"),receipt_sha256:sha("a")},{gro_id:sha("9"),receipt_sha256:sha("z")}];
 const result=reconcilePredgeDaily({day,deliveryRows:rows,partnerRows:report}).partner_reconciliation;
 assert.equal(result.matched_count,1);assert.equal(result.matched[0].gro_id,sha("1"));
 assert.equal(result.missing_in_predge_count,1);assert.equal(result.missing_in_predge[0].gro_id,sha("2"));
 assert.equal(result.extra_in_predge_count,1);assert.equal(result.extra_in_predge[0].gro_id,sha("9"));
});

test("every wrapped Predge request writes outcome receipt metadata without relying on D1 reads",async()=>{
 let sqlSeen="",bound=[];
 const env={DB:{prepare(sql){sqlSeen=sql;return {bind(...values){bound=values;return {run:async()=>({success:true})}}}}}};
 const request=new Request("https://example.test/v2/partner/predge/paid-risk-gate",{method:"POST",
  headers:{"content-type":"application/json"},body:JSON.stringify({request_id:"request-1",country_iso3:"USA",category:"MACRO_FX",tier:"complex_full"})});
 const response=Response.json({ok:true,tier:"COMPLEX",licensed_gro_id:sha("7"),audit_receipt_hash:sha("8"),
  eligible_derived_score:{category:"MACRO_FX"}});
 assert.equal(await recordPredgeDeliveryObservation({request,response,env,apiVersion:"v2",now:Date.parse(`${day}T04:00:00.000Z`)}),true);
 assert.match(sqlSeen,/INSERT INTO risk_stream_predge_daily_delivery_ledger/u);
 assert.deepEqual(bound.slice(1,9),["v2","request-1",sha("7"),sha("8"),day,"USA","MACRO_FX","COMPLEX"]);
 assert.deepEqual(bound.slice(9,13),["0.30","0.25","DELIVERED",200]);
 assert.equal(normalizePredgeTier("basic_focused"),"BASIC");
});

test("accounting write errors are swallowed so observation never blocks delivery",async()=>{
 const env={DB:{prepare(){return {bind(){return {run:async()=>{throw Error("missing migration")}}}}}}};
 const request=new Request("https://example.test/v1/partner/predge/risk-gate",{method:"POST",body:"{}"});
 const response=Response.json({ok:true});
 assert.equal(await recordPredgeDeliveryObservation({request,response,env,apiVersion:"v1"}),false);
});

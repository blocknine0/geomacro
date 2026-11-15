import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeHot50DailyRows,readHot50RiskStreamDailyAudit}
 from "../ops/audit-hot50-risk-stream-daily.mjs";

const countries=JSON.parse(readFileSync(new URL("../../config/hot-50-three-domain-watch.v1.json",import.meta.url),"utf8")).country_iso3;
const day="2026-11-15";

test("daily audit reports per-category throughput, paid tier counts, and Hot50 country coverage",()=>{
 const report=summarizeHot50DailyRows([
  {kind:"gro_category",dimension:"GEOPOLITICS",count:3},
  {kind:"gro_category",dimension:"MACRO_FX",count:2},
  {kind:"license_category",dimension:"CRITICAL_MINERALS",count:1},
  {kind:"paid_tier",dimension:"standard",count:7},
  {kind:"paid_tier",dimension:"complex_full",count:1},
  {kind:"hot50_country_category",dimension:"MACRO_FX",country_iso3:countries[0],count:2}
 ],{day,countries});
 assert.equal(report.category_counts.GEOPOLITICS.signed_gros,3);
 assert.equal(report.category_counts.MACRO_FX.signed_gros,2);
 assert.equal(report.category_counts.CRITICAL_MINERALS.pull_licenses,1);
 assert.equal(report.paid_tier_deliveries.basic_focused,0);
 assert.equal(report.paid_tier_deliveries.standard,7);
 assert.equal(report.hot50_country_coverage.MACRO_FX.coverage,"1/50");
 assert.equal(report.hot50_country_coverage.GEOPOLITICS.coverage,"0/50");
 assert.equal(report.payment_activation_authorized,false);
});

test("daily audit performs one read-only D1 query only after paid monthly headroom admission",async()=>{
 const calls=[];let admitted=false;
 const report=await readHot50RiskStreamDailyAudit({
  env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"t".repeat(40)},
  now:new Date(day+"T12:00:00.000Z"),skipHeadroom:false,
  headroomCheck:async input=>{admitted=input.lane==="research";return {status:"PASS",no_d1_sql_or_write_issued:true}},
  fetchImpl:async(url,init)=>{calls.push({url,init});assert.equal(admitted,true);
   const results=calls.length===1?[
    {name:"idx_risk_stream_signed_gro_created_category_country"},
    {name:"idx_risk_stream_predge_pull_created_category_country"},
    {name:"idx_predge_paid_usage_created_tier_delivery"}
   ]:[
    {kind:"gro_category",dimension:"GEOPOLITICS",count:1,country_iso3:null},
    {kind:"paid_tier",dimension:"basic_focused",count:1,country_iso3:null},
    {kind:"hot50_country_category",dimension:"GEOPOLITICS",count:1,country_iso3:countries[0]}
   ];
   return {status:200,json:async()=>({success:true,result:[{results}]})}}
 });
 assert.equal(calls.length,2);
 assert.equal(calls[0].init.method,"POST");
 assert.equal(calls[0].init.redirect,"error");
 assert.match(JSON.parse(calls[0].init.body).sql,/sqlite_schema/u);
 assert.match(JSON.parse(calls[1].init.body).sql,/FROM risk_stream_sources WHERE source_id IN/u);
 assert.equal(report.hot50_country_coverage.GEOPOLITICS.coverage,"1/50");
 assert.equal(report.paid_tier_deliveries.basic_focused,1);
 assert.equal(report.paid_tier_deliveries.standard,0);
});

test("daily audit refuses an unindexed full-table report before its count query",async()=>{
 let calls=0;
 await assert.rejects(readHot50RiskStreamDailyAudit({
  env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"t".repeat(40)},
  now:new Date(day+"T12:00:00.000Z"),skipHeadroom:true,
  fetchImpl:async()=>{calls++;return {status:200,json:async()=>({success:true,result:[{results:[]}]})}}
 }),/AUDIT_INDEX_MIGRATION_NOT_APPLIED/u);
 assert.equal(calls,1);
});

test("daily audit rejects incomplete headroom evidence before querying D1",async()=>{
 let called=false;
 await assert.rejects(readHot50RiskStreamDailyAudit({
  env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"t".repeat(40)},
  now:new Date(day+"T12:00:00.000Z"),
  headroomCheck:async()=>({status:"HOLD"}),fetchImpl:async()=>{called=true}
 }),/MONTHLY_HEADROOM_UNVERIFIED/u);
 assert.equal(called,false);
});

test("daily audit rejects rows outside the pinned 50-country universe",()=>{
 assert.throws(()=>summarizeHot50DailyRows([
  {kind:"hot50_country_category",dimension:"GEOPOLITICS",country_iso3:"ZZZ",count:1}
 ],{day,countries}),/ROW_INVALID/u);
});

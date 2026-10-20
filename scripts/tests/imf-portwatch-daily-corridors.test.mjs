import test from "node:test";
import assert from "node:assert/strict";
import {
  PORTWATCH_ROUTE_IDS,portwatchDailyQueryUrl,inspectPortwatchDailyResponse,
  observePortwatchDaily
} from "../lib/imf-portwatch-daily-corridors.mjs";
const now=new Date("2026-10-20T10:00:00Z");
const ids=Object.keys(PORTWATCH_ROUTE_IDS);
const sample=(date="2026-10-17")=>({features:ids.flatMap((id,i)=>[
 {attributes:{portid:id.toUpperCase(),date,n_total:100+i,n_tanker:30,n_container:20}},
 {attributes:{portid:id,date:"2026-10-16",n_total:80+i,n_tanker:25,n_container:19}}
])});
test("one exact bounded official ArcGIS query maps six canonical corridor IDs",()=>{
 const url=new URL(portwatchDailyQueryUrl());
 assert.equal(url.protocol,"https:");
 assert.equal(url.host,"services9.arcgis.com");
 assert.equal(url.pathname,"/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query");
 assert.equal(url.searchParams.get("resultRecordCount"),"60");
 assert.equal(url.searchParams.get("returnGeometry"),"false");
 assert.equal(url.searchParams.get("orderByFields"),"date DESC");
 assert.equal(url.searchParams.get("outFields"),"portid,date,n_total,n_tanker,n_container");
 assert.equal(ids.length,6);
 assert.ok(ids.every(id=>url.searchParams.get("where").includes("'"+id+"'")));
 assert.ok(!url.searchParams.has("token"));
});
test("private six-route daily observations never become scored risk or payable data",()=>{
 const receipt=inspectPortwatchDailyResponse(sample(),now);
 assert.equal(receipt.route_count,6);
 assert.equal(receipt.routes_with_recent_daily_observations,6);
 assert.equal(receipt.status,"SIX_CORRIDORS_DAILY_REFERENCE_OBSERVED");
 assert.ok(receipt.routes.every(r=>r.latest_observation_day==="2026-10-17" &&
    r.observation_lag_days===3 && r.consecutive_day_comparison_available));
 assert.equal(receipt.paid_delivery_enabled,false);
 assert.equal(receipt.raw_provider_payload_stored,false);
 assert.equal(receipt.signed_risk_generated,false);
 assert.equal(receipt.shipping_incidents_verified,0);
 assert.equal(receipt.d1_writes,0);
 assert.doesNotMatch(JSON.stringify(receipt),/n_total|n_tanker|n_container/);
});
test("missing corridors, stale data, future timestamps and provider errors are not promoted",()=>{
 const partial=inspectPortwatchDailyResponse({features:sample().features.slice(0,2)},now);
 assert.equal(partial.status,"PARTIAL_DAILY_REFERENCE_OBSERVED");
 assert.equal(partial.routes_with_recent_daily_observations,1);
 const stale=inspectPortwatchDailyResponse(sample("2026-09-01"),now);
 assert.equal(stale.routes_with_recent_daily_observations,5);
 const future=inspectPortwatchDailyResponse({features:[
   {attributes:{portid:"chokepoint6",date:"2026-10-21",n_total:150}}
 ]},now);
 assert.equal(future.status,"PROVIDER_ROWS_UNVERIFIED");
 assert.equal(future.routes_with_recent_daily_observations,0);
 assert.throws(()=>inspectPortwatchDailyResponse({error:{code:400}},now),/PORTWATCH_RESPONSE_INVALID/);
 assert.throws(()=>inspectPortwatchDailyResponse({features:[]},now),/PORTWATCH_RESPONSE_INVALID/);
 assert.throws(()=>inspectPortwatchDailyResponse(sample(),new Date("invalid"))),/PORTWATCH_CLOCK_INVALID/);
});
test("one bounded request, status fail closed on 429 and oversize",async()=>{
 let hits=0,seen;
 const r=await observePortwatchDaily({now,fetchImpl:async(url,opts)=>{
   hits++;seen=opts;return Response.json(sample());
 }});
 assert.equal(hits,1);
 assert.equal(seen.redirect,"error");
 assert.equal(r.routes_with_recent_daily_observations,6);
 await assert.rejects(()=>observePortwatchDaily({now,fetchImpl:async()=>new Response("blocked",{status:429})}),/PORTWATCH_DENIED_OR_QUOTA/);
 await assert.rejects(()=>observePortwatchDaily({now,fetchImpl:async()=>new Response("{}",{headers:{"content-length":"200000"}})}),/PORTWATCH_BODY_LIMIT/);
 await assert.rejects(()=>observePortwatchDaily({now:new Date("invalid"),fetchImpl:async()=>{
   hits++;return Response.json(sample());
 }}),/PORTWATCH_CLOCK_INVALID/);
 assert.equal(hits,1);
});

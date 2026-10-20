import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {wdiLastNonemptyUrl,inspectWdiLastNonempty,observeWdiLastNonempty}
 from "../lib/wdi-195-last-nonempty.mjs";
const now=new Date("2026-10-20T09:00:00Z");
const registrySource=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const rows=[
 {countryiso3code:"IND",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:5.0},
 {countryiso3code:"PSE",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2018",value:3.8},
 {countryiso3code:"VAT",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:null},
 {countryiso3code:"IND",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2024",value:6.1},
 {countryiso3code:"USA",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2026",value:8.0},
 {countryiso3code:"EAS",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:1.0},
 {countryiso3code:"IND",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2020",value:6.0}
];
const payload=()=>[{page:1,pages:1,total:rows.length},rows];
test("one official per-indicator last-nonempty WDI batch",()=>{
 const u=new URL(wdiLastNonemptyUrl(now));
 assert.equal(u.hostname,"api.worldbank.org");
 assert.equal(u.searchParams.get("mrnev"),"1");
 assert.equal(u.searchParams.get("source"),"2");
 assert.equal(u.searchParams.get("page"),"1");
 assert.equal(u.searchParams.get("per_page"),"700");
 assert.ok(u.pathname.includes("FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG"));
});
test("period-specific country reference available is not fresh news or realtime FX",()=>{
 const r=inspectWdiLastNonempty(payload(),{now,registrySource});
 assert.equal(r.indicators.length,2);
 const inflation=r.indicators[0];
 assert.equal(inflation.countries_with_any_nonnull_historical_reference,2);
 assert.equal(inflation.countries_with_reference_in_last_5_years,1);
 assert.equal(inflation.countries_with_reference_in_last_10_years,2);
 assert.equal(inflation.canonical_country_reference_years.length,195);
 assert.equal(inflation.canonical_country_reference_years.find(x=>x.iso3==="PSE").reference_year,2018);
 assert.equal(inflation.canonical_country_reference_years.find(x=>x.iso3==="VAT").reference_year,null);
 assert.equal(inflation.canonical_country_reference_years.find(x=>x.iso3==="IND").reference_year,2025);
 assert.equal(r.verified_current_195x3_country_domain_events,false);
 assert.equal(r.historical_data_present_is_not_current,true);
 assert.equal(r.raw_source_values_stored,false);
 assert.equal(r.paid_delivery_enabled,false);
 assert.doesNotMatch(JSON.stringify(r),/6\.1|5\.0|3\.8/);
});
test("reject aggregates and future dates, bad pagination and tampered 195-country routing",()=>{
 const r=inspectWdiLastNonempty(payload(),{now,registrySource});
 assert.equal(r.excluded_aggregates_and_bad_rows,3);
 assert.throws(()=>inspectWdiLastNonempty([{page:1,pages:3,total:800},rows],{now,registrySource}),/WDI_BACKFILL_PAGINATION_UNVERIFIED/);
 assert.throws(()=>inspectWdiLastNonempty(payload(),{now,registrySource:"broken"}),/WDI_BACKFILL_REGISTRY_INVALID/);
 assert.throws(()=>inspectWdiLastNonempty(payload(),{now:new Date("invalid"),registrySource}),/WDI_BACKFILL_CLOCK_INVALID/);
});
test("one bounded GET, no provider denial retry or funds",async()=>{
 let calls=0;
 const x=await observeWdiLastNonempty({now,registrySource,fetchImpl:async(url,init)=>{
   calls++;assert.equal(init.redirect,"error");
   return Response.json(payload());
 }});
 assert.equal(calls,1);
 assert.equal(x.request_count,1);
 assert.equal(x.payments,0);
 await assert.rejects(()=>observeWdiLastNonempty({now,fetchImpl:async()=>new Response("forbidden",{status:403})}),/DENIED_OR_QUOTA/);
 await assert.rejects(()=>observeWdiLastNonempty({now,fetchImpl:async()=>new Response("x",{headers:{"content-length":"900000"}})}),/BODY_LIMIT/);
});

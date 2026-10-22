import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {wdiLastNonemptyUrl,inspectWdiLastNonempty,observeWdiLastNonempty,planWdiMissingCountryBatches,combineWdiMissingCountryBatches}
 from "../lib/wdi-195-last-nonempty.mjs";
const now=new Date("2026-10-20T09:00:00Z");
const registrySource=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const missingIso3=["PSE","VAT","IND"];
const rows=[
 {countryiso3code:"IND",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2020",value:5.0},
 {countryiso3code:"PSE",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2018",value:3.8},
 {countryiso3code:"VAT",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:null},
 {countryiso3code:"IND",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2024",value:6.1},
 {countryiso3code:"PSE",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2026",value:8.0},
 {countryiso3code:"EAS",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:1.0},
 {countryiso3code:"IND",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2019",value:6.0}
];
const payload=()=>[{page:1,pages:1,total:rows.length},rows];
test("one bounded WDI GET only for actual missing ISO3 country IDs, never all 195",()=>{
 const u=new URL(wdiLastNonemptyUrl(now,missingIso3,registrySource));
 assert.equal(u.hostname,"api.worldbank.org");
 assert.equal(u.searchParams.get("mrnev"),"1");
 assert.equal(u.searchParams.get("source"),"2");
 assert.equal(u.searchParams.get("page"),"1");
 assert.equal(u.searchParams.get("per_page"),"120");
 assert.ok(u.pathname.includes("/country/IND;PSE;VAT/"));
 assert.ok(u.pathname.includes("FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG"));
 assert.throws(()=>wdiLastNonemptyUrl(now,[],registrySource),/TARGET_INVALID/);
 assert.throws(()=>wdiLastNonemptyUrl(now,["EAS"],registrySource),/TARGET_INVALID/);
 assert.throws(()=>wdiLastNonemptyUrl(now,["IND","IND"],registrySource),/TARGET_INVALID/);
});
test("historical country-period lookup cannot be promoted to current values",()=>{
 const r=inspectWdiLastNonempty(payload(),{now,registrySource,missingIso3});
 assert.equal(r.indicators.length,2);
 const inflation=r.indicators[0];
 assert.equal(inflation.target_countries_with_any_historical_reference,2);
 assert.equal(inflation.target_countries_with_reference_in_last_5_years,1);
 assert.equal(inflation.target_countries_with_reference_in_last_10_years,2);
 assert.equal(inflation.target_country_reference_years.length,3);
 assert.equal(inflation.target_country_reference_years.find(x=>x.iso3==="PSE").reference_year,2018);
 assert.equal(inflation.target_country_reference_years.find(x=>x.iso3==="VAT").reference_year,null);
 assert.equal(inflation.target_country_reference_years.find(x=>x.iso3==="IND").reference_year,2020);
 assert.equal(r.verified_current_195x3_country_domain_events,false);
 assert.equal(r.query_target_is_only_2025_missing_countries,true);
 assert.equal(r.raw_source_values_stored,false);
 assert.equal(r.paid_delivery_enabled,false);
 assert.doesNotMatch(JSON.stringify(r),/6\.1|5\.0|3\.8/);
});
test("reject aggregates, future years, bad pages and registry mismatch",()=>{
 const r=inspectWdiLastNonempty(payload(),{now,registrySource,missingIso3});
 assert.equal(r.excluded_aggregates_and_bad_rows,3);
 assert.throws(()=>inspectWdiLastNonempty([{page:1,pages:3,total:800},rows],{now,registrySource,missingIso3}),/PAGINATION_UNVERIFIED/);
 assert.throws(()=>inspectWdiLastNonempty(payload(),{now,registrySource:"broken",missingIso3}),/REGISTRY_INVALID/);
 assert.throws(()=>inspectWdiLastNonempty(payload(),{now:new Date("invalid"),registrySource,missingIso3}),/CLOCK_INVALID/);
});
test("one official GET and provider-denial fail closed",async()=>{
 let calls=0;
 const x=await observeWdiLastNonempty({now,registrySource,missingIso3,
  fetchImpl:async(url,init)=>{calls++;assert.equal(init.redirect,"error");return Response.json(payload());}});
 assert.equal(calls,1);
 assert.equal(x.request_count,1);
 assert.equal(x.payments,0);
 await assert.rejects(()=>observeWdiLastNonempty({now,missingIso3,fetchImpl:async()=>new Response("403",{status:403})}),/DENIED_OR_QUOTA/);
 await assert.rejects(()=>observeWdiLastNonempty({now,missingIso3,fetchImpl:async()=>new Response("x",{headers:{"content-length":"900000"}})}),/BODY_LIMIT/);
});

test("33 real WDI missing countries are split 17/16 within exactly two additional free GETs",()=>{
 const all=/const COUNTRY_ROWS=`([^`]+)`/u.exec(registrySource)[1].trim()
   .split("\n").map(x=>x.split("|")[0]);
 const missing=all.slice(0,33);
 const plan=planWdiMissingCountryBatches(missing,registrySource);
 assert.deepEqual(plan.batches.map(x=>x.length),[17,16]);
 assert.equal(plan.max_extra_source_calls,2);
 assert.equal(plan.unprobed_country_count,0);
 assert.deepEqual(plan.batches.flat(),[...missing].sort());
 const reports=plan.batches.map(batch=>inspectWdiLastNonempty([
   {page:1,pages:1,total:batch.length*2},
   batch.flatMap(iso3=>[
     {countryiso3code:iso3,indicator:{id:"FP.CPI.TOTL.ZG"},date:"2024",value:2.5},
     {countryiso3code:iso3,indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2023",value:1.1}
   ])
 ],{now,registrySource,missingIso3:batch}));
 const merged=combineWdiMissingCountryBatches(plan,reports);
 assert.equal(merged.status,"OFFICIAL_HISTORICAL_PERIODS_OBSERVED");
 assert.equal(merged.actually_queried_missing_countries,33);
 assert.equal(merged.not_yet_queried_missing_countries,0);
 assert.equal(merged.observed_source_requests,2);
 assert.equal(merged.target_country_reference_years_by_indicator["FP.CPI.TOTL.ZG"].length,33);
 assert.equal(merged.verified_current_195x3_country_domain_events,false);
 assert.equal(merged.paid_delivery_enabled,false);
 assert.doesNotMatch(JSON.stringify(merged),/2\.5|1\.1/);
});
test("partial World Bank 403/429 stops same-provider batch and never claims all missing found",()=>{
 const all=/const COUNTRY_ROWS=`([^`]+)`/u.exec(registrySource)[1].trim()
  .split("\n").map(x=>x.split("|")[0]);
 const plan=planWdiMissingCountryBatches(all.slice(0,33),registrySource);
 const failed=combineWdiMissingCountryBatches(plan,[],{failure:"WDI_BACKFILL_DENIED_OR_QUOTA"});
 assert.equal(failed.status,"UNVERIFIED_OR_UNAVAILABLE");
 assert.equal(failed.observed_source_requests,1);
 assert.equal(failed.actually_queried_missing_countries,0);
 assert.equal(failed.not_yet_queried_missing_countries,33);
 const tooMany=planWdiMissingCountryBatches(all.slice(0,40),registrySource);
 assert.equal(tooMany.unprobed_country_count,6);
 assert.equal(tooMany.all_requested_gaps_checked,false);
 assert.equal(tooMany.batches.flat().length,34);
 assert.throws(()=>planWdiMissingCountryBatches(["EAS"],registrySource),/TARGET_INVALID/);
 assert.throws(()=>planWdiMissingCountryBatches(["IND","IND"],registrySource),/TARGET_INVALID/);
});

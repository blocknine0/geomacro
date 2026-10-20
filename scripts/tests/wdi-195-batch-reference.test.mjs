import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {wdiBulkQueryUrl,summarizeWorldBank195Batch,observeWorldBank195} from "../lib/wdi-195-batch-reference.mjs";
const source=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const now=new Date("2026-10-20T08:00:00Z");
const rows=[
 {countryiso3code:"IND",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:5.4},
 {countryiso3code:"IND",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2025",value:6.0},
 {countryiso3code:"PSE",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:null},
 {countryiso3code:"USA",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2026",value:null},
 {countryiso3code:"EAS",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:4.0}
];
const fixture=()=>[{page:1,pages:1,total:rows.length},rows];
test("one no-key WDI bulk GET covers all 195 routing rows without inventing values",()=>{
 const url=new URL(wdiBulkQueryUrl(now));
 assert.equal(url.hostname,"api.worldbank.org");
 assert.equal(url.searchParams.get("per_page"),"1200");
 assert.equal(url.searchParams.get("source"),"2");
 assert.equal(url.searchParams.get("date"),"2025:2026");
 assert.equal(url.searchParams.get("page"),"1");
 assert.ok(url.pathname.includes("FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG"));
 const receipt=summarizeWorldBank195Batch(fixture(),{now,registrySource:source});
 assert.equal(receipt.iso3_routing_universe_count,195);
 assert.equal(receipt.per_country_reference_availability.length,195);
 assert.equal(receipt.indicators[0].canonical_countries_with_recent_nonnull_values,1);
 assert.equal(receipt.indicators[1].canonical_countries_with_recent_nonnull_values,1);
 assert.equal(receipt.per_country_reference_availability.find(x=>x.iso3==="VAT")
   .latest_available_observation_year["FP.CPI.TOTL.ZG"],null);
 assert.equal(receipt.per_country_reference_availability.find(x=>x.iso3==="IND")
   .latest_available_observation_year["FP.CPI.TOTL.ZG"],2025);
 assert.equal(receipt.realtime_fx_quotes_verified,false);
 assert.equal(receipt.all_195_macro_countries_current,false);
 assert.equal(receipt.raw_provider_data_stored,false);
 assert.equal(receipt.source_calls,1);
 assert.doesNotMatch(JSON.stringify(receipt),/5\.4|6\.0/);
});
test("pagination/unknown/future/substituted registry fail closed",()=>{
 assert.throws(()=>summarizeWorldBank195Batch([{page:1,pages:2,total:5000},rows],{now,registrySource:source}),/PAGINATION_OR_SHAPE/);
 const invalid=fixture();invalid[1][0]={...invalid[1][0],date:"2027"};
 const r=summarizeWorldBank195Batch(invalid,{now,registrySource:source});
 assert.equal(r.indicators[0].canonical_countries_with_recent_nonnull_values,0);
 assert.throws(()=>summarizeWorldBank195Batch(fixture(),{now,registrySource:"country garbage"}),/COUNTRY_CANON_INVALID/);
});
test("bounded response and provider denial preserve no-funds policy",async()=>{
 let calls=0;
 const good=await observeWorldBank195({now,registrySource:source,
   fetchImpl:async(url,opts)=>{calls++;assert.equal(opts.redirect,"error");return Response.json(fixture());}});
 assert.equal(good.source_calls,1);
 assert.equal(calls,1);
 await assert.rejects(()=>observeWorldBank195({now,fetchImpl:async()=>new Response("denied",{status:429})}),/WDI_DENIED_OR_QUOTA/);
 await assert.rejects(()=>observeWorldBank195({now,fetchImpl:async()=>new Response("x",{headers:{"content-length":"999999"}})}),/WDI_BODY_LIMIT/);
 await assert.rejects(()=>observeWorldBank195({now:new Date("invalid"),fetchImpl:async()=>{calls++;return Response.json(fixture());}}),/WDI_CLOCK_INVALID/);
 assert.equal(calls,1);
});

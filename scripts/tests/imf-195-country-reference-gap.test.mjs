import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 IMF_GAP_INDICATORS,imfPeriodUrl,inspectImfDataMapper195,
 observeImf195,compareWdiImfPresence
} from "../lib/imf-195-country-reference-gap.mjs";
const now=new Date("2026-10-20T10:00:00Z");
const registrySource=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const sample=(indicator)=>({values:{[indicator]:{
  IND:{"2025":6.5},PSE:{"2025":null},VAT:{"2025":""},
  CHN:{"2025":"4.5"},USA:{"2025":"NaN"},
  EAS:{"2025":9.3},TWN:{"2025":3.5},AFG:{"2026":2.1}
}}});
test("only two official indicator URLs and the last completed calendar year",()=>{
 assert.deepEqual(IMF_GAP_INDICATORS.map(x=>x.imf),["NGDP_RPCH","PCPIPCH"]);
 for(const x of IMF_GAP_INDICATORS){
  const u=new URL(imfPeriodUrl(x.imf,now));
  assert.equal(u.host,"www.imf.org");
  assert.equal(u.searchParams.get("periods"),"2025");
  assert.equal(u.pathname,"/external/datamapper/api/v1/"+x.imf);
 }
 assert.throws(()=>imfPeriodUrl("NGDP",now),/IMF_INDICATOR_NOT_ALLOWED/);
});
test("an independent IMF WEO reference is NOT a verified observed actual",()=>{
 const x=inspectImfDataMapper195(sample("NGDP_RPCH"),"NGDP_RPCH",{now,registrySource});
 assert.equal(x.countries_with_imf_reference,2);
 assert.deepEqual(x.countries_with_imf_reference_iso3,["CHN","IND"]);
 assert.equal(x.countries_missing_imf_reference,193);
 assert.equal(x.imf_actual_vs_estimate_vs_forecast_verified,false);
 assert.equal(x.source_observation_is_current_release,false);
 assert.equal(x.paid_delivery_enabled,false);
 assert.equal(x.raw_publisher_values_stored,false);
 assert.doesNotMatch(JSON.stringify(x),/6.5|4.5/);
});
test("reject invalid/empty source bodies and tampered 195-registry",()=>{
 assert.throws(()=>inspectImfDataMapper195({values:{}},"NGDP_RPCH",{now,registrySource}),/IMF_VALUES_SCHEMA_INVALID/);
 assert.throws(()=>inspectImfDataMapper195(sample("NGDP_RPCH"),"NGDP_RPCH",{now,registrySource:"tampered"}),/IMF_COUNTRY_REGISTRY_INVALID/);
 assert.throws(()=>inspectImfDataMapper195(sample("NGDP_RPCH"),"NGDP_RPCH",{now:new Date("invalid"),registrySource}),/IMF_CLOCK_INVALID/);
});
test("2 bounded calls, denial isolated, no alternate identity and no paid output",async()=>{
 const calls=[];
 const receipt=await observeImf195({now,registrySource,fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   return url.includes("PCPIPCH")?new Response("403",{status:403}):
      Response.json(sample("NGDP_RPCH"));
 }});
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.opts.redirect==="error"&&x.opts.method==="GET"));
 assert.equal(receipt.verified_indicator_transports,1);
 assert.equal(receipt.indicators[0].countries_with_imf_reference,2);
 assert.equal(receipt.indicators[1].reason,"IMF_DENIED_OR_QUOTA");
 assert.equal(receipt.all_195_countries_with_current_live_macro_verified,false);
 assert.equal(receipt.payments,0);
 assert.equal(receipt.d1_writes,0);
});
test("IMF-only countries supplement missing WDI reference, not replace observed actuals",()=>{
 const imf={indicators:[
  {aligned_wdi_indicator:"NY.GDP.MKTP.KD.ZG",reference_year:2025,countries_with_imf_reference_iso3:["IND","CHN","VAT"]},
  {aligned_wdi_indicator:"FP.CPI.TOTL.ZG",reference_year:2025,countries_with_imf_reference_iso3:["IND","CHN"]}
 ]};
 const wdi={per_country_reference_availability:[
  {iso3:"IND",latest_available_observation_year:{
   "NY.GDP.MKTP.KD.ZG":2025,"FP.CPI.TOTL.ZG":2025}},
  {iso3:"PSE",latest_available_observation_year:{
   "NY.GDP.MKTP.KD.ZG":null,"FP.CPI.TOTL.ZG":null}}
 ]};
 const r=compareWdiImfPresence(wdi,imf);
 assert.equal(r[0].wdi_annual_observation_presence,1);
 assert.equal(r[0].country_reference_union_availability,3);
 assert.deepEqual(r[0].imf_additional_reference_only_iso3,["CHN","VAT"]);
 assert.equal(r[0].imf_reference_is_observed_actual_verified,false);
 assert.equal(r[1].country_reference_union_availability,2);
 assert.ok(r[1].missing_reference_iso3.includes("PSE"));
 assert.ok(!r[1].missing_reference_iso3.includes("IND"));
});

test("a shared IMF 403 holds second indicator instead of probing same denied publisher",async()=>{
 let calls=0;
 const receipt=await observeImf195({now,registrySource,fetchImpl:async()=>{
  calls++;return new Response("403",{status:403});
 }});
 assert.equal(calls,1);
 assert.equal(receipt.requests_attempted,1);
 assert.equal(receipt.verified_indicator_transports,0);
 assert.equal(receipt.indicators[0].reason,"IMF_DENIED_OR_QUOTA");
 assert.equal(receipt.indicators[1].reason,"IMF_PROVIDER_DENIED_HOLD");
 assert.equal(receipt.paid_delivery_enabled,undefined);
 assert.equal(receipt.payments,0);
});

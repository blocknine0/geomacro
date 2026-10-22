import test from "node:test";
import assert from "node:assert/strict";
import {inspectCountryAnnualResponse,probeProductionCountryMacro} from "./verify-country-macro-production-readback.mjs";
const now=new Date("2026-10-22T12:30:00Z");
function result(country="IND"){
 return {schema:"geomacro.live-structured.v1",
   status:"OFFICIAL_ANNUAL_REFERENCE_FETCHED",category:"macro-fx",
   country_iso3:country,checked_at:now.toISOString(),source_checked_at:now.toISOString(),
   source_mode:"WORLD_BANK_WDI_SOURCE_2",
   coverage:"COUNTRY_OFFICIAL_ANNUAL_REFERENCE_ONLY_NOT_CURRENT_NEWS",
   source_period_is_not_retrieval_time:true,original_publication_time_verified:false,
   payment_required:false,chargeable:false,settlement_performed:false,
   durable_storage_written:false,signed_gro_required:false,
   signature:null,score:null,raw_upstream_delivered:false,
   source_commercial_rights_verified:false,
   observations:[{kind:"FP.CPI.TOTL.ZG",observation_period:"2025",
     clock_semantics:"reference_year",finding:country+" official 2025 inflation: 4.2%",
     why_it_matters:"Historical annual reference.",attribution:"World Bank WDI (CC BY 4.0)",
     source_rights_scope:"WDI_SOURCE_2_CC_BY_4_0",
     original_event_time_verified:false,score:null}],observation_count:1};
}
test("accepts only actual annual source-2 country observation with truthful source period",()=>{
 const ok=inspectCountryAnnualResponse({country_iso3:"IND"},{httpStatus:200,body:result(),now});
 assert.equal(ok.accepted,true);
 assert.deepEqual(ok.official_reference_periods,["2025"]);
 assert.equal(ok.customer_chargeable,false);
});
test("rejects forged country, retrieval as publication, raw data or changed rights",()=>{
 const attempts=[
  {...result(),country_iso3:"CHN"},
  {...result(),coverage:"ALL_195_LIVE"},
  {...result(),original_publication_time_verified:true},
  {...result(),raw_upstream_delivered:true},
  {...result(),observations:[{...result().observations[0],source_rights_scope:"UNKNOWN"}]},
  {...result(),checked_at:"2025-01-01T00:00:00Z"},
  {...result(),observations:[{...result().observations[0],observation_period:"2027"}]},
 ];
 for(const body of attempts){
   assert.equal(inspectCountryAnnualResponse({country_iso3:"IND"},{httpStatus:200,body,now}).accepted,false);
 }
});
test("outside-in probes bounded two canonical countries, treats partial healthy transport as red",async()=>{
 const calls=[];
 const good=await probeProductionCountryMacro({now,fetchImpl:async(url,init)=>{
   const country=JSON.parse(init.body).country_iso3;
   calls.push({url,init,country});
   return Response.json(result(country));
 }});
 assert.equal(good.status,"PRODUCTION_ANNUAL_READBACK_ACCEPTED");
 assert.equal(good.accepted_countries,2);
 assert.deepEqual(calls.map(x=>x.country),["IND","USA"]);
 assert.equal(calls.every(x=>x.init.method==="POST"&&x.init.redirect==="error"),true);
 assert.equal(good.claim_all_585_live_verified,false);
 assert.equal(good.payment_attempted,false);
 let counter=0;
 const partial=await probeProductionCountryMacro({now,fetchImpl:async()=>{
  counter++;
  return counter===1?Response.json(result("IND")):
   Response.json({error:"upstream denied"},{status:429});
 }});
 assert.equal(partial.status,"PRODUCTION_DATA_DELIVERY_UNVERIFIED");
 assert.equal(partial.accepted_countries,1);
 assert.equal(partial.results[1].reason,"PUBLIC_API_RATE_LIMITED");
});
test("cannot relabel original-article response as verified annual source delivery",()=>{
 const x={...result(),status:"CURRENT_ORIGINAL_OBSERVATION_DERIVED",
   source_mode:"DIRECT_ORIGINAL_PUBLISHERS"};
 assert.equal(inspectCountryAnnualResponse({country_iso3:"IND"},{httpStatus:200,body:x,now}).accepted,false);
});

test("production build marker rejects old published Lovable SHA before POST",async()=>{
 const expected="a".repeat(40),observed="b".repeat(40),calls=[];
 const out=await probeProductionCountryMacro({now,expectedSha:expected,
  fetchImpl:async (url,opts)=>{
    calls.push({url,method:opts.method});
    return Response.json({schema_version:"geomacro.deployment-build.v1",
      canonical_repository:"blocknine0/geomacro",canonical_main_sha:observed});
  }});
 assert.equal(out.status,"PUBLISHED_BUILD_NOT_AT_EXPECTED_MAIN_SHA");
 assert.equal(out.countries_checked,0);
 assert.equal(out.accepted_countries,0);
 assert.equal(out.deployed_source.match,false);
 assert.equal(out.deployed_source.observed_short,observed.slice(0,12));
 assert.deepEqual(calls.map(x=>x.method),["GET"]);
});
test("match on deployed SHA is required before two real annual customer POSTs",async()=>{
 const expected="c".repeat(40);const calls=[];
 const out=await probeProductionCountryMacro({now,expectedSha:expected,
  fetchImpl:async (url,opts)=>{
   calls.push(opts.method);
   if(opts.method==="GET")return Response.json({
     schema_version:"geomacro.deployment-build.v1",
     canonical_repository:"blocknine0/geomacro",
     canonical_main_sha:expected
   });
   const country=JSON.parse(opts.body).country_iso3;
   return Response.json(result(country));
  }});
 assert.equal(out.status,"PRODUCTION_ANNUAL_READBACK_ACCEPTED");
 assert.equal(out.deployed_source.match,true);
 assert.deepEqual(calls,["GET","POST","POST"]);
});
test("422 is classified by actual source failure, not assumed annual deficiency",()=>{
 const a=inspectCountryAnnualResponse({country_iso3:"IND"},
  {httpStatus:422,body:{reason:"NO_CURRENT_COUNTRY_TOPIC_ORIGINAL"},now});
 const b=inspectCountryAnnualResponse({country_iso3:"IND"},
  {httpStatus:422,body:{reason:"NO_COUNTRY_ANNUAL_REFERENCE_AVAILABLE"},now});
 assert.equal(a.reason,"NO_CURRENT_COUNTRY_ORIGINAL_NEWS");
 assert.equal(b.reason,"NO_COUNTRY_OFFICIAL_REFERENCE_AVAILABLE");
});

import test from "node:test";
import assert from "node:assert/strict";
import {observeWdiDirectAcceptance} from "./diagnose-country-wdi-production.mjs";
const now=new Date("2026-10-22T12:00:00Z");
test("genuine source reference is counted only for scoped numeric country indicators",async()=>{
 const out=await observeWdiDirectAcceptance({now,fetchImpl:async(url,init)=>{
  assert.equal(init.redirect,"error");
  const country=new URL(url).pathname.includes("/ind/")?"IND":"USA";
  return Response.json([{page:1,pages:1,total:2},[
   {countryiso3code:country,indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:3.8},
   {countryiso3code:"EAS",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2025",value:7.9}
  ]]);
 }});
 assert.equal(out.working_country_references,2);
 assert.equal(out.rows[0].matching_official_numeric_rows,1);
 assert.equal(out.rows[0].response_has_invalid_country_code,true);
 assert.equal(out.rows[0].original_publication_time_verified,false);
 assert.equal(out.paid_delivery_enabled,false);
 assert.doesNotMatch(JSON.stringify(out),/7\.9|3\.8/);
});
test("upstream access denial and no values stay explicit",async()=>{
 let n=0;
 const out=await observeWdiDirectAcceptance({now,fetchImpl:async()=>{
  n++;
  if(n===1)return Response.json([{page:1,pages:1,total:1},[
   {countryiso3code:"IND",indicator:{id:"FP.CPI.TOTL.ZG"},date:"2025",value:null}
  ]]);
  return new Response(null,{status:429});
 }});
 assert.equal(out.working_country_references,0);
 assert.equal(out.rows[0].status,"DIRECT_WDI_NO_COUNTRY_MATCHING_NUMBERS");
 assert.equal(out.rows[1].status,"DIRECT_WDI_SOURCE_UNAVAILABLE");
 assert.equal(out.rows[1].reason,"UPSTREAM_ACCESS_OR_QUOTA");
});

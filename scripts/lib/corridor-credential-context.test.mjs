import test from "node:test";
import assert from "node:assert/strict";
import {collectCredentialCorridorContext,CREDENTIAL_CORRIDOR_IDS}
 from "./corridor-credential-context.mjs";
const now=new Date("2026-11-02T00:06:00.000Z");
const keys={
 GEOMACRO_FRED_API_KEY:"a".repeat(32),
 GEOMACRO_RELIEFWEB_APPNAME:"GeomacroCorridor_2026_a",
 GEOMACRO_CRYPTOCOMPARE_API_KEY:"c".repeat(40)
};
const date=now.toISOString().slice(0,10);
const fred=(value)=>({observations:[{date,value:String(value)}]});
const news={Data:[{id:"cc-123",published_on:Math.floor(now.getTime()/1000)-3600},
 {id:"cc-124",published_on:Math.floor(now.getTime()/1000)-3600},
 {id:"cc-125",published_on:Math.floor(now.getTime()/1000)-25*3600}]};
const mock=async(url,options)=>{
 const host=new URL(url).hostname;
 if(host==="api.stlouisfed.org"){
  assert.equal(new URL(url).searchParams.get("api_key"),keys.GEOMACRO_FRED_API_KEY);
  const series=new URL(url).searchParams.get("series_id");
  assert.ok(["DGS10","DCOILWTICO"].includes(series));
  return Response.json(fred(series==="DGS10"?4.1:72.6));
 }
 if(host==="min-api.cryptocompare.com"){
  assert.equal(options.headers.Authorization,"Apikey "+keys.GEOMACRO_CRYPTOCOMPARE_API_KEY);
  return Response.json(news);
 }
 throw Error("BAD_HOST");
};
const relief=async({appname})=>{
 assert.equal(appname,keys.GEOMACRO_RELIEFWEB_APPNAME);
 return {status:"LIVE_METADATA_TRANSPORT",sampled_original_reports_within_24h:17};
};
test("keys absent => 4 explicit statuses, no network calls and no paid Freightos",async()=>{
 const result=await collectCredentialCorridorContext({now,keys:{},
  fetchImpl:async()=>{throw Error("NOT_EXPECTED")},
  observeReliefWeb:async()=>{throw Error("NOT_EXPECTED")}
 });
 assert.deepEqual(result.source_checks.map(x=>x.id),CREDENTIAL_CORRIDOR_IDS);
 assert.equal(result.observation_count,0);
 assert.equal(result.source_checks.filter(x=>x.state==="PROVIDER_API_AUTH_REQUIRED").length,3);
 assert.equal(result.source_checks.at(-1).state,"PROVIDER_ENTITLEMENT_DISABLED_NO_PAID_PROVIDER");
 assert.equal(result.commercial_rights_verified,false);
 assert.equal(result.credential_values_written,false);
});
test("keys installed -> FRED daily, ReliefWeb native recent count, CCData 24h sample",async()=>{
 const result=await collectCredentialCorridorContext({now,force:true,keys,
  fetchImpl:mock,observeReliefWeb:relief});
 assert.equal(result.observation_count,4);
 assert.deepEqual(result.observations.map(x=>x.source_id),
  ["fred_api","fred_api","reliefweb_v2","cryptocompare_news"]);
 const cc=result.observations.find(x=>x.source_id==="cryptocompare_news");
 assert.equal(cc.numeric_value,2);
 assert.ok(result.observations.every(x=>x.context_only===true&&
  x.commercial_rights_verified===false&&x.independently_verified_event===false));
 assert.ok(!JSON.stringify(result).includes(keys.GEOMACRO_FRED_API_KEY));
 assert.ok(!JSON.stringify(result).includes(keys.GEOMACRO_CRYPTOCOMPARE_API_KEY));
 assert.ok(!JSON.stringify(result).includes(keys.GEOMACRO_RELIEFWEB_APPNAME));
});
test("provider 403 is recorded; no retry, no reference evidence fabricated",async()=>{
 let attempts=0;
 const result=await collectCredentialCorridorContext({now,force:true,keys,
  fetchImpl:async()=>{attempts++;return new Response("",{status:403})},
  observeReliefWeb:async()=>({status:"ACCESS_DENIED_OR_QUOTA"})});
 assert.equal(attempts,1);
 assert.equal(result.observation_count,0);
 assert.equal(result.source_checks.find(x=>x.id==="fred_api").state,"PROVIDER_ACCESS_DENIED");
 assert.equal(result.source_checks.find(x=>x.id==="reliefweb_v2").state,"PROVIDER_ACCESS_DENIED");
 assert.equal(result.source_checks.find(x=>x.id==="cryptocompare_news").state,"PROVIDER_ACCESS_DENIED");
});
test("cadence bounds provider usage: FRED 6h, ReliefWeb 2h, CCData hourly",async()=>{
 const result=await collectCredentialCorridorContext({now:new Date("2026-11-02T01:06:00.000Z"),
  keys,fetchImpl:async(url)=>Response.json(news),
  observeReliefWeb:async()=>{throw Error("MUST_BE_SKIPPED")}});
 assert.equal(result.source_checks[0].state,"NOT_DUE_SOURCE_NATIVE_CADENCE");
 assert.equal(result.source_checks[1].state,"NOT_DUE_SOURCE_NATIVE_CADENCE");
 assert.equal(result.source_checks[2].state,"OFFICIAL_REFERENCE_OBSERVED");
});

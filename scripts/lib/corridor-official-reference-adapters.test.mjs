import test from "node:test";
import assert from "node:assert/strict";
import {collectCorridorOfficialReferences,OFFICIAL_CORRIDOR_ADAPTER_IDS}
 from "./corridor-official-reference-adapters.mjs";
const NOW=new Date("2026-11-02T00:06:00.000Z");
const gdelt="45000 http://data.gdeltproject.org/gdeltv2/20261102000000.export.CSV.zip\n"+
 "15000 http://data.gdeltproject.org/gdeltv2/20261102000000.gkg.CSV.zip\n"+
 "2100 http://data.gdeltproject.org/gdeltv2/20261102000000.mentions.CSV.zip\n";
const world=JSON.stringify([{page:1,pages:1,per_page:50,total:2},[
 {country:{id:"US"},indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2025",value:2.1},
 {country:{id:"IN"},indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2025",value:6.7}
]]);
const ecb="KEY,TIME_PERIOD,OBS_VALUE\n"+
 '"EXR.D.USD.EUR.SP00.A","2026-10-30","1.1521"\n';
const eurostat=JSON.stringify({id:["freq","geo","coicop","time"],
 size:[1,1,1,2],
 dimension:{time:{category:{index:{"2026-09":0,"2026-10":1}}}},
 value:{"0":2.1,"1":2.3}});
const sources={gdelt,world,ecb,eurostat};
const observer=async()=>({routes:[{
 corridor_id:"suez_canal",latest_observation_day:"2026-11-01",
 observation_state:"DAILY_REFERENCE_OBSERVED",consecutive_day_change_pct:4.8
}]});
const sourceHost=url=>new URL(url).hostname.toLowerCase();
const fetchImpl=async url=>{
 if(sourceHost(url)==="data.gdeltproject.org")return new Response(sources.gdelt,{status:200});
 if(sourceHost(url)==="api.worldbank.org")return new Response(sources.world,{status:200});
 if(sourceHost(url)==="data-api.ecb.europa.eu")return new Response(sources.ecb,{status:200});
 if(sourceHost(url)==="ec.europa.eu")return new Response(sources.eurostat,{status:200});
 throw Error("UNPINNED");
};
test("source-specific adapters gather real facts without manufacturing news",async()=>{
 const result=await collectCorridorOfficialReferences({now:NOW,force:true,fetchImpl,
   observePortwatch:observer});
 assert.deepEqual(OFFICIAL_CORRIDOR_ADAPTER_IDS,
  ["gdelt_v2_15m","world_bank_wdi","ecb_data","eurostat_data","imf_portwatch"]);
 assert.equal(result.source_checks.length,5);
 assert.equal(result.observation_count,9);
 assert.equal(result.observations.filter(x=>x.source_id==="gdelt_v2_15m").length,3);
 assert.equal(result.observations.filter(x=>x.source_id==="world_bank_wdi").length,2);
 assert.equal(result.observations.filter(x=>x.source_id==="ecb_data").length,1);
 assert.equal(result.observations.filter(x=>x.source_id==="eurostat_data").length,2);
 assert.equal(result.observations.filter(x=>x.source_id==="imf_portwatch").length,1);
 assert.ok(result.observations.every(x=>x.context_only===true&&
   x.independently_verified_event===false&&x.commercial_rights_verified===false));
 assert.equal(result.website_intelligence_writes,0);
 const suez=result.observations.find(x=>x.source_id==="imf_portwatch");
 assert.deepEqual(suez.corridor_ids,["suez_canal"]);
 assert.equal(suez.numeric_value,4.8);
});
test("official source-native cadences reduce provider calls and never assert real-time GDP",async()=>{
 const urls=[];
 const output=await collectCorridorOfficialReferences({
   now:new Date("2026-11-02T01:06:00.000Z"),fetchImpl:async url=>{
    urls.push(url);return new Response(gdelt)},
   observePortwatch:async()=>{throw Error("should not run")}
 });
 assert.equal(urls.length,1);
 assert.equal(output.source_checks.filter(x=>x.state==="NOT_DUE_SOURCE_NATIVE_CADENCE").length,4);
 assert.equal(output.source_checks.find(x=>x.id==="gdelt_v2_15m").state,
  "OFFICIAL_REFERENCE_OBSERVED");
});
test("provider 403 and malformed API payloads are reported, never silently replaced",async()=>{
 const output=await collectCorridorOfficialReferences({now:NOW,force:true,
  fetchImpl:async url=>sourceHost(url)==="data.gdeltproject.org"?
   new Response("",{status:403}):new Response("<html>not-json</html>"),
  observePortwatch:async()=>{throw Error("access denied")}
 });
 assert.equal(output.observation_count,0);
 assert.equal(output.source_checks.find(x=>x.id==="gdelt_v2_15m").state,"DENIED_NO_RETRY");
 assert.equal(output.source_checks.find(x=>x.id==="world_bank_wdi").state,
   "OFFICIAL_REFERENCE_SCHEMA_UNVERIFIED");
 assert.equal(output.source_checks.find(x=>x.id==="imf_portwatch").state,
   "OFFICIAL_REFERENCE_UNAVAILABLE");
});
test("reference ids deterministic and no raw publisher articles persisted",async()=>{
 const run1=await collectCorridorOfficialReferences({now:NOW,force:true,fetchImpl,
   observePortwatch:observer});
 const run2=await collectCorridorOfficialReferences({now:new Date(NOW.getTime()+60_000),
   force:true,fetchImpl,observePortwatch:observer});
 assert.deepEqual(run1.observations.map(x=>x.id),run2.observations.map(x=>x.id));
 assert.ok(!JSON.stringify(run1).includes("GDP grows"));
});

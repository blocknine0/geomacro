import assert from "node:assert/strict";
import {test} from "node:test";
import {fetchWorldBank} from "../adapters/world-bank.mjs";
import {fetchEurostat} from "../adapters/eurostat.mjs";
import {parseUsGSMineralsYearbookProductionCsv,parseUsGSMineralsYearbookFacilitiesCsv} from "../adapters/usgs-minerals-yearbook.mjs";

async function withJsonResponse(payload,run) {
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status:200,headers:{"content-type":"application/json"}});
  try{return await run();}finally{globalThis.fetch=previous;}
}

test("WDI exact country/indicator/value; year is not published_at",async()=>{
  const payload=[{lastupdated:"2026-10-01"},[
    {countryiso3code:"IND",date:"2025",indicator:{id:"FP.CPI.TOTL.ZG"},value:3.4},
    {countryiso3code:"CHN",date:"2025",indicator:{id:"FP.CPI.TOTL.ZG"},value:5.0},
    {countryiso3code:"IND",date:"2024",indicator:{id:"NY.GDP.MKTP.CD"},value:10},
    {countryiso3code:"IND",date:"2023",indicator:{id:"FP.CPI.TOTL.ZG"},value:"6.3"}
  ]];
  const rows=await withJsonResponse(payload,()=>fetchWorldBank("IND",{
    indicators:["FP.CPI.TOTL.ZG"],source:"2"
  }));
  assert.equal(rows.length,1);
  assert.equal(rows[0].country_iso3,"IND");
  assert.equal(rows[0].published_at,null);
  assert.equal(rows[0].category,"MACRO");
  const summary=JSON.parse(rows[0].summary);
  assert.equal(summary.period,"2025");
  assert.equal(summary.value,3.4);
  assert.equal(summary.source_last_updated,"2026-10-01");
  assert.equal(summary.native_original_publication_proven,false);
  assert.equal(summary.historical_reference_only,true);
  await assert.rejects(fetchWorldBank("IND/../../"),/WORLD_BANK_ISO3_INVALID/);
});

test("Eurostat country dimension and reference period do not invent native release",async()=>{
  const data={
    version:"2.0",id:["geo","time"],size:[2,1],
    dimension:{
      geo:{category:{index:{DE:0,FR:1},label:{DE:"Germany",FR:"France"}}},
      time:{category:{index:{"2025-Q1":0}}}
    },
    value:{"0":123.4,"1":567.8},updated:"2026-10-14T00:00:00Z"
  };
  const rows=await withJsonResponse(data,()=>fetchEurostat("https://ec.europa.eu/any","DEU"));
  assert.equal(rows.length,1);
  assert.equal(rows[0].country_iso3,"DEU");
  assert.equal(rows[0].published_at,null);
  const summary=JSON.parse(rows[0].summary);
  assert.equal(summary.geo,"DE");
  assert.equal(summary.value,123.4);
  assert.equal(summary.reference_period,"2025-Q1");
  assert.equal(summary.native_original_publication_proven,false);
  assert.equal((await withJsonResponse(data,()=>fetchEurostat("https://ec.europa.eu/any","XXX"))).length,0);
  const tooLarge={...data,size:[50000,1]};
  await assert.rejects(withJsonResponse(tooLarge,()=>fetchEurostat("https://ec.europa.eu/any","DEU")),
    /EUROSTAT_DIMENSION_INVALID|EUROSTAT_DATASET_TOO_LARGE/);
});

test("USGS historical minerals and facilities cannot claim fixed publication",()=>{
  const production=parseUsGSMineralsYearbookProductionCsv(
    "country,commodity,unit,2024\nIndia,lithium,tonnes,120\n",{countryIso3:"IND"});
  assert.equal(production.length,1);
  assert.equal(production[0].raw.year,2024);
  assert.equal(production[0].raw.value,120);
  assert.equal(production[0].published_at,null);
  assert.equal(production[0].observed_at,null);
  const facilities=parseUsGSMineralsYearbookFacilitiesCsv(
    "country,commodity,facility,capacity\nIndia,lithium,Plant A,300\n",{countryIso3:"IND"});
  assert.equal(facilities.length,1);
  assert.equal(facilities[0].published_at,null);
  assert.equal(facilities[0].observed_at,null);
});

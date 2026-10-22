import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeComtrade195Reporters,observeComtrade195Minerals,
 MINERAL_TRADE_SENTINELS} from "../lib/comtrade-195-actual-mineral-reference.mjs";
const now=new Date("2026-10-22T09:00:00Z");
const isoSource=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const catalog={CHN:{code:156},IDN:{code:360},CHL:{code:152}};
const sample=(iso3,opts,amount)=>[{
  raw:{reporter_iso3:iso3,reporter_code:catalog[iso3].code,
    period:opts.period,cmd_code:opts.cmdCode,
    flow_code:"X",partner_code:"0",evidence_type:"TRADE_EXPORT",
    preview_limited:true,commercial_rights_verified:false,
    hs_vintage_verified:false,trade_value:amount}
}];
test("canonical 195 mapped to live official reporter entries not invented coverage",()=>{
  const census=summarizeComtrade195Reporters(catalog,{registrySource:isoSource});
  assert.equal(census.canonical_countries,195);
  assert.equal(census.official_reporter_codes_confirmed,3);
  assert.equal(census.countries_missing_valid_reporter,192);
  assert.ok(census.missing_reporter_iso3.includes("VAT"));
  assert.equal(census.has_all_195_reporter_codes,false);
  assert.equal(census.verified_current_trade_observations,0);
  assert.throws(()=>summarizeComtrade195Reporters([]),/CATALOG_SHAPE/);
  assert.throws(()=>summarizeComtrade195Reporters(catalog,{registrySource:"fake"}),/REGISTRY_INVALID/);
});
test("real scoped numeric trade reference observed without making current mine-event claim",async()=>{
  const actual=[];
  const result=await observeComtrade195Minerals({now,registrySource:isoSource,
    fetchCatalog:async()=>catalog,
    fetchRows:async(iso3,opts)=>{
      actual.push({iso3,...opts});
      return sample(iso3,opts,iso3==="CHN"?123000:iso3==="IDN"?0:2000);
    }
  });
  assert.equal(actual.length,3);
  assert.deepEqual(actual.map(x=>x.iso3),["CHN","IDN","CHL"]);
  assert.deepEqual(actual.map(x=>x.cmdCode),["260500","260400","260300"]);
  assert.equal(actual.every(x=>x.period==="2025" && x.partnerCode==="0" &&
    x.category==="CRITICAL_MINERALS" && x.allowPreview===true),true);
  assert.equal(result.source_requests_attempted,4);
  assert.equal(result.verified_annual_numeric_samples,3);
  assert.equal(result.observations[0].normalized_reported_trade_value_usd,123000);
  assert.equal(result.observations[1].normalized_reported_trade_value_usd,0);
  assert.equal(result.current_195x3_coverage_verified,false);
  assert.equal(result.live_incidents_verified,0);
  assert.equal(result.rights_for_paid_output_verified,false);
  assert.equal(result.d1_writes,0);
});
test("multi row, wrong reporter and unauthorised response remain unverified",async()=>{
  let index=0;
  const bad=await observeComtrade195Minerals({now,registrySource:isoSource,
    fetchCatalog:async()=>catalog,
    fetchRows:async(iso3,opts)=>{
      index++;
      if(index===1)return [...sample(iso3,opts,13),...sample(iso3,opts,20)];
      if(index===2)return sample("CHN",opts,20);
      throw Object.assign(new Error("429"),{status:429});
    }
  });
  assert.equal(bad.verified_annual_numeric_samples,0);
  assert.equal(bad.observations[0].status,"NO_UNAMBIGUOUS_NUMERIC_OBSERVATION");
  assert.equal(bad.observations[1].status,"NO_UNAMBIGUOUS_NUMERIC_OBSERVATION");
  assert.equal(bad.observations[2].status,"UNAVAILABLE");
  assert.equal(bad.observations[2].reason,"PROVIDER_DENIED_OR_QUOTA");
  assert.equal(MINERAL_TRADE_SENTINELS.length,3);
});
test("catalog denial does not cause speculative country probes",async()=>{
  let calls=0;
  const result=await observeComtrade195Minerals({now,registrySource:isoSource,
    fetchCatalog:async()=>{throw Error("403");},
    fetchRows:async()=>{calls++;return [];}
  });
  assert.equal(result.catalog_status,"UNAVAILABLE");
  assert.equal(result.catalog_reason,"PROVIDER_DENIED_OR_QUOTA");
  assert.equal(result.verified_annual_numeric_samples,0);
  assert.equal(result.source_requests_attempted,1);
  assert.equal(calls,0);
});

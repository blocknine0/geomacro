#!/usr/bin/env node
// Zero-payment daily first-party macro/minerals source budget:
// 1 World Bank WDI bulk GET plus 2 official national mineral indices GETs.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeWorldBank195} from "../lib/wdi-195-batch-reference.mjs";
import {observeWdiLastNonempty} from "../lib/wdi-195-last-nonempty.mjs";
import {observeTwoMineralIndices} from "../lib/two-official-mineral-release-indices.mjs";
const OUT="artifacts/free-global-source-budget/daily-observation.json";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro" ||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
   throw Error("GLOBAL_FREE_SOURCE_BUDGET_PROTECTED_MAIN_REQUIRED");
const started=new Date(),fail=reason=>({
 schema:"geomacro.wdi-195-two-indicator-reference-audit.v1",
 source_family:"world_bank_wdi",status:"UNVERIFIED_OR_UNAVAILABLE",
 reason:/^WDI_[A-Z_]+$/u.test(String(reason))?String(reason):"WDI_TRANSPORT_UNKNOWN",
 source_calls:1,iso3_routing_universe_count:195,
 indicators:[],per_country_reference_availability:[],
 real_time_fx_quotes_verified:false,paid_delivery_enabled:false
});
let macro;
try{macro=await observeWorldBank195();}
catch(e){macro=fail(e?.name==="TimeoutError"?"WDI_TIMEOUT_25S":e?.message);}
// One targeted historical-period lookup only for actual missing 2025 ISO3s.
const initialRows=Array.isArray(macro.per_country_reference_availability)
  ?macro.per_country_reference_availability:[];
const missingIso3=initialRows.filter(x=>x?.iso3 &&
  (!Number.isInteger(x.latest_available_observation_year?.["FP.CPI.TOTL.ZG"])||
   !Number.isInteger(x.latest_available_observation_year?.["NY.GDP.MKTP.KD.ZG"])))
 .map(x=>x.iso3);
let wdiBackfillCalls=0,wdiBackfill=null;
if(initialRows.length===195&&missingIso3.length>0&&missingIso3.length<=50){
 wdiBackfillCalls=1;
 try{wdiBackfill=await observeWdiLastNonempty({missingIso3});}
 catch(error){
  const reason=String(error?.message??"");
  wdiBackfill={schema:"geomacro.wdi-195-last-nonempty-reference.v1",
    status:"UNVERIFIED_OR_UNAVAILABLE",
    reason:/^WDI_BACKFILL_[A-Z_]+$/u.test(reason)?reason:
      error?.name==="TimeoutError"?"WDI_BACKFILL_TIMEOUT":"WDI_BACKFILL_NETWORK_UNAVAILABLE",
    query_target_is_only_2025_missing_countries:true,
    target_countries_count:missingIso3.length,
    indicators:[],request_count:1,
    verified_current_195x3_country_domain_events:false,
    paid_delivery_enabled:false};
 }
}
const mineral=await observeTwoMineralIndices();
const wdiOk=macro.schema==="geomacro.wdi-195-two-indicator-reference-audit.v1" &&
  Array.isArray(macro.indicators)&&macro.indicators.length===2 &&
  macro.indicators.some(x=>x.canonical_countries_with_recent_nonnull_values>0);
const verdict={
 schema:"geomacro.free-global-macro-minerals-195-source-budget.v1",
 checked_at:started.toISOString(),
 status:!wdiOk?"MACRO_REFERENCE_SOURCE_DEGRADED":
   mineral.healthy_source_count>=1?"MACRO_AND_MINERALS_REFERENCE_CONTEXT_OBSERVED":
   "MACRO_REFERENCE_OBSERVED_MINERALS_DEGRADED",
 nominal_api_requests:3,max_api_requests:5,
 source_requests_observed:macro.source_calls+mineral.upstream_calls+wdiBackfillCalls,
 external_source_budgets:{world_bank_wdi_2025:1,world_bank_wdi_missing_only:1,peru_minem:1,canada_nrcan_geoscan:1},
 targeted_missing_2025_countries:missingIso3.length,
 historical_reference_gap_lookup:wdiBackfill,
 wdi:macro,minerals:mineral,
 // This receipt is reference/health context, NOT news/FX/live mineral output.
 actual_live_fx_streams_verified:0,live_mine_incidents_verified:0,
 independently_verified_country_categories:0,
 live_195x3_coverage_verified:false,paid_data_grants:0,
 raw_external_bytes_stored:false,supabase_requests:0,d1_writes:0,
 b2_requests:0,payments:0
};
mkdirSync("artifacts/free-global-source-budget",{recursive:true,mode:0o700});
writeFileSync(OUT,JSON.stringify(verdict,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 schema:verdict.schema,status:verdict.status,
 nominal_api_requests:3,max_api_requests:5,source_requests_observed:verdict.source_requests_observed,
 historical_gap_lookup_targets:missingIso3.length,
 historical_gap_lookup_status:wdiBackfill?.status??(wdiBackfill?"REFERENCE_PERIODS_OBSERVED":"NOT_REQUIRED_OR_NOT_ELIGIBLE"),
 wdi_indicator_coverage:macro.indicators?.map(x=>({
   indicator:x.id,countries:x.canonical_countries_with_recent_nonnull_values
 }))??[],
 mineral_sources_healthy:mineral.healthy_source_count,
 provider_degradations:mineral.sources.filter(x=>x.status==="UNVERIFIED_OR_UNAVAILABLE").map(x=>({id:x.id,reason:x.reason})),
 wdi_error:macro.reason??null,
 current_195x3_verified:false,paid_data_grants:0,payments:0
}));
if(verdict.source_requests_observed<3||verdict.source_requests_observed>5||
   !wdiOk)process.exitCode=3;

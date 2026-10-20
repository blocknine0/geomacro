#!/usr/bin/env node
// Exactly one optional World Bank public API GET on established daily cron.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeWdiLastNonempty} from "../lib/wdi-195-last-nonempty.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
 throw Error("WDI_BACKFILL_PROTECTED_MAIN_REQUIRED");
const file="artifacts/wdi-195-last-nonempty/receipt.json";
let r;
try{r=await observeWdiLastNonempty();}
catch(e){
 const code=String(e?.message??"");
 r={schema:"geomacro.wdi-195-last-nonempty-reference.v1",
  checked_at:new Date().toISOString(),source_family:"world_bank_wdi",
  status:"UNVERIFIED_OR_UNAVAILABLE",
  reason:/^WDI_BACKFILL_[A-Z_]+$/u.test(code)?code:"WDI_BACKFILL_TRANSPORT_UNKNOWN",
  request_count:1,indicator_count:2,indicators:[],
  source_publication_datetime_verified:false,
  verified_current_195x3_country_domain_events:false,
  paid_delivery_enabled:false,raw_source_values_stored:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0};
}
mkdirSync("artifacts/wdi-195-last-nonempty",{recursive:true,mode:0o700});
writeFileSync(file,JSON.stringify(r,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({schema:r.schema,status:r.status??"REFERENCE_PERIODS_OBSERVED",
  reason:r.reason??null,request_count:1,
  availability:r.indicators.map(x=>({
    indicator:x.indicator,all_history:x.countries_with_any_nonnull_historical_reference,
    last_5_years:x.countries_with_reference_in_last_5_years,
    last_10_years:x.countries_with_reference_in_last_10_years
  })),all_195_fresh_domain_evidence_verified:false,payments:0}));
if(r.status==="UNVERIFIED_OR_UNAVAILABLE")process.exitCode=3;

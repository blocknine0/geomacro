#!/usr/bin/env node
// Scheduled exact-main operator proof. One official no-key reporter catalogue
// request plus at most three public preview mineral trade requests; no money,
// no old Supabase, and no B2/D1 writes.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeComtrade195Minerals} from "../lib/comtrade-195-actual-mineral-reference.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
  throw Error("COMTRADE_LIVE_PROTECTED_MAIN_REQUIRED");
const receipt=await observeComtrade195Minerals();
const out="artifacts/official-mineral-trade/comtrade-195-reference.json";
mkdirSync("artifacts/official-mineral-trade",{recursive:true,mode:0o700});
writeFileSync(out,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
  schema:receipt.schema,checked_at:receipt.checked_at,
  reporter_catalog_status:receipt.catalog_status,
  mapped_canonical_195_reporters:receipt.reporter_census?.official_reporter_codes_confirmed??0,
  missing_reporters:receipt.reporter_census?.countries_missing_valid_reporter??195,
  actual_annual_numerical_trade_samples:receipt.verified_annual_numeric_samples,
  sample_statuses:receipt.observations.map(x=>({iso3:x.country_iso3,status:x.status})),
  source_requests_attempted:receipt.source_requests_attempted,
  paid_eligible:false,current_country_category_events_verified:false,
  payments:0
}));
if(receipt.catalog_status!=="OFFICIAL_CATALOG_RESPONDED" ||
   receipt.verified_annual_numeric_samples===0)process.exitCode=3;

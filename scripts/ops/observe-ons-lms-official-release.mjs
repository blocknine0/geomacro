#!/usr/bin/env node
// One UK ONS national Macro release-date read on existing daily free-source cron.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeOnsLabourMarketRelease} from "../lib/ons-lms-official-release.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
 throw Error("ONS_LMS_PROTECTED_MAIN_REQUIRED");
let receipt;
try{receipt=await observeOnsLabourMarketRelease();}
catch(e){
 const reason=String(e?.message??"");
 receipt={schema:"geomacro.ons-lms-national-reference-release.v1",
  status:"FIRST_PARTY_SOURCE_UNVERIFIED",
  reason:/^ONS_[A-Z_]+$/u.test(reason)?reason:"ONS_NETWORK_OR_SCHEMA_UNKNOWN",
  provider_declared_bytes:Number.isSafeInteger(e?.declared_bytes)?e.declared_bytes:null,
  checked_at:new Date().toISOString(),
  source_family:"uk_ons_public",country_iso3:"GBR",category:"macro",
  observed_unemployment_value_verified:false,current_fx_rate_verified:false,
  native_month_or_rolling_quarter_observation_verified:false,
  commercial_derived_rights_verified:false,signed_current_macro_or_risk_event:false,
  original_html_stored:false,raw_source_values_exposed:false,
  d1_writes:0,b2_requests:0,supabase_requests:0,payments:0};
}
mkdirSync("artifacts/ons-labour-market-daily",{recursive:true,mode:0o700});
writeFileSync("artifacts/ons-labour-market-daily/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 schema:receipt.schema,status:receipt.status,
 latest_source_release_day:receipt.source_native_release_day??null,
 next_publisher_release_day:receipt.publisher_announced_next_release_day??null,
 reason:receipt.reason??null,provider_declared_bytes:receipt.provider_declared_bytes??null,
 observed_unemployment_value_verified:false,
 signed_current_macro_or_risk_event:false,
 external_requests:1,payments:0
}));
if(receipt.status!=="FIRST_PARTY_DATASET_RELEASE_DATE_OBSERVED")process.exitCode=3;

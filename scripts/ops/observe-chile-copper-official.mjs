#!/usr/bin/env node
// One Chile-specific official reference page GET per existing daily schedule.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeChileanCopperMonthly} from "../lib/chile-copper-official-monthly.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
 throw Error("CHILE_OFFICIAL_PROTECTED_MAIN_ONLY");
const out="artifacts/chile-copper-official/reference.json";
let data;
try{data=await observeChileanCopperMonthly();}
catch(e){
 const reason=String(e?.message??"");
 data={schema:"geomacro.chile-official-monthly-copper-reference.v1",
   checked_at:new Date().toISOString(),source_family:"chile_central_bank_cochilco",
   country_iso3:"CHL",status:"UPSTREAM_OR_SCHEMA_UNVERIFIED",
   reason:/^CHILE_[A-Z_]+$/u.test(reason)?reason:"CHILE_TRANSPORT_UNKNOWN",
   exact_period_value_verified:false,native_publication_clock_verified:false,
   live_mine_events_verified:false,commercial_derived_rights_verified:false,
   raw_producer_numbers_exposed:false,customer_paid_eligible:false,
   d1_writes:0,b2_requests:0,supabase_requests:0,payments:0};
}
mkdirSync("artifacts/chile-copper-official",{recursive:true,mode:0o700});
writeFileSync(out,JSON.stringify(data,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({schema:data.schema,status:data.status,
 country_iso3:"CHL",latest_reference_month:data.latest_observed_reference_month??null,
 reason:data.reason??null,live_mine_events_verified:false,paid_delivery_enabled:false,
 source_requests:1,payments:0}));
if(data.status!=="OFFICIAL_MONTHLY_REFERENCE_PRESENT")process.exitCode=3;

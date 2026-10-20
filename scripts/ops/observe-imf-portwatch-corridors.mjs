#!/usr/bin/env node
// Reuses the established daily official-source GitHub schedule.
// Private-derived reference context ONLY, not trade-flow redistribution or risk.
import {mkdirSync,writeFileSync} from "node:fs";
import {observePortwatchDaily} from "../lib/imf-portwatch-daily-corridors.mjs";
const OUTPUT="artifacts/portwatch-corridor-daily/receipt.json";
const ALLOWED=["PORTWATCH_CLOCK_INVALID","PORTWATCH_RESPONSE_INVALID",
 "PORTWATCH_BODY_EMPTY","PORTWATCH_BODY_LIMIT","PORTWATCH_JSON_INVALID",
 "PORTWATCH_DENIED_OR_QUOTA","PORTWATCH_HTTP_UNAVAILABLE"];
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro" ||
   process.env.GITHUB_REF!=="refs/heads/main" ||
   !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
  throw Error("PORTWATCH_PROTECTED_MAIN_REQUIRED");
for(const key of ["SUPABASE_DB_URL","SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
  "B2_APPLICATION_KEY","COINBASE_API_KEY","RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64"])
  if(process.env[key])throw Error("PORTWATCH_FORBIDDEN_CREDENTIAL");
let receipt;
try{
 receipt=await observePortwatchDaily();
}catch(error){
 const reason=String(error?.message??"");
 receipt={
   schema:"geomacro.portwatch-six-corridor-private-daily.v1",
   checked_at:new Date().toISOString(),source_family:"imf_portwatch",
   status:"UPSTREAM_OR_SCHEMA_UNVERIFIED",
   reason:ALLOWED.includes(reason)?reason:"PORTWATCH_TRANSPORT_UNKNOWN",
   routes_with_recent_daily_observations:0,
   shipping_incidents_verified:0,physical_route_geometry_verified:false,
   commercial_rights_verified:false,raw_provider_payload_stored:false,
   signed_risk_generated:false,paid_delivery_enabled:false,
   provider_calls:1,supabase_requests:0,d1_writes:0,b2_requests:0,payments:0
 };
}
mkdirSync("artifacts/portwatch-corridor-daily",{recursive:true,mode:0o700});
writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 schema:receipt.schema,status:receipt.status,checked_at:receipt.checked_at,
 routes_with_recent_daily_observations:receipt.routes_with_recent_daily_observations,
 provider_calls:receipt.provider_calls,payments:0,raw_provider_payload_stored:false,
 reason:receipt.reason??null
}));
if(!["SIX_CORRIDORS_DAILY_REFERENCE_OBSERVED",
     "PARTIAL_DAILY_REFERENCE_OBSERVED"].includes(receipt.status))process.exitCode=3;

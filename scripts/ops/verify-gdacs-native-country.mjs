#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {fetchGdacsNativeCountry} from "../../global-intelligence/adapters/gdacs-native-country.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
 throw Error("GDACS_PROTECTED_MAIN_REQUIRED");
for(const k of ["APP_SUPABASE_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
 "B2_APPLICATION_KEY","RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64","COINBASE_API_KEY"])
 if(process.env[k])throw Error("GDACS_FORBIDDEN_CREDENTIAL");
let receipt;
try{
 const x=await fetchGdacsNativeCountry();
 if(x.event_count===0||x.native_country_identifiers===0)
   throw Error("GDACS_NATIVE_COUNTRY_NOT_FOUND");
 receipt={...x,checked_at:new Date().toISOString(),
   state:"NATIVE_HAZARD_COUNTRY_FIELD_VERIFIED",
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0};
}catch(e){
 const reason=String(e?.message??"");
 receipt={schema:"geomacro.gdacs-native-event-attribution.v1",
   checked_at:new Date().toISOString(),state:"NATIVE_HAZARD_COUNTRY_UNVERIFIED",
   reason:/^GDACS_[A-Z0-9_]+$/.test(reason)?reason:"UPSTREAM_OR_SCHEMA_UNKNOWN",
   event_count:0,native_country_identifiers:0,
   all_affected_countries_verified:false,native_release_clock_verified:false,
   verified_current_geopolitical_events:0,source_rights_approved:false,
   commercial_paid_eligible:false,raw_upstream_payload_stored:false,
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0};
}
mkdirSync("artifacts/gdacs-native-country",{recursive:true,mode:0o700});
writeFileSync("artifacts/gdacs-native-country/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(receipt));
if(receipt.state!=="NATIVE_HAZARD_COUNTRY_FIELD_VERIFIED")process.exitCode=3;
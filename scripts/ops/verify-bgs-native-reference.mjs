#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {fetchBgsWorldMinerals} from "../../global-intelligence/adapters/bgs-world-minerals.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro" ||
 process.env.GITHUB_REF!=="refs/heads/main" ||
 !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
 throw Error("BGS_PROTECTED_MAIN_REQUIRED");
for(const key of ["APP_SUPABASE_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
 "B2_APPLICATION_KEY","RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64","COINBASE_API_KEY"])
 if(process.env[key])throw Error("BGS_FORBIDDEN_CREDENTIAL");
let receipt;
try{
 const data=await fetchBgsWorldMinerals({limit:5});
 const rows=data.rows.filter(r=>r.country_iso3&&/^[A-Z]{3}$/u.test(r.country_iso3)&&
   r.commodity&&r.year>=1970&&r.year<=new Date().getUTCFullYear()&&
   r.value!==null&&Number.isFinite(r.value)&&r.unit&&
   ["PRODUCTION","TRADE_IMPORT","TRADE_EXPORT"].includes(r.evidence_type));
 if(!rows.length)throw Error("BGS_NATIVE_RECORD_UNVERIFIED");
 rows.sort((a,b)=>b.year-a.year);
 receipt={schema:"geomacro.bgs-native-minerals-reference.v1",
   checked_at:new Date().toISOString(),state:"BGS_NATIVE_HISTORICAL_REFERENCE_VERIFIED",
   selected_country_iso3:rows[0].country_iso3,reference_year:rows[0].year,
   statistic_type:rows[0].evidence_type,
   unit_confirmed:true,commodity_present:true,
   native_release_time_verified:false,commercial_rights_verified:false,
   signed_current_intelligence:false,raw_values_in_receipt:false,
   supabase_requests:0,b2_requests:0,d1_writes:0,payments:0};
}catch(err){
 const s=String(err?.message??"");
 receipt={schema:"geomacro.bgs-native-minerals-reference.v1",
   checked_at:new Date().toISOString(),state:"BGS_NATIVE_HISTORICAL_REFERENCE_UNVERIFIED",
   reason:/^BGS_[A-Z0-9_]+$/.test(s)?s:"UPSTREAM_OR_SCHEMA_ERROR",
   native_release_time_verified:false,commercial_rights_verified:false,
   signed_current_intelligence:false,raw_values_in_receipt:false,
   supabase_requests:0,b2_requests:0,d1_writes:0,payments:0};
}
mkdirSync("artifacts/bgs-native-reference",{recursive:true,mode:0o700});
writeFileSync("artifacts/bgs-native-reference/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(receipt));
if(receipt.state!=="BGS_NATIVE_HISTORICAL_REFERENCE_VERIFIED")process.exitCode=3;
#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {verifySecFilingProduction} from "../../global-intelligence/adapters/sec-edgar-original-filing.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
  throw Error("SEC_PROTECTED_MAIN_REQUIRED");
for(const secret of ["APP_SUPABASE_URL","SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY","B2_APPLICATION_KEY",
 "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64","COINBASE_API_KEY"])
 if(process.env[secret])throw Error("SEC_FORBIDDEN_CREDENTIAL");
let receipt;
try{
 const r=await verifySecFilingProduction();
 receipt={schema:"geomacro.sec-native-original-verification.v1",
   checked_at:new Date().toISOString(),state:"ORIGINAL_SEC_NATIVE_HEADER_VERIFIED",
   issuer_cik:r.issuer_cik,form:r.form,filing_date:r.filing_date,
   header_sha256:r.header_sha256,original_source_identity_verified:true,
   full_original_content_retrieved:false,
   derived_country_impact_verified:false,commercial_rights_certified:false,
   signed_current_intelligence:false,
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0};
}catch(error){
 const s=String(error?.message??"");
 receipt={schema:"geomacro.sec-native-original-verification.v1",
   checked_at:new Date().toISOString(),state:"NATIVE_SEC_HEADER_UNVERIFIED",
   reason:/^SEC_[A-Z0-9_]+$/.test(s)?s:"UPSTREAM_OR_FORMAT_ERROR",
   original_source_identity_verified:false,
   full_original_content_retrieved:false,
   derived_country_impact_verified:false,commercial_rights_certified:false,
   signed_current_intelligence:false,
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0};
}
mkdirSync("artifacts/sec-original",{recursive:true,mode:0o700});
writeFileSync("artifacts/sec-original/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(receipt));
if(receipt.state!=="ORIGINAL_SEC_NATIVE_HEADER_VERIFIED")process.exitCode=3;

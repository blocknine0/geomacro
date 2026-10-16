#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {actualCountryStatisticsReceipt} from "../../global-intelligence/adapters/official-fao-ilo-country-statistics.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
  throw Error("COUNTRY_STATS_PROTECTED_MAIN_REQUIRED");
for(const key of ["APP_SUPABASE_URL","SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY","B2_APPLICATION_KEY",
  "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64","COINBASE_API_KEY"])
  if(process.env[key])throw Error("COUNTRY_STATS_FORBIDDEN_SECRET");
const r=await actualCountryStatisticsReceipt();
mkdirSync("artifacts/fao-ilo-statistics",{recursive:true,mode:0o700});
writeFileSync("artifacts/fao-ilo-statistics/receipt.json",JSON.stringify(r,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({schema:r.schema,at:r.at,attempted:r.attempted,
  extracted:r.extracted,rows:r.results.map(({id,state})=>({id,state})),
  rights_approved:false,paid_eligible:r.paid_eligible,
  payments:r.payments,supabase_requests:r.supabase_requests}));
if(r.extracted!==r.attempted)process.exitCode=3;

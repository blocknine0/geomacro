#!/usr/bin/env node
// Production daily reference extraction. No keys, no raw payload logs,
// source rights promotion, Supabase, D1/B2 writes, signing or payments.
import {mkdirSync,writeFileSync} from "node:fs";
import {publicReferenceReceipt} from "../../global-intelligence/adapters/public-reference-extraction.mjs";

if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
  throw Error("PROTECTED_REFERENCE_RUN_REQUIRED");
for(const name of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_URL",
  "B2_APPLICATION_KEY","COINBASE_API_KEY","RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64"])
  if(process.env[name])throw Error("REFERENCE_FORBIDDEN_CREDENTIAL");
const receipt=await publicReferenceReceipt();
mkdirSync("artifacts/reference-extraction",{recursive:true,mode:0o700});
writeFileSync("artifacts/reference-extraction/receipt.json",
  JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({schema:receipt.schema,checked_at:receipt.checked_at,
  attempted:receipt.source_count,extracted:receipt.extracted,failed:receipt.failed,
  readers:receipt.results.map(({id,state})=>({id,state})),
  paid_eligible:receipt.commercial_paid_eligible,
  supabase_requests:0,b2_requests:0,payments:0}));
if(receipt.failed>0)process.exitCode=3;

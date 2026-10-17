#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {verifyImfOecdReference} from "../../global-intelligence/adapters/imf-oecd-exact-reference.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro" ||
   process.env.GITHUB_REF!=="refs/heads/main" ||
   !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
  throw Error("IMF_OECD_PROTECTED_MAIN_REQUIRED");
for(const k of ["APP_SUPABASE_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
  "B2_APPLICATION_KEY","RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64","COINBASE_API_KEY"])
  if(process.env[k])throw Error("IMF_OECD_FORBIDDEN_CREDENTIAL");
const r=await verifyImfOecdReference();
mkdirSync("artifacts/imf-oecd-reference",{recursive:true,mode:0o700});
writeFileSync("artifacts/imf-oecd-reference/receipt.json",JSON.stringify(r,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(r));
if(r.verified!==r.attempted)process.exitCode=3;
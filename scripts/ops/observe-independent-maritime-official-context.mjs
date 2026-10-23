#!/usr/bin/env node
// One read-only, provider-pin-bounded observation per existing 90-minute
// official source cadence. UKMTO denial is NOT bypassed or retried.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeIndependentMaritimeOfficialContext} from "../lib/independent-maritime-official-context.mjs";
const TARGET="artifacts/expanded-official-source/independent-maritime-context.json";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  process.env.GITHUB_REF!=="refs/heads/main"||
  !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
  throw Error("INDEPENDENT_MARITIME_PROTECTED_MAIN_ONLY");
let result;
try{result=await observeIndependentMaritimeOfficialContext();}
catch{console.error("::error::MARITIME_CONTEXT_UNVERIFIED");process.exitCode=3;}
if(result){
 mkdirSync("artifacts/expanded-official-source",{recursive:true,mode:0o700});
 writeFileSync(TARGET,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 // No reports, pages, actor names, URLs, key material or raw content logged.
 console.log(JSON.stringify(result));
 if(result.status==="ALL_INDEPENDENT_CONTEXT_UNVERIFIED")process.exitCode=3;
}

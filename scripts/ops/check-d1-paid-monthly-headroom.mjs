#!/usr/bin/env node
/** Migration/canary-only PAID billing-cycle admission. No production SQL. */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
 checkD1PaidMonthlyHeadroom,D1_PAID_HEADROOM_HOLD
} from "../lib/d1-workers-paid-monthly-governor.mjs";
export const PAID_D1_HEADROOM_REPORT=
 "artifacts/release/d1-paid-monthly-headroom.json";
export async function runD1PaidMonthlyHeadroom({
 env=process.env,now=new Date(),fetchImpl=fetch,write=writeFileSync,
 reportPath=PAID_D1_HEADROOM_REPORT,
 lane="migration"
}={}){
 const result=await checkD1PaidMonthlyHeadroom({env,now,fetchImpl,lane});
 mkdirSync(resolve(reportPath,".."),{recursive:true,mode:0o700});
 write(reportPath,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const argv=process.argv.slice(2);
 if(argv.length>1||argv.length===1&&argv[0]!=="--check"){
  console.error("Usage: node scripts/ops/check-d1-paid-monthly-headroom.mjs [--check]");
  process.exitCode=2;
 }else{
  const r=await runD1PaidMonthlyHeadroom().catch(()=>null);
  if(!r||r.status!=="PASS"){
   // Preserve the exact fail-closed outcome while exposing only allowlisted
   // diagnostic enum codes (no provider body, credential or account identifier).
   const category=value=>typeof value==="string"&&
     /^[A-Z][A-Z0-9_]{2,110}$/u.test(value)?value:"UNCLASSIFIED";
   console.error(JSON.stringify({status:"HOLD",code:D1_PAID_HEADROOM_HOLD,
    reason:category(r?.reason),provider_error:category(r?.provider_error),
    report:PAID_D1_HEADROOM_REPORT,d1_mutations:0,
    payments:0,production_migration_executed:false}));
   process.exitCode=3;
  }else{
   console.log(JSON.stringify({status:"PASS",code:r.code,
    cycle_start_utc:r.cycle_start_utc,cycle_end_exclusive_utc:r.cycle_end_exclusive_utc,
    observed_rows_read:r.observed_rows_read,observed_rows_written:r.observed_rows_written,
    remaining_rows_read:r.remaining_rows_read,remaining_rows_written:r.remaining_rows_written,
    report:PAID_D1_HEADROOM_REPORT,
    provider_metrics_may_lag:true,no_guaranteed_invoice_cap:true}));
  }
 }
}

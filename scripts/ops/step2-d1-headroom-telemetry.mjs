#!/usr/bin/env node
/** Step 2 / zero-Cloudflare-call estimator over the EXISTING hourly GraphQL
 * provider receipt. No D1 SQL, no speculative billing and no source gates.
 * A single intra-day sample is never presented as full-day 60k acceptance.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const TARGET=60000;
export const STEP2_TARGET_ROWS_PER_UTC_DAY=TARGET;
export function evaluateStep2Headroom(hourly,{now=new Date()}={}){
 const provider=hourly?.provider;
 const day=hourly?.observed_at_utc?.slice(0,10);
 const rr=provider?.rows_read,rw=provider?.rows_written;
 if(provider?.verified!==true||
    !Number.isSafeInteger(rr)||rr<0||
    !Number.isSafeInteger(rw)||rw<0||
    !/^20\d{2}-\d{2}-\d{2}$/u.test(day??"")||
    provider?.day_utc!==day||!Number.isFinite(Date.parse(hourly.observed_at_utc)))
  throw Error("STEP2_PROVIDER_COUNTERS_UNVERIFIED");
 // Counters are account-wide, including shadow tests and unrelated D1 DBs.
 // Costs must be checked against the owner's requested 60k envelope for
 // BOTH categories. Do not claim any savings without a prior same-day sample.
 const exceeds=rr>=TARGET||rw>=TARGET;
 return Object.freeze({
  schema:"geomacro.step2.d1-account-headroom.v1",
  observed_at_utc:hourly.observed_at_utc,
  utc_day:day,scope:"CLOUDFLARE_ACCOUNT_WIDE_ALL_D1_DATABASES",
  target_rows_read:TARGET,target_rows_written:TARGET,
  observed_rows_read:rr,observed_rows_written:rw,
  remaining_to_target_rows_read:Math.max(0,TARGET-rr),
  remaining_to_target_rows_written:Math.max(0,TARGET-rw),
  state:exceeds?"TARGET_CROSSED_HOLD_NONESSENTIAL_WORK":
   "INTRADAY_SAMPLE_ONLY_FULL_DAY_NOT_PROVEN",
  daily_60k_acceptance_verified:false,
  partial_day_is_not_full_day:true,
  production_deploy_verified:false,first_party_ingestion_disabled:false,
  commercial_signer_disabled:false,b2_archival_disabled:false,
  provider_queries_by_this_telemetry:0,
  sampled_at_for_audit:now.toISOString()
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const path=process.argv[2]??"artifacts/d1-launch-hourly/receipt.json";
 try{
  const payload=JSON.parse(readFileSync(path,"utf8"));
  const result=evaluateStep2Headroom(payload);
  mkdirSync("artifacts/d1-launch-hourly",{recursive:true});
  writeFileSync("artifacts/d1-launch-hourly/step2-headroom.json",
   JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(result));
 }catch{
  console.error("STEP2_D1_HEADROOM_UNVERIFIED");
  process.exitCode=2;
 }
}

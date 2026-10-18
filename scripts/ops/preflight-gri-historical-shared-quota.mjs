#!/usr/bin/env node
// B2 quota PRE-FLIGHT for immutable GRI historical readback. This is a
// single read-only D1 SELECT and NEVER reserves tickets or touches B2.
// Protected downloader still reserves each real B2 attempt atomically.
import {appendFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";

const ERROR="GRI_HISTORY_QUOTA_D1_PREFLIGHT_UNVERIFIED";
const LIMITS=B2_DAILY_LIMITS;
const NUM_FIELDS=["total_requests","get_requests","put_requests","head_requests","native_auth_requests"];
const COUNTER_COLUMNS=["total","GET","PUT","HEAD","NATIVE_AUTH"];
const HASH=/^[a-f0-9]{32}$/u;
const UUID=/^[a-f0-9-]{36}$/u;

export function decideGriHistoryQuotaAdmission({rows,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(rows)||rows.length>1)throw Error("GRI_HISTORY_QUOTA_RECEIPT_INVALID");
 const record=rows[0]??{};
 if(rows.length===1&&
   (record.day_utc!==now.toISOString().slice(0,10)||
    Object.keys(record).some(k=>!["day_utc",...NUM_FIELDS].includes(k))))
   throw Error("GRI_HISTORY_QUOTA_DATE_OR_FIELDS_INVALID");
 const counters={};
 for(let i=0;i<NUM_FIELDS.length;i++){
   const field=NUM_FIELDS[i],name=COUNTER_COLUMNS[i];
   if(rows.length===1&&(record[field]===null||record[field]===undefined))
     throw Error("GRI_HISTORY_QUOTA_COUNTER_INVALID");
   const v=rows.length===0?0:Number(record[field]);
   if(!Number.isSafeInteger(v)||v<0||v>LIMITS[name])
     throw Error("GRI_HISTORY_QUOTA_COUNTER_INVALID");
   counters[name]=v;
 }
 if(counters.GET+counters.PUT+counters.HEAD+counters.NATIVE_AUTH!==counters.total)
   throw Error("GRI_HISTORY_QUOTA_SUM_INVALID");
 // Maximum original immutable-version restore needs: 1 native authorize,
 // 1 optional bucket listing + 1 version listing + 1 exact version download.
 // It must reserve all four on the SHARED D1 ledger, never borrow edge tickets.
 const remaining={total:LIMITS.total-counters.total,
   GET:LIMITS.GET-counters.GET,
   NATIVE_AUTH:LIMITS.NATIVE_AUTH-counters.NATIVE_AUTH};
 const admitted=remaining.total>=4&&remaining.GET>=3&&remaining.NATIVE_AUTH>=1;
 return Object.freeze({
   schema:"geomacro.gri-historical-shared-quota-preflight.v1",
   checked_at:now.toISOString(),day_utc:now.toISOString().slice(0,10),
   status:admitted?"B2_ATTEMPT_BUDGET_AVAILABLE":"SHARED_B2_QUOTA_HELD",
   quota_allows_attempt:admitted,
   reserved_attempts_max:4,
   required_native_auth:1,required_get_max:3,
   remaining_reserved_total:remaining.total,
   remaining_reserved_get:remaining.GET,
   remaining_reserved_native_auth:remaining.NATIVE_AUTH,
   // Not a B2 provider balance or authorization to publish!
   b2_provider_usage_independently_verified:false,
   restored_historical_version:false,immutable_lineage_verified:false,
   current_scored_gri_verified:false,current_gri_published:false,
   source_clock_refreshed:false,
   d1_writes:0,b2_requests:0,supabase_requests:0,payments:0,
 });
}

export async function readGriHistoryQuotaAdmission({
 env=process.env,now=new Date(),fetchImpl=fetch,
}={}){
 if(env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="historical_gri_version_recovery"||
    env.B2_REQUEST_BUDGET!=="4"||
    !HASH.test(String(env.CLOUDFLARE_ACCOUNT_ID??""))||
    !UUID.test(String(env.D1_DATABASE_ID??""))||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<10)
   throw Error("GRI_HISTORY_QUOTA_GOVERNED_D1_REQUIRED");
 for(const k of ["SUPABASE_URL","APP_SUPABASE_URL","SUPABASE_DB_URL",
    "APP_SUPABASE_DB_URL","SUPABASE_SERVICE_ROLE_KEY",
    "APP_SUPABASE_SERVICE_ROLE_KEY","COINBASE_API_KEY",
    "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"]){
   if(env[k])throw Error("GRI_HISTORY_QUOTA_FUNDS_OR_SUPABASE_FORBIDDEN");
 }
 const day=now.toISOString().slice(0,10);
 // One bounded SELECT; parameterized day prevents SQL escaping and identity
 // ambiguity. No source, key, customer, raw HTML or third-party bytes returned.
 const sql="SELECT day_utc,total_requests,get_requests,put_requests,head_requests,native_auth_requests "+
   "FROM b2_account_daily_request_quota WHERE day_utc=? LIMIT 1";
 let response;
 try{
   response=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
     env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+env.D1_DATABASE_ID+"/query",{
       method:"POST",redirect:"error",signal:AbortSignal.timeout(15_000),
       headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
         "Content-Type":"application/json"},
       body:JSON.stringify({sql,params:[day]}),
     });
 }catch{throw Error(ERROR)}
 if(!response.ok||Number(response.headers.get("content-length")??0)>16_384)
   throw Error(ERROR);
 let parsed;
 try{
   const txt=await response.text();
   if(txt.length>16_384)throw Error(ERROR);
   parsed=JSON.parse(txt);
 }catch{throw Error(ERROR)}
 if(parsed?.success!==true||!Array.isArray(parsed.result)||
    parsed.result.length!==1||parsed.result[0]?.success!==true||
    !Array.isArray(parsed.result[0].results))
   throw Error(ERROR);
 return decideGriHistoryQuotaAdmission({rows:parsed.result[0].results,now});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
   const receipt=await readGriHistoryQuotaAdmission();
   if(process.env.GITHUB_OUTPUT)
     appendFileSync(process.env.GITHUB_OUTPUT,
       "ready="+(receipt.quota_allows_attempt?"true":"false")+"\n");
   console.log(JSON.stringify(receipt));
   if(!receipt.quota_allows_attempt)
     console.warn("::warning::GRI_HISTORY_SHARED_QUOTA_HELD_NO_B2_REQUEST_NO_RESTORE");
 }catch{
   console.error("::error::"+ERROR);
   process.exitCode=2;
 }
}

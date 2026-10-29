#!/usr/bin/env node
/**
 * #1827 Read-only Cloudflare D1 account-wide daily rows quota preflight.
 * Source: official D1 d1AnalyticsAdaptiveGroups sums. This reports observed
 * billed usage, never grants capacity without a valid response.
 * No D1 mutation, B2 operation, Supabase request, source payload or payment.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const D1_FREE_DAILY = Object.freeze({rows_read:5_000_000,rows_written:100_000});
const QUERY=`query D1Today($accountTag:String!,$start:Date!,$end:Date!){
 viewer{accounts(filter:{accountTag:$accountTag}){
  d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$start,date_leq:$end}){
   sum{rowsRead rowsWritten}
   dimensions{databaseId date}
  }
 }}
}`;
const safeCount=n=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0;
export function assessD1AccountFreeQuota(payload,{day=new Date().toISOString().slice(0,10)}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(day)||payload?.errors?.length||
    !Array.isArray(payload?.data?.viewer?.accounts) ||
    payload.data.viewer.accounts.length!==1 ||
    !Array.isArray(payload.data.viewer.accounts[0]?.d1AnalyticsAdaptiveGroups))
    throw Error("D1_ACCOUNT_QUOTA_GRAPHQL_UNVERIFIED");
  const groups=payload.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups;
  if(groups.length===0)throw Error("D1_ACCOUNT_QUOTA_NO_PROVIDER_METRICS");
  if(groups.length>=1000)throw Error("D1_ACCOUNT_QUOTA_AGGREGATE_TRUNCATED");
  const seen=new Set();let read=0,written=0;
  for(const g of groups){
    const id=g?.dimensions?.databaseId;
    if(typeof id!=="string"||id.length<10||id.length>80||
       g?.dimensions?.date!==day||
       !safeCount(g?.sum?.rowsRead)||!safeCount(g?.sum?.rowsWritten)||
       seen.has(id))throw Error("D1_ACCOUNT_QUOTA_COUNTER_UNTRUSTED");
    seen.add(id);read+=g.sum.rowsRead;written+=g.sum.rowsWritten;
    if(!safeCount(read)||!safeCount(written))throw Error("D1_ACCOUNT_QUOTA_COUNTER_OVERFLOW");
  }
  // Capacity headroom is reserved; do not start a bulk historical backfill
  // merely because the upstream D1 ceiling has not yet been reached.
  const readHeadroom= Math.max(0,D1_FREE_DAILY.rows_read-read);
  const writeHeadroom=Math.max(0,D1_FREE_DAILY.rows_written-written);
  const cautious=readHeadroom>=1_000_000&&writeHeadroom>=25_000;
  return {
    schema:"geomacro.d1-account-daily-quota-readonly.v1",
    day_utc:day,
    status:cautious?"CAUTIOUS_D1_HEADROOM":"QUOTA_HELD_D1_HEADROOM_INSUFFICIENT",
    provider_graphql_usage_observed:true,
    account_database_count_observed:groups.length,
    observed_rows_read:read,observed_rows_written:written,
    limits:D1_FREE_DAILY,
    remaining_rows_read:readHeadroom,remaining_rows_written:writeHeadroom,
    caution_headroom_met:cautious,
    // Not a B2 provider billing receipt, not a 195-country/current event proof.
    b2_provider_capacity_verified:false,
    supabase_ingest_reactivated:false,
    authorized_bulk_migration:false,
    source_publication_eligible:false,
    d1_writes:0,b2_requests:0,supabase_requests:0,payment_performed:false,
  };
}
export async function readCloudflareD1AccountQuota({env=process.env,fetchImpl=fetch,
 now=new Date()}={}){
  const token=env.CLOUDFLARE_API_TOKEN;
  const account=env.CLOUDFLARE_ACCOUNT_ID;
  if(typeof token!=="string"||token.length<20||
    typeof account!=="string"||!/^[0-9a-f]{32}$/iu.test(account))
    throw Error("D1_ACCOUNT_QUOTA_AUTH_MISSING");
  const day=now.toISOString().slice(0,10);
  let response;
  try{response=await fetchImpl("https://api.cloudflare.com/client/v4/graphql",{
    method:"POST",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({query:QUERY,variables:{accountTag:account,start:day,end:day}}),
    signal:AbortSignal.timeout(12000),
    redirect:"error",
  });}catch{throw Error("D1_ACCOUNT_QUOTA_READ_FAILED")}
  if([429,502,503,504].includes(response?.status))
    throw Error("D1_ACCOUNT_QUOTA_TRANSIENT_PROVIDER_HTTP");
  if(!response?.ok)throw Error("D1_ACCOUNT_QUOTA_RESPONSE_NOT_OK");
  let body;try{body=await response.json()}catch{throw Error("D1_ACCOUNT_QUOTA_RESPONSE_INVALID")}
  if(body?.data?.viewer?.accounts?.length!==1)throw Error("D1_ACCOUNT_QUOTA_RESPONSE_INVALID");
  return assessD1AccountFreeQuota(body,{day});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const proof=await readCloudflareD1AccountQuota();
    mkdirSync("artifacts/d1-account-quota",{recursive:true});
    writeFileSync("artifacts/d1-account-quota/readonly.json",JSON.stringify(proof,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify({status:proof.status,day_utc:proof.day_utc,
      observed_rows_read:proof.observed_rows_read,
      observed_rows_written:proof.observed_rows_written,
      remaining_rows_read:proof.remaining_rows_read,
      remaining_rows_written:proof.remaining_rows_written,
      caution_headroom_met:proof.caution_headroom_met}));
    if(!proof.caution_headroom_met)process.exitCode=3;
  }catch(error){
    const code=error instanceof Error&&/^D1_ACCOUNT_QUOTA_[A-Z_]+$/u.test(error.message)
      ?error.message:"D1_ACCOUNT_QUOTA_UNVERIFIED";
    console.error(code);process.exitCode=2;
  }
}

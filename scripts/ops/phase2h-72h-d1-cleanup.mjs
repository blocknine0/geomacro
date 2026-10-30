#!/usr/bin/env node
/** Protected, quota-admitted Phase2H-only rolling original-news deletion.
 * No PREDGE, historical, pricing, source requests, raw title or B2 mutation.
 * Zero SQL queries unless the main-run provider governor approved critical.
 */
import {phase2hNewsCutoff,planPhase2hD1RetentionDelete,
 PHASE2H_NEWS_CLEANUP_LIMIT,PHASE2H_NEWS_CLEANUP_TARGET_MS}
 from "../lib/phase2h-retention-72h.mjs";
const fail=x=>{throw Error("PHASE2H_72H_CLEANUP_"+x)};
export async function cleanupPhase2hD1({
 env=process.env,now=Date.now(),fetchImpl=fetch,
}={}){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.PHASE2H_PROVIDER_CRITICAL!=="true"||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !/^[0-9a-f-]{36}$/iu.test(env.D1_DATABASE_ID??"")||
    String(env.CLOUDFLARE_API_TOKEN??"").length<20||
    !Number.isFinite(now))
  fail("PROTECTED_PROVIDER_ADMISSION_REQUIRED");
 const root="https://api.cloudflare.com/client/v4/accounts/"+
  env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+env.D1_DATABASE_ID+"/query";
 const run=async(sql,params)=>{
  let res,body;
  try{
   res=await fetchImpl(root,{method:"POST",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
     "Content-Type":"application/json"},
    body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});
   body=await res.json();
  }catch{fail("CANONICAL_D1_UNAVAILABLE")}
  if(res.status!==200||body?.success!==true||
     !Array.isArray(body.result)||body.result.length!==1||
     body.result[0]?.success===false||
     !Array.isArray(body.result[0]?.results))
    fail("CANONICAL_D1_RECEIPT_INVALID");
  return body.result[0];
 };
 const cutoff=phase2hNewsCutoff(now,PHASE2H_NEWS_CLEANUP_TARGET_MS);
 const selected=await run("SELECT record_id,first_ingested_at FROM phase2h_private_raw_news "+
  "WHERE first_ingested_at<=? ORDER BY first_ingested_at,record_id LIMIT ?",
  [cutoff,PHASE2H_NEWS_CLEANUP_LIMIT]);
 const plan=planPhase2hD1RetentionDelete(selected.results,{now});
 if(!plan.ids.length)return {schema:"geomacro.phase2h.72h-d1-retention.v1",
  retained_news_max_age_hours:72,proactive_cleanup_hours:60,
  deleted_records:0,post_delete_d1_readback_verified:true,
  b2_physical_deletion_verified:false,backlog_unverified:true,payments:0};
 const placeholders=plan.ids.map(()=>"?").join(",");
 const deleted=await run("DELETE FROM phase2h_private_raw_news WHERE first_ingested_at<=? "+
  "AND record_id IN ("+placeholders+")",[cutoff,...plan.ids]);
 if(deleted.meta?.changes!==plan.ids.length)fail("DELETION_COUNT_MISMATCH");
 const proof=await run("SELECT record_id FROM phase2h_private_raw_news WHERE record_id IN ("+
  placeholders+")",plan.ids);
 if(proof.results.length!==0)fail("POST_DELETE_EXACT_READBACK_FAILED");
 const outstanding=await run("SELECT COUNT(*) AS n FROM phase2h_private_raw_news "+
  "WHERE first_ingested_at<=?",[cutoff]);
 const n=outstanding.results?.[0]?.n;
 if(!Number.isSafeInteger(n)||n<0)fail("BACKLOG_COUNT_UNVERIFIED");
 return {schema:"geomacro.phase2h.72h-d1-retention.v1",
  retained_news_max_age_hours:72,proactive_cleanup_hours:60,
  deleted_records:plan.ids.length,post_delete_d1_readback_verified:true,
  remaining_older_than_60h:n,proactive_d1_cleanup_complete:n===0,
  b2_physical_deletion_verified:false,payments:0,predge_untouched:true};
}
if(process.argv[1]?.endsWith("/phase2h-72h-d1-cleanup.mjs")){
 try{console.log(JSON.stringify(await cleanupPhase2hD1()))}
 catch(e){const msg=String(e?.message??"");
  console.error(/^PHASE2H_72H_CLEANUP_[A-Z_]+$/u.test(msg)?msg:
   "PHASE2H_72H_CLEANUP_FAILED");process.exitCode=2}
}

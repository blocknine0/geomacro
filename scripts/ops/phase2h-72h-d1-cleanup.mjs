#!/usr/bin/env node
/** Quota-admitted, immutable-first-ingestion 72h D1 Phase2H-only retention.
 * At 60h delete only records with a verified B2 object SHA; at 72h apply
 * the hard expiry regardless of archive status and flag lost unarchived data.
 * No PREDGE, historical, payments, website-derived or B2 bucket mutations.
 * 100 bound IDs/statement, at most 1,000 deleted records per admitted run.
 */
import {phase2hNewsCutoff,planPhase2hD1RetentionDelete,
 PHASE2H_NEWS_CLEANUP_LIMIT,PHASE2H_NEWS_CLEANUP_RUN_LIMIT,
 PHASE2H_NEWS_CLEANUP_TARGET_MS}
 from "../lib/phase2h-retention-72h.mjs";
const fail=x=>{throw Error("PHASE2H_72H_CLEANUP_"+x)};
export async function cleanupPhase2hD1({
 env=process.env,now=Date.now(),fetchImpl=fetch,
}={}){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    (env.PHASE2H_PROVIDER_CRITICAL!=="true"&&
     env.PHASE2H_PROVIDER_RETENTION_CLEANUP!=="true")||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !/^[0-9a-f-]{36}$/iu.test(env.D1_DATABASE_ID??"")||
    String(env.CLOUDFLARE_API_TOKEN??"").length<20||
    !Number.isFinite(now))
  fail("PROTECTED_PROVIDER_ADMISSION_REQUIRED");
 const root="https://api.cloudflare.com/client/v4/accounts/"+
  env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+env.D1_DATABASE_ID+"/query";
 const run=async(sql,params=[])=>{
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
 const hardCutoff=phase2hNewsCutoff(now);
 const softCutoff=phase2hNewsCutoff(now,PHASE2H_NEWS_CLEANUP_TARGET_MS);
 let deleted=0,deletedHard=0,deletedProactive=0,unarchivedExpiredDiscarded=0;
 let selectedQueries=0,exactReadbacks=0;
 // First clear hard-expired data (including unarchived rows). On each iteration,
 // then drain the oldest B2-acknowledged proactive 60h+ rows.
 while(deleted<PHASE2H_NEWS_CLEANUP_RUN_LIMIT){
  const limit=Math.min(PHASE2H_NEWS_CLEANUP_LIMIT,
   PHASE2H_NEWS_CLEANUP_RUN_LIMIT-deleted);
  let hardExpiry=true;
  let selection=await run(
   "SELECT record_id,first_ingested_at,b2_object_sha256 FROM phase2h_private_raw_news "+
   "WHERE first_ingested_at<=? ORDER BY first_ingested_at,record_id LIMIT ?",
   [hardCutoff,limit]);
  selectedQueries++;
  if(!selection.results.length){
   hardExpiry=false;
   selection=await run(
    "SELECT record_id,first_ingested_at,b2_object_sha256 FROM phase2h_private_raw_news "+
    "WHERE first_ingested_at<=? AND b2_object_sha256 IS NOT NULL "+
    "ORDER BY first_ingested_at,record_id LIMIT ?",
    [softCutoff,limit]);
   selectedQueries++;
  }
  if(!selection.results.length)break;
  const plan=planPhase2hD1RetentionDelete(selection.results,{
   now,limit,hardExpiry,requireArchived:!hardExpiry
  });
  const cutoff=hardExpiry?hardCutoff:softCutoff;
  const placeholders=plan.ids.map(()=>"?").join(",");
  const sql="DELETE FROM phase2h_private_raw_news WHERE first_ingested_at<=? "+
   (hardExpiry?"":"AND b2_object_sha256 IS NOT NULL ")+
   "AND record_id IN ("+placeholders+")";
  const removed=await run(sql,[cutoff,...plan.ids]);
  if(removed.meta?.changes!==plan.ids.length)fail("DELETION_COUNT_MISMATCH");
  const proof=await run(
   "SELECT record_id FROM phase2h_private_raw_news WHERE record_id IN ("+
   placeholders+")",plan.ids);
  exactReadbacks++;
  if(proof.results.length!==0)fail("POST_DELETE_EXACT_READBACK_FAILED");
  deleted+=plan.ids.length;
  if(hardExpiry){
   deletedHard+=plan.ids.length;
   unarchivedExpiredDiscarded+=selection.results.filter(
    r=>r.b2_object_sha256===null).length;
  }else deletedProactive+=plan.ids.length;
 }
 const hard=await run("SELECT COUNT(*) AS n FROM phase2h_private_raw_news "+
  "WHERE first_ingested_at<=?",[hardCutoff]);
 const proactive=await run("SELECT COUNT(*) AS n FROM phase2h_private_raw_news "+
  "WHERE first_ingested_at<=? AND b2_object_sha256 IS NOT NULL",[softCutoff]);
 const hardN=hard.results?.[0]?.n,softN=proactive.results?.[0]?.n;
 if(!Number.isSafeInteger(hardN)||hardN<0||
    !Number.isSafeInteger(softN)||softN<0)fail("BACKLOG_COUNT_UNVERIFIED");
 return {
  schema:"geomacro.phase2h.72h-d1-retention.v2",
  retained_news_max_age_hours:72,proactive_cleanup_hours:60,
  deleted_records:deleted,deleted_hard_expired:deletedHard,
  deleted_proactively_archived:deletedProactive,
  unarchived_expired_discarded:unarchivedExpiredDiscarded,
  remaining_older_than_72h:hardN,remaining_eligible_proactive:softN,
  strict_72h_d1_clean:hardN===0,
  proactive_d1_cleanup_complete:softN===0,
  post_delete_d1_readback_verified:exactReadbacks>0,
  selected_queries:selectedQueries,exact_readback_queries:exactReadbacks,
  maximum_deletions_per_hour:PHASE2H_NEWS_CLEANUP_RUN_LIMIT,
  b2_physical_deletion_verified:false,
  provider_quota_admitted:true,predge_untouched:true,payments:0,
  production_acceptance_pass:hardN===0&&unarchivedExpiredDiscarded===0
 };
}
if(process.argv[1]?.endsWith("/phase2h-72h-d1-cleanup.mjs")){
 try{
  const result=await cleanupPhase2hD1();
  console.log(JSON.stringify(result));
  if(!result.production_acceptance_pass)process.exitCode=2;
 }catch(e){
  const msg=String(e?.message??"");
  console.error(/^PHASE2H_72H_CLEANUP_[A-Z_]+$/u.test(msg)?msg:
   "PHASE2H_72H_CLEANUP_FAILED");
  process.exitCode=2;
 }
}

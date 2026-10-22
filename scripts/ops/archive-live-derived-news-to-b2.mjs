#!/usr/bin/env node
// ONE private, quota-governed B2 PUT+GET archive from the exact live D1
// Intelligence journal, no issuer polling, no Supabase and no new cron.
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {archiveDerivedJournalToB2}
 from "../lib/derived-news-b2-readwrite-backup.mjs";
const fail=x=>{throw Error("DERIVED_NEWS_B2_BACKUP_"+x)};
export async function runGovernedDerivedNewsBackup({
 env=process.env,now=new Date(),fetchImpl=fetch,b2Factory=createB2Client,
 governorFactory=createB2D1AccountGovernor
}={}){
 if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/u.test(env.GITHUB_RUN_ID??"")||
    env.GITHUB_ACTIONS!=="true"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="derived_news_backup"||
    env.B2_REQUEST_BUDGET!=="12")fail("PROTECTED_QUOTA_GOVERNED_MAIN_REQUIRED");
 const force=env.GITHUB_EVENT_NAME==="workflow_dispatch";
 if(!force&&now.getUTCHours()%6!==0)
  return {schema:"geomacro.private-derived-news-b2-backup-receipt.v1",
   status:"SKIPPED_SIX_HOUR_ARCHIVE_SLOT",archived_rows:0,
   b2_put_verified:false,source_d1_readback_verified:false,
   public_website_unchanged:true,payments:0};
 // Keep at least 10 total / 5 GET / 5 PUT tickets for separately signed
 // GRI historical recovery and other priority producers; quota governor
 // still atomically reserves each real B2 operation before network.
 const quota=await governorFactory({env,fetchImpl}).status();
 const used=quota?.used,limits=quota?.limits;
 if(quota?.ok!==true||!used||!limits)fail("D1_SHARED_QUOTA_UNAVAILABLE");
 if(used.total>limits.total-12||used.GET>limits.GET-6||
    used.PUT>limits.PUT-6||
    used.NATIVE_AUTH>limits.NATIVE_AUTH-2)
  return {schema:"geomacro.private-derived-news-b2-backup-receipt.v1",
   status:"B2_SHARED_ACCOUNT_RECOVERY_HEADROOM_HELD",
   archived_rows:0,b2_put_verified:false,public_website_unchanged:true,payments:0};
 const b2=b2Factory({
  endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  bucket:"geomacro-private-archive",
  accessKey:env.B2_KEY_ID,secretKey:env.B2_APPLICATION_KEY,
  readAccessKey:env.B2_ARCHIVE_READ_KEY_ID,
  readSecretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY
 });
 return archiveDerivedJournalToB2({fetchImpl,b2,now,force});
}
if(import.meta.url===new URL("file://"+process.argv[1]).href){
 try{
  const receipt=await runGovernedDerivedNewsBackup();
  // No original headlines, private URLs, entire article bytes or tokens in logs.
  console.log(JSON.stringify({
   schema:receipt.schema,status:receipt.status,
   rows:receipt.archived_rows??0,
   domains:receipt.category_counts??null,
   d1_readback:receipt.source_d1_readback_verified??false,
   b2_put_full_get_verified:receipt.b2_exact_readback_verified??false,
   signed_gri:false,paid_eligible:false,requests_funded:0
  }));
 }catch(e){
  const error=e instanceof Error?e.message:"";
  const code=/^(?:DERIVED_NEWS_B2_[A-Z0-9_]+|DERIVED_NEWS_B2_BACKUP_[A-Z0-9_]+|B2_[A-Z0-9_]+)$/u.test(error)?error:
   "DERIVED_NEWS_B2_ARCHIVE_UNAVAILABLE";
  console.error("::warning::"+code);
  process.exitCode=3;
 }
}

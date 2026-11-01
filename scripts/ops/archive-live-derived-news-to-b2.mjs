#!/usr/bin/env node
// ONE private, quota-governed B2 PUT+GET archive from the exact live D1
// Intelligence journal, no issuer polling, no Supabase and no new cron.
import {createB2Client} from "./b2-s3-client.mjs";
import {resolve} from "node:path";
import {mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
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
 // Preserve recovery headroom: manual dispatch cannot force out-of-slot B2 calls.
 // Existing hourly schedule retries autonomously at 00/06/12/18 UTC.
 const force=false;
 if(now.getUTCHours()%6!==0)
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
export function summarizeSafeBackupReceipt(receipt,now=new Date()){
 // Private Actions artifact contains no title, article bytes, source URL,
 // key material or public commercial authorization. An empty/held/failed
 // storage attempt must NEVER be marked uploaded.
 const archived=receipt?.status==="B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED"&&
   receipt?.b2_put_verified===true&&
   receipt?.b2_exact_readback_verified===true&&
   receipt?.independent_second_get_verified===true&&
   receipt?.second_get_sha256===receipt?.compressed_sha256&&
   receipt?.independent_post_archive_d1_get_verified===true&&
   receipt?.source_d1_readback_verified===true;
 const safe={
  schema:"geomacro.private-derived-news-b2-independent-archive-acceptance.v1",
  checked_at:now.toISOString(),
  status:receipt?.status??"BACKUP_FAILED_CLOSED",
  derived_rows_archived:archived?receipt.archived_rows:0,
  category_counts:archived?receipt.category_counts:null,
  source_d1_verified:receipt?.source_d1_readback_verified===true,
  put_then_full_get_restored_verified:archived,
  independent_second_b2_get_sha_verified:archived,
  independent_post_archive_d1_get_verified:archived,
  object_sha256:archived?receipt.compressed_sha256:null,
  exact_b2_archive_object_key:archived?receipt.archive_object_key:null,
  storage_confirmed:archived,
  source_news_d1_website_delivery_not_modified:true,
  signed_hot_gri_verified:false,
  paid_eligible:false,raw_original_saved:false,payments:0
 };
 return safe;
}
function writeSafeBackupReceipt(receipt){
 const safe=summarizeSafeBackupReceipt(receipt);
 mkdirSync("artifacts/derived-news",{recursive:true,mode:0o700});
 writeFileSync("artifacts/derived-news/b2-archive-verified-readback.json",
  JSON.stringify(safe,null,2)+"\n",{mode:0o600});
 return safe;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=await runGovernedDerivedNewsBackup();
  const verified=writeSafeBackupReceipt(receipt);
  // No original headlines, private URLs, entire article bytes or tokens in logs.
  console.log(JSON.stringify({
   schema:verified.schema,status:verified.status,
   rows:verified.derived_rows_archived,
   domains:verified.category_counts,
   d1_readback:verified.source_d1_verified,
   b2_put_full_get_verified:verified.storage_confirmed,
   signed_gri:false,paid_eligible:false,requests_funded:0
  }));
  // A quota hold during a designated archive attempt is not an archive.
  // Distinguish genuine zero-news from inability to retain actual news.
  if(verified.status==="B2_SHARED_ACCOUNT_RECOVERY_HEADROOM_HELD")
    process.exitCode=3;
 }catch(e){
  const error=e instanceof Error?e.message:"";
  const code=/^(?:DERIVED_NEWS_B2_[A-Z0-9_]+|DERIVED_NEWS_B2_BACKUP_[A-Z0-9_]+|B2_[A-Z0-9_]+)$/u.test(error)?error:
   "DERIVED_NEWS_B2_ARCHIVE_UNAVAILABLE";
  writeSafeBackupReceipt({status:"BACKUP_FAILED_CLOSED"});
  console.error("::error::"+code);
  process.exitCode=3;
 }
}

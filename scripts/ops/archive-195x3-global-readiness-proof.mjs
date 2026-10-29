#!/usr/bin/env node
/**
 * Persistent 195x3 audit history, including source outages.
 * Every snapshot is a new SHA-addressed B2 key. Only the small latest.json
 * pointer is replaced; the previous full snapshot is independently read back
 * before appending. Account-wide D1 quota reservation applies to ALL B2 calls.
 *
 * Does not acquire news, issue signed country intelligence, collect USDC,
 * certify paid output or modify PREDGE.
 */
import {readFileSync} from "node:fs";
import {createB2Client} from "../ops/b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "../ops/b2-d1-account-governor.mjs";
import {GLOBAL_PROOF_HEAD_KEY,buildGlobalAuditSnapshot,assertProofHead,
  verifyPreviousSnapshot,digest} from "../lib/195x3-durable-proof-chain.mjs";

const fail=code=>{throw Error("GLOBAL_PROOF_PUBLISH_"+code)};
function config(env=process.env){
  if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     env.GITHUB_REF!=="refs/heads/main"||
     !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
     !/^[1-9]\d{0,18}$/u.test(env.GITHUB_RUN_ID??"")||
     !/^[1-9]\d{0,3}$/u.test(env.GITHUB_RUN_ATTEMPT??"")||
     env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
     env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="global_195_audit"||
     !env.D1_DATABASE_ID||!env.CLOUDFLARE_ACCOUNT_ID||!env.CLOUDFLARE_API_TOKEN||
     !env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
     !env.B2_ARCHIVE_READ_KEY_ID||!env.B2_ARCHIVE_READ_APPLICATION_KEY||
     env.B2_ARCHIVE_READ_KEY_ID===env.B2_KEY_ID)
    fail("GOVERNED_MAIN_CREDENTIALS_REQUIRED");
  return env;
}
export async function archiveGlobalCountryAudit({
  audit,env=process.env,b2=null,now=new Date(),
}={}){
  config(env);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    fail("CLOCK_INVALID");
  // Preserve an explicit shared-account buffer for existing producers and
  // locked PREDGE operations. This is a read-only admission test, NOT an
  // increase of any B2 or D1 account quota. Each later request still has to
  // reserve its own atomic D1 ticket (and can fail if concurrent jobs race).
  if(b2===null){
    const status=await createB2D1AccountGovernor({env}).status();
    const remaining=(k)=>status.limits[k]-status.used[k];
    if(!status.ok||remaining("total")<20||remaining("GET")<18||
       remaining("PUT")<6||remaining("NATIVE_AUTH")<2)
      fail("SHARED_B2_QUOTA_BUFFER_REQUIRED");
  }
  const client=b2??createB2Client({
    endpointUrl:"https://s3.us-east-005.backblazeb2.com",
    accessKey:env.B2_KEY_ID,secretKey:env.B2_APPLICATION_KEY,
    readAccessKey:env.B2_ARCHIVE_READ_KEY_ID,
    readSecretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY,
    bucket:"geomacro-private-archive",
  });
  // One HEAD-equivalent optional GET; quota reserved in canonical D1.
  const priorHeadBytes=await client.getOptional(GLOBAL_PROOF_HEAD_KEY);
  let previousHead=null;
  if(priorHeadBytes){
    if(priorHeadBytes.length>4096)fail("PREVIOUS_HEAD_TOO_LARGE");
    let parsed;
    try{parsed=JSON.parse(priorHeadBytes.toString("utf8"));}
    catch{fail("PREVIOUS_HEAD_INVALID_JSON")}
    previousHead=assertProofHead(parsed);
    // Do NOT skip this extra independently governed GET: it proves the
    // predecessor is actually restorable, not just referenced.
    const previousSnapshot=await client.get(previousHead.snapshot_key);
    if(previousSnapshot.length>750000)fail("PREVIOUS_SNAPSHOT_TOO_LARGE");
    verifyPreviousSnapshot(previousHead,previousSnapshot);
  }
  const {key,bytes,sha,head,counts}=buildGlobalAuditSnapshot({
    audit,gitCommit:env.GITHUB_SHA,
    runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
    recordedAt:now.toISOString(),previousHead,
  });
  if(bytes.length>750000)fail("SNAPSHOT_TOO_LARGE");
  if(previousHead && previousHead.snapshot_key===key)
    fail("SAME_SNAPSHOT_MUST_NOT_OVERWRITE");
  // Idempotent same-key restart: avoid overwriting an existing archived
  // object, even if a previous run failed before advancing the head.
  const existing=await client.getOptional(key);
  if(existing && (existing.length!==bytes.length||digest(existing)!==sha))
    fail("CONTENT_ADDRESS_COLLISION");
  if(!existing){
    await client.putWithMetadataVerification(key,bytes);
  }
  // putWithMetadataVerification already performed an independently
  // governed full byte readback. No duplicate GET against scarce B2 quota.
  if(existing&&(digest(existing)!==sha||existing.length!==bytes.length))
    fail("DURABLE_SNAPSHOT_READBACK_FAILED");
  const headBytes=Buffer.from(JSON.stringify(head)+"\n");
  await client.putWithMetadataVerification(GLOBAL_PROOF_HEAD_KEY,headBytes);
  // The metadata-verifying PUT already independently GET-verified the head;
  // revalidate its canonical representation locally without another GET.
  const restoredHead=assertProofHead(JSON.parse(headBytes.toString("utf8")));
  if(restoredHead.snapshot_sha256!==sha||restoredHead.snapshot_key!==key)
    fail("LATEST_HEAD_INVALID");
  // Fail red if source unavailable, even though the durable outage evidence
  // was saved successfully for independent future inspection.
  return {
    schema:"geomacro.global-country-195x3-b2-proof-publication.v1",
    archived_snapshot:key,sha256:sha,previous_snapshot:previousHead?.snapshot_key??null,
    archive_full_readback_verified:true,head_full_readback_verified:true,
    provider_snapshot_audit_ok:audit.audit_ok,
    country_195_routing_verified:counts.covered_lanes===585,
    country_current_news_not_inferred:true,
    paid_country_coverage_verified:false,real_usdc_settled:false,
    b2_daily_account_governor_applied:true,
  };
}
if(import.meta.main){
  try{
    const path=process.argv[2]??"/tmp/global-country-runtime.json";
    if(path!=="/tmp/global-country-runtime.json")fail("INPUT_PATH_NOT_ALLOWED");
    const raw=readFileSync(path,"utf8");
    if(Buffer.byteLength(raw)>750000)fail("INPUT_TOO_LARGE");
    const audit=JSON.parse(raw);
    const receipt=await archiveGlobalCountryAudit({audit});
    console.log(JSON.stringify(receipt));
    if(!receipt.provider_snapshot_audit_ok)process.exitCode=2;
  }catch(e){
    console.error(/^GLOBAL_(?:PROOF_PUBLISH|PROOF)_[A-Z0-9_]+$/u.test(e?.message??"")
      ?e.message:"GLOBAL_PROOF_PUBLISH_NOT_VERIFIED");
    process.exitCode=2;
  }
}

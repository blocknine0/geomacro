#!/usr/bin/env node
/**
 * Immutable owner-issue SHA review for one protected Stage2 run.
 *
 * The legacy GEOMACRO_STEP3_REVIEWED_SHA environment pin remains mandatory
 * for manual workflow_dispatch. In a no-laptop owner issue workflow, an
 * independently authenticated, owner-created, exactly SHA-pinned one-shot
 * issue MAY substitute for stale environment SHA only after GitHub verifies
 * the owner, gateway, acceptance comment, target run and unique dispatch.
 *
 * Not a migration or safety override. Both Shadow and Stage2 must rerun this
 * review before any Cloudflare D1, R2/B2 or Worker provider calls.
 */
import {appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
 OWNER_ISSUE_DISPATCH_TITLE,OWNER_ISSUE_DISPATCH_SCHEMA,
 OWNER_ISSUE_DISPATCH_LOGIN,OWNER_ISSUE_DISPATCH_REPO
} from "../lib/owner-issue-dispatch-contract.mjs";
const ROOT="/repos/"+OWNER_ISSUE_DISPATCH_REPO;
const SHA=/^[a-f0-9]{40}$/u, ID=/^[1-9][0-9]{5,20}$/u;
const MAX_AGE=3*60*60*1000;
function need(ok,code){if(!ok)throw Error("OWNER_SHA_REVIEW_"+code)}
const splitBody=v=>{
 try{const j=JSON.parse(v);return j&&typeof j==="object"&&!Array.isArray(j)?j:null}
 catch{return null}
};
const shape={schema:OWNER_ISSUE_DISPATCH_SCHEMA,
 intent:"stage2-production",
 authorization:"OWNER_AUTHORIZE_REAL_PRODUCTION_D1_0204_0211_0212_0213_NO_FUNDS",
 verify_hot50:true};
const sorted=a=>[...a].sort().join("|");
export function admitOwnerReviewedSHA({env,issue,comments,gatewayRun,
 gatewayJobs,targetRun,recentRuns,remoteMain,now=new Date()}={}){
 const num=String(env?.OWNER_DISPATCH_ISSUE??""),
 gate=String(env?.OWNER_DISPATCH_GATEWAY_RUN??""),
 target=String(env?.GITHUB_RUN_ID??"");
 need(ID.test(gate)&&ID.test(target)&&/^[1-9][0-9]{0,12}$/u.test(num)&&
   env.GITHUB_REPOSITORY===OWNER_ISSUE_DISPATCH_REPO&&
   env.GITHUB_REF==="refs/heads/main"&&
   env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
   SHA.test(env.GITHUB_SHA??""),
  "AUTHENTICATED_MAIN_TARGET_REQUIRED");
 const time=now.getTime(),source=env.GITHUB_SHA;
 const body=splitBody(issue?.body);
 const created=Date.parse(issue?.created_at??"");
 const commentText="Intent: stage2-production";
 need(issue?.number===Number(num)&&
  issue?.title===OWNER_ISSUE_DISPATCH_TITLE&&
  issue?.state==="closed"&&issue?.pull_request==null&&
  issue?.user?.login===OWNER_ISSUE_DISPATCH_LOGIN&&
  issue?.user?.type==="User"&&
  issue?.author_association==="OWNER"&&
  issue?.closed_by?.login==="github-actions[bot]"&&
  Number.isFinite(created)&&created<=time&&
  time-created<MAX_AGE&&
  body!==null&&sorted(Object.keys(body))===
    sorted([...Object.keys(shape),"source_sha"])&&
  Object.entries(shape).every(([k,v])=>body[k]===v)&&
  body.source_sha===source,
  "OWNER_ISSUE_PROOF_NOT_VERIFIED");
 need(remoteMain?.name==="main"&&remoteMain?.commit?.sha===source,
  "REMOTE_MAIN_MOVED");
 need(gatewayRun?.id===Number(gate)&&
  gatewayRun?.event==="issues"&&
  gatewayRun?.path===".github/workflows/owner-issue-dispatch-gateway.yml"&&
  gatewayRun?.status==="completed"&&gatewayRun?.conclusion==="success"&&
  gatewayRun?.head_sha===source&&
  gatewayRun?.actor?.login===OWNER_ISSUE_DISPATCH_LOGIN&&
  gatewayRun?.head_branch==="main"&&
  Date.parse(gatewayRun.created_at)>=created&&
  Date.parse(gatewayRun.created_at)-created<120000,
  "SINGLE_USE_GATEWAY_RUN_UNVERIFIED");
 need(Array.isArray(gatewayJobs?.jobs)&&
  gatewayJobs.jobs.filter(j=>j.name==="owner-issue-dispatch"&&
    j.conclusion==="success").length===1,
  "PROTECTED_GATEWAY_JOB_NOT_VERIFIED");
 need(Array.isArray(comments)&&comments.some(c=>
  c?.user?.login==="github-actions[bot]"&&
  typeof c.body==="string"&&
  c.body.includes("ACCEPTED (HTTP 204; queued only)")&&
  c.body.includes(commentText)&&
  c.body.includes("Source SHA: "+source)&&
  c.body.includes("Gateway run: "+gate)&&
  c.body.includes("Target: production-rollout-orchestrator.yml")),
  "GATEWAY_HTTP_204_RECEIPT_UNVERIFIED");
 need(targetRun?.id===Number(target)&&
  targetRun?.event==="workflow_dispatch"&&
  targetRun?.path===".github/workflows/production-rollout-orchestrator.yml"&&
  targetRun?.head_branch==="main"&&
  targetRun?.head_sha===source&&
  targetRun?.actor?.login==="github-actions[bot]"&&
  targetRun?.display_title===
    "Step3 owner issue #"+num&&
  Date.parse(targetRun.created_at)>=
    Date.parse(gatewayRun.created_at)&&
  Date.parse(targetRun.created_at)<=time,
  "TARGET_WORKFLOW_ORIGIN_NOT_VERIFIED");
 const runs=recentRuns?.workflow_runs;
 need(Array.isArray(runs)&&runs.length>0&&runs.length<=100&&
  runs.some(r=>r.id===Number(target))&&
  runs.filter(r=>r.display_title===
    "Step3 owner issue #"+num).length===1,
  "TARGET_DISPATCH_NONCE_REPLAY_OR_RUN_CENSUS_UNKNOWN");
 // If the first 100 runs do not cover the issue creation clock, the
 // uniqueness scan is incomplete and must HOLD. No implicit pagination PASS.
 need(Date.parse(runs.at(-1)?.created_at??"")<=created,
  "RUN_CENSUS_HORIZON_INCOMPLETE");
 return Object.freeze({
  status:"PASS_OWNER_ISSUE_EXACT_MAIN_SHA_REVIEW",
  reviewed_sha:source,owner_issue:Number(num),gateway_run:Number(gate),
  target_run:Number(target),
  proven_once:true,provider_io:0,no_funds:true,
  manual_env_pin_bypass:false,
  review_authority:"VERIFIED_OWNER_ISSUE_ALTERNATIVE"
 });
}
async function readGitHub(path,env=process.env,fetchImpl=fetch){
 need(path.startsWith(ROOT+"/")&&!path.includes(".."),
  "GITHUB_REQUEST_PATH_INVALID");
 const token=env.GITHUB_TOKEN;
 need(typeof token==="string"&&token.length>20,
  "EPHEMERAL_GITHUB_TOKEN_MISSING");
 let response;
 try{response=await fetchImpl("https://api.github.com"+path,{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(20000),
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28",
  "User-Agent":"GeoMacro-Owner-SHA-Review/1.0"}
 })}
 catch{throw Error("OWNER_SHA_REVIEW_GITHUB_READ_UNAVAILABLE")}
 need(response?.status===200&&!response.redirected,
  "GITHUB_READ_PROVIDER_NOT_PASS");
 try{return await response.json()}
 catch{throw Error("OWNER_SHA_REVIEW_GITHUB_INVALID_JSON")}
}
export async function verifyOwnerDispatchReview({
 env=process.env,now=new Date(),read=readGitHub,append=appendFileSync
}={}){
 const issue=env.OWNER_DISPATCH_ISSUE??"";
 const gateway=env.OWNER_DISPATCH_GATEWAY_RUN??"";
 if(!issue&&!gateway){
  // Legacy protected environment SHA review stays REQUIRED. Never
  // let absent issue/gateway inputs update or substitute the SHA.
  need(env.GEOMACRO_STEP3_EXACT_SHA===env.GITHUB_SHA,
   "MANUAL_REVIEWED_SHA_PIN_REQUIRED");
  return {status:"PASS_MANUAL_ENVIRONMENT_SHA_PIN",
    sha:env.GITHUB_SHA,provider_io:0};
 }
 need(Boolean(issue)&&Boolean(gateway),"INCOMPLETE_OWNER_PROOF");
 const get=path=>read(path,env);
 const [ownerIssue,comments,gatewayRun,gatewayJobs,
  targetRun,recentRuns,remoteMain]=await Promise.all([
  get(ROOT+"/issues/"+issue),
  get(ROOT+"/issues/"+issue+"/comments?per_page=100"),
  get(ROOT+"/actions/runs/"+gateway),
  get(ROOT+"/actions/runs/"+gateway+"/jobs?per_page=100"),
  get(ROOT+"/actions/runs/"+env.GITHUB_RUN_ID),
  get(ROOT+"/actions/workflows/production-rollout-orchestrator.yml/runs?per_page=100"),
  get(ROOT+"/branches/main")
 ]);
 const proof=admitOwnerReviewedSHA({
  env,issue:ownerIssue,comments,gatewayRun,gatewayJobs,
  targetRun,recentRuns,remoteMain,now});
 need(typeof env.GITHUB_ENV==="string"&&env.GITHUB_ENV.length>0,
  "PROTECTED_GITHUB_ENV_REQUIRED");
 append(env.GITHUB_ENV,"GEOMACRO_STEP3_EXACT_SHA="+proof.reviewed_sha+"\n",
  {encoding:"utf8",mode:0o600});
 console.log(JSON.stringify({status:proof.status,
  source_sha:proof.reviewed_sha,owner_issue:proof.owner_issue,
  gateway_run:proof.gateway_run,target_run:proof.target_run,
  cloudflare_mutations:0,no_funds:true,
  legacy_manual_pin_unchanged:true}));
 return proof;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 verifyOwnerDispatchReview().catch(e=>{
  const m=String(e?.message??"");
  console.error(JSON.stringify({status:"HOLD",code:
   /^OWNER_SHA_REVIEW_[A-Z0-9_]+$/u.test(m)?m:
    "OWNER_SHA_REVIEW_UNVERIFIED",production_sql_mutated:false}));
  process.exitCode=2;
 });
}

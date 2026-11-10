#!/usr/bin/env node
/**
 * No-laptop GitHub issue dispatcher. The ephemeral GITHUB_TOKEN can access
 * ONLY the repository; no Cloudflare, R2, B2, D1, signer or payment API.
 *
 * A matching OWNER-only issue is consumed/closed BEFORE the single dispatch.
 * Serial workflow concurrency and terminal CLOSED state make reruns fail
 * closed, not replay production. A failed request needs a new owner issue.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {
 planOwnerIssueDispatch,assertLiveOwnerIssue,assertExactRemoteMain,
 OWNER_ISSUE_DISPATCH_REPO
} from "../lib/owner-issue-dispatch-contract.mjs";
const ROOT="/repos/"+OWNER_ISSUE_DISPATCH_REPO;
const FAIL_PREFIX="OWNER_DISPATCH_";
const safeError=e=>{
 const message=String(e?.message??"");
 return /^OWNER_DISPATCH_[A-Z0-9_]{3,100}$/u.test(message)?
  message:"OWNER_DISPATCH_GITHUB_PROVIDER_UNKNOWN";
};
const pathIssue=n=>ROOT+"/issues/"+n;
async function githubRequest(method,path,body,env=process.env,fetchImpl=fetch){
 if(typeof env.GITHUB_TOKEN!=="string"||env.GITHUB_TOKEN.length<20)
  throw Error(FAIL_PREFIX+"EPHEMERAL_TOKEN_MISSING");
 if(!path.startsWith(ROOT+"/")||path.includes("..")||
    !["GET","PATCH","POST"].includes(method))
  throw Error(FAIL_PREFIX+"GITHUB_REQUEST_SCOPE_INVALID");
 const expected=method==="POST"&&path.endsWith("/dispatches")?204:
  method==="POST"&&path.endsWith("/comments")?201:200;
 let response;
 try{
  response=await fetchImpl("https://api.github.com"+path,{
   method,redirect:"error",signal:AbortSignal.timeout(20000),
   headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,
    Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"GeoMacro-Owner-Dispatch-Gateway/1.0",
    ...(body!=null?{"Content-Type":"application/json"}:{})},
   ...(body!=null?{body:JSON.stringify(body)}:{})
  });
 }catch{throw Error(FAIL_PREFIX+"GITHUB_PROVIDER_UNAVAILABLE")}
 if(response?.status!==expected||response.redirected)
  throw Error(FAIL_PREFIX+"GITHUB_"+method+"_HTTP_NOT_EXPECTED");
 if(expected===204)return {status:204};
 let parsed;
 try{parsed=await response.json()}
 catch{throw Error(FAIL_PREFIX+"GITHUB_RESPONSE_NOT_JSON")}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
  throw Error(FAIL_PREFIX+"GITHUB_RESPONSE_INVALID");
 return parsed;
}
export async function executeOwnerIssueDispatch({
 env=process.env,event,now=new Date(),request,
}={}){
 const plan=planOwnerIssueDispatch({event,env,now});
 const call=request??((method,path,body)=>githubRequest(method,path,body,env));
 // Live HEAD is read AFTER issue admission and BEFORE reservation. A changed
 // main is HOLD, never silently replaced with the newer SHA.
 const main=await call("GET",ROOT+"/branches/main");
 assertExactRemoteMain({remote:main,plan,env});
 const live=await call("GET",pathIssue(plan.issue_number));
 assertLiveOwnerIssue({current:live,plan});
 // First mutation CONSUMES the request. A rerun cannot dispatch this issue.
 const reserved=await call("PATCH",pathIssue(plan.issue_number),{
  state:"closed",state_reason:"completed"
 });
 if(reserved?.number!==plan.issue_number||reserved?.state!=="closed")
  throw Error(FAIL_PREFIX+"CONSUMED_ISSUE_STATE_NOT_VERIFIED");
 const endpoint=ROOT+"/actions/workflows/"+plan.target+"/dispatches";
 let accepted=false;
 try{
  const ack=await call("POST",endpoint,{
   ref:plan.ref,inputs:plan.inputs
  });
  if(ack?.status!==204)
   throw Error(FAIL_PREFIX+"WORKFLOW_DISPATCH_ACK_NOT_204");
  accepted=true;
 }catch(e){
  // Do not reopen: an uncertain provider outcome might have already queued
  // the target. Review it before making another owner-authorized issue.
  try{
   await call("POST",pathIssue(plan.issue_number)+"/comments",{
    body:"GeoMacro dispatch gateway: HOLD / provider dispatch unverified. "+
     "Issue consumed; no automatic retry. Review Actions before a new request."
   });
  }catch{/* preserve original failure */}
  throw e;
 }
 try{
  await call("POST",pathIssue(plan.issue_number)+"/comments",{
   body:"GeoMacro dispatch gateway: ACCEPTED (HTTP 204; queued only). "+
    "\n\nIntent: "+plan.intent+
    "\n\nSource SHA: "+plan.source_sha+
    "\n\nTarget: "+plan.target+
    "\n\nGateway run: "+String(env.GITHUB_RUN_ID??"unknown")+
    "\n\nNOT production SQL, Hot50 or canary acceptance. "+
    "All downstream signed/provider gates remain mandatory. "+
    "Payments are OFF. This issue is single-use and closed."
  });
 }catch{
  // Target was already accepted: do not replay it to repair a comment.
  console.error(JSON.stringify({status:"QUEUED_COMMENT_HOLD",
   code:"OWNER_DISPATCH_POST_ACCEPT_COMMENT_FAILED",
   issue:plan.issue_number,workflow_dispatch_accepted:accepted}));
 }
 return Object.freeze({
  schema:"geomacro.owner-issue-dispatch-result.v1",
  status:"DISPATCH_ACCEPTED_NOT_WORKFLOW_SUCCESS",
  issue:plan.issue_number,intent:plan.intent,target:plan.target,
  sha:plan.source_sha,
  http_204_verified:accepted,
  issue_closed_before_dispatch:true,
  downstream_production_acceptance_not_claimed:true,
  payments:0,d1_sql_in_gateway:0,worker_traffic_in_gateway:0,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 try{
  if(args.length!==0||typeof process.env.GITHUB_EVENT_PATH!=="string")
   throw Error(FAIL_PREFIX+"PROTECTED_EVENT_FILE_REQUIRED");
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,"utf8"));
  const r=await executeOwnerIssueDispatch({event});
  console.log(JSON.stringify(r));
 }catch(e){
  console.error(JSON.stringify({status:"HOLD",code:safeError(e),
   no_funds:true,canary_hold_unchanged:true}));
  process.exitCode=2;
 }
}

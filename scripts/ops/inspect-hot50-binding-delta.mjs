#!/usr/bin/env node
/** Read-only Cloudflare Worker version binding-name/type review.
 * Never logs provider binding values, credential IDs, secret metadata or
 * protected environment variables. Never deploys or changes traffic.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {diagnoseReviewedHot50BindingDelta,REVIEWABLE_ADDITIVE_SECRETS}
 from "../lib/canary-additive-binding-parity.mjs";
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const fail=x=>{throw Error("PROTECTED_BINDING_DIFF_"+x)};
export async function runProtectedBindingDiff({
 env=process.env,fetcher=fetch,run=execFileSync
}={}){
 const sha=env.EXPECTED_MAIN_SHA;
 const baseId=env.BASELINE_VERSION_ID,candidateId=env.CANDIDATE_VERSION_ID;
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(sha??"")||env.GITHUB_SHA!==sha||
    !UUID.test(baseId??"")||!UUID.test(candidateId??"")||
    baseId===candidateId||
    !/^[a-f0-9]{32}$/iu.test(account??"")||
    typeof token!=="string"||token.length<20)
   fail("PROTECTED_MAIN_OR_CREDENTIALS_UNAVAILABLE");
 const local=run("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 if(local!==sha)fail("LOCAL_MAIN_MISMATCH");
 const remote=await fetcher("https://api.github.com/repos/blocknine0/geomacro/branches/main",{
  method:"GET",headers:{Accept:"application/vnd.github+json"},
  redirect:"error",signal:AbortSignal.timeout(15000)});
 if(!remote.ok||remote.redirected||(await remote.json())?.commit?.sha!==sha)
  fail("MAIN_MOVED");
 const raw=String(env.REVIEWED_ADDITIVE_SECRET_NAMES??"");
 const reviewed=raw===""?[]:raw.split(",");
 if(reviewed.some(x=>x!==x.trim()||!REVIEWABLE_ADDITIVE_SECRETS.includes(x))||
  new Set(reviewed).size!==reviewed.length)
   fail("REVIEWED_SECRET_LIST_INVALID");
 const url="https://api.cloudflare.com/client/v4/accounts/"+account+
  "/workers/scripts/geomacro-control-plane";
 async function read(path){
  const response=await fetcher(url+path,{
   method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},
   redirect:"error",signal:AbortSignal.timeout(20000)});
  if(!response.ok||response.redirected)fail("CLOUDFLARE_READ_DENIED");
  const body=await response.json();
  if(body?.success!==true||!body.result)fail("CLOUDFLARE_RESPONSE_INVALID");
  return body.result;
 }
 const deployment=await read("/deployments?per_page=1");
 const live=deployment?.deployments?.[0]?.versions;
 if(!Array.isArray(live)||live.length!==1||
  live[0].version_id!==baseId||Number(live[0].percentage)!==100)
   fail("BASELINE_NOT_CURRENT_100_PERCENT");
 const [base,candidate]=await Promise.all([
  read("/versions/"+baseId),read("/versions/"+candidateId)]);
 if(base?.id!==baseId||candidate?.id!==candidateId)
   fail("VERSION_IDENTITY_UNVERIFIED");
 const delta=diagnoseReviewedHot50BindingDelta(base,candidate,sha,reviewed,env);
 const result={...delta,baseline_version_id:baseId,candidate_version_id:candidateId,
  source_sha:sha,baseline_live_100_percent:true,versions_provider_readback:true,
  provider_mutations:0,traffic_promoted:false,paid_traffic_enabled_by_audit:false,
  generated_at:new Date().toISOString()};
 mkdirSync("artifacts/protected-canary",{recursive:true});
 writeFileSync("artifacts/protected-canary/candidate-binding-readonly-audit.json",
  JSON.stringify(result,null,2)+"\n",{mode:0o600});
 return result;
}
if(process.argv[1]&&import.meta.url.endsWith("/"+process.argv[1].replace(/^.*\//u,""))){
 runProtectedBindingDiff().then(r=>{
  console.log(JSON.stringify({schema:r.schema,status:r.status,
   unexpected_binding_count:r.unexpected_addition_names.length,
   baseline_live_100_percent:r.baseline_live_100_percent,
   provider_mutations:0,traffic_promoted:false}));
  if(r.status!=="NO_UNEXPECTED_BINDING_NAMES")process.exitCode=2;
 }).catch(e=>{console.error(JSON.stringify({status:"HOLD",
  code:/^PROTECTED_BINDING_DIFF_[A-Z0-9_]+$/u.test(e.message??"")?
   e.message:"PROTECTED_BINDING_DIFF_UNAVAILABLE",
  traffic_promoted:false,payments:0}));process.exitCode=2});
}

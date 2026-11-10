#!/usr/bin/env node
/**
 * Exact-main gate for owner-only protected source workflow dispatches.
 * No database queries, writes, B2 calls, secrets or approval side effects.
 */
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const SHA=/^[a-f0-9]{40}$/u;
const fail=code=>{throw Error("OWNER_SOURCE_"+code)};
export async function verifyOwnerProtectedSourceMain({
 env=process.env,fetchImpl=fetch,
 getCheckoutSha=()=>execFileSync("git",["rev-parse","HEAD"],
  {encoding:"utf8",timeout:5000}).trim()
}={}){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !SHA.test(env.GITHUB_SHA??"")||
    !SHA.test(env.GEOMACRO_OWNER_SOURCE_SHA??"")||
    env.GITHUB_SHA!==env.GEOMACRO_OWNER_SOURCE_SHA||
    (env.GITHUB_TOKEN??"").length<20)
  fail("AUTHENTICATED_OWNER_EXACT_MAIN_DISPATCH_REQUIRED");
 let checkout;
 try{checkout=getCheckoutSha()}catch{fail("CHECKOUT_SHA_UNAVAILABLE")}
 if(checkout!==env.GITHUB_SHA)fail("CHECKOUT_SHA_MISMATCH");
 let res;
 try{res=await fetchImpl(
  "https://api.github.com/repos/blocknine0/geomacro/branches/main",{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,
   Accept:"application/vnd.github+json"},
  signal:AbortSignal.timeout(15000)
 })}catch{fail("REMOTE_MAIN_UNAVAILABLE")}
 if(res?.status!==200||res.redirected)fail("REMOTE_MAIN_HTTP_UNVERIFIED");
 let doc;try{doc=await res.json()}catch{fail("REMOTE_MAIN_JSON_INVALID")}
 if(doc?.name!=="main"||doc?.commit?.sha!==env.GITHUB_SHA)
  fail("REMOTE_MAIN_MOVED");
 return Object.freeze({
  status:"PASS_OWNER_SOURCE_EXACT_MAIN_READONLY",
  sha:env.GITHUB_SHA,payments:0,d1_sql:0,b2_requests:0
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const result=await verifyOwnerProtectedSourceMain();
  console.log(JSON.stringify(result));
 }catch(e){
  const message=String(e?.message??"");
  const code=/^OWNER_SOURCE_[A-Z0-9_]{3,100}$/u.test(message)?
   message:"OWNER_SOURCE_UNKNOWN_FAIL_CLOSED";
  console.error(JSON.stringify({status:"HOLD",code,
   production_source_writes:0,payments:0}));
  process.exitCode=3;
 }
}

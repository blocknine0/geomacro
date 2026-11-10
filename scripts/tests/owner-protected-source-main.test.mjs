import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyOwnerProtectedSourceMain}
 from "../ops/verify-owner-protected-source-main.mjs";
const SHA="a".repeat(40),OTHER="b".repeat(40);
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:SHA,
 GEOMACRO_OWNER_SOURCE_SHA:SHA,GITHUB_TOKEN:"ghs_"+"x".repeat(38)
});
const remote=sha=>async()=>({status:200,redirected:false,
 json:async()=>({name:"main",commit:{sha}})});
test("one-shot no-funds source dispatch proves checked-out, event and provider remote exact SHA",async()=>{
 const r=await verifyOwnerProtectedSourceMain({env:env(),
  getCheckoutSha:()=>SHA,fetchImpl:remote(SHA)});
 assert.equal(r.status,"PASS_OWNER_SOURCE_EXACT_MAIN_READONLY");
 assert.equal(r.b2_requests,0);
 assert.equal(r.d1_sql,0);
 assert.equal(r.payments,0);
});
test("any main movement, false event, unauthorized or broken provider holds before B2/D1",async()=>{
 for(const mutate of [
  x=>{x.GITHUB_ACTIONS="false";},x=>{x.GITHUB_REPOSITORY="evil/repo";},
  x=>{x.GITHUB_EVENT_NAME="pull_request";},
  x=>{x.GITHUB_REF="refs/heads/feature";},
  x=>{x.GITHUB_SHA=OTHER;},
  x=>{x.GEOMACRO_OWNER_SOURCE_SHA=OTHER;},
  x=>{x.GITHUB_TOKEN="";},
 ]){
  const e=env();mutate(e);let called=0;
  await assert.rejects(verifyOwnerProtectedSourceMain({
   env:e,getCheckoutSha:()=>{called++;return SHA},
   fetchImpl:remote(SHA)
  }),/OWNER_SOURCE_/u);
  assert.equal(called,0);
 }
 await assert.rejects(verifyOwnerProtectedSourceMain({
  env:env(),getCheckoutSha:()=>OTHER,fetchImpl:remote(SHA)
 }),/OWNER_SOURCE_CHECKOUT_SHA_MISMATCH/u);
 await assert.rejects(verifyOwnerProtectedSourceMain({
  env:env(),getCheckoutSha:()=>SHA,fetchImpl:remote(OTHER)
 }),/OWNER_SOURCE_REMOTE_MAIN_MOVED/u);
 await assert.rejects(verifyOwnerProtectedSourceMain({
  env:env(),getCheckoutSha:()=>SHA,fetchImpl:async()=>({
   status:403,redirected:false})
 }),/OWNER_SOURCE_REMOTE_MAIN_HTTP_UNVERIFIED/u);
});
test("source workflow checks exact main twice before any privileged publisher call",()=>{
 const w=readFileSync(".github/workflows/all-source-reusable-news-json.yml","utf8");
 const contract=readFileSync("scripts/lib/owner-issue-dispatch-contract.mjs","utf8");
 const gate="node scripts/ops/verify-owner-protected-source-main.mjs";
 assert.equal(w.split(gate).length-1,2);
 assert.ok(w.indexOf(gate)<w.indexOf("id: quota"));
 assert.ok(w.lastIndexOf(gate)<w.indexOf("bun scripts/ops/publish-all-source-reusable-news-json.ts"));
 assert.match(w,/approved_main_sha:/u);
 assert.match(contract,/OWNER_AUTHORIZE_VERIFIED_ORIGINAL_SOURCE_B2_FIRST_NO_FUNDS/u);
 assert.match(w,/environment: production/u);
 assert.match(w,/B2_ACCOUNT_QUOTA_REQUIRED: "1"/u);
 assert.match(w,/--hot50-source/u);
});

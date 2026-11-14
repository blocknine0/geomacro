import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runProtectedBindingDiff} from "../ops/inspect-hot50-binding-delta.mjs";
import {reviewedHot50CandidateVars} from "../lib/canary-additive-binding-parity.mjs";

const SHA="a".repeat(40), BASE="5877085d-b903-4e16-b11c-fae0878604ea";
const CAND="d3f1fb9b-a25f-4225-b8d5-3c895caac3dd";
const baseBindings=[
 {name:"DB",type:"d1",id:"keep-private-db-id"},
 {name:"CONTROL_PLANE_TOKEN",type:"secret_text",secret:"DO_NOT_LOG_CONTROL_TOKEN"}
];
const reviewed="GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64";
const candidateBindings=[
 ...baseBindings,...Object.entries(reviewedHot50CandidateVars(SHA)).map(([name,text])=>
  ({name,type:"plain_text",text})),
 {name:reviewed,type:"secret_text",secret:"DO_NOT_LOG_PRIVATE_ED25519"},
 {name:"UNREVIEWED_EXTRA",type:"plain_text",text:"DO_NOT_LOG_THIS_FLAG_VALUE"}
];
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:SHA,EXPECTED_MAIN_SHA:SHA,
 BASELINE_VERSION_ID:BASE,CANDIDATE_VERSION_ID:CAND,
 CLOUDFLARE_ACCOUNT_ID:"f".repeat(32),
 CLOUDFLARE_API_TOKEN:"super-secret-cloudflare-token-long-should-never-appear",
 REVIEWED_ADDITIVE_SECRET_NAMES:reviewed
});
function providerFetch(log){
 return async(url,init)=>{
  log.push({url,method:init.method});
  if(url.endsWith("/branches/main"))
   return new Response(JSON.stringify({commit:{sha:SHA}}),{status:200});
  if(url.endsWith("/deployments?per_page=1"))
   return new Response(JSON.stringify({success:true,result:{
    deployments:[{versions:[{version_id:BASE,percentage:100}]}]}}),{status:200});
  if(url.endsWith("/versions/"+BASE))
   return new Response(JSON.stringify({success:true,result:{
    id:BASE,resources:{bindings:baseBindings}}}),{status:200});
  if(url.endsWith("/versions/"+CAND))
   return new Response(JSON.stringify({success:true,result:{
    id:CAND,resources:{bindings:candidateBindings}}}),{status:200});
  throw Error("unexpected read "+url);
 };
}
test("exact existing provider versions reveal only name/type mismatch and never credentials",async()=>{
 const previous=process.cwd(),temp=mkdtempSync(join(tmpdir(),"hot50-diff-"));
 const calls=[];
 try{
  process.chdir(temp);
  const output=await runProtectedBindingDiff({env:env(),fetcher:providerFetch(calls),
   run:()=>SHA+"\n"});
  assert.equal(output.status,"UNREVIEWED_BINDING_DELTA_HOLD");
  assert.deepEqual(output.unexpected_addition_names,["UNREVIEWED_EXTRA"]);
  assert.equal(output.baseline_live_100_percent,true);
  assert.equal(output.provider_mutations,0);
  assert.equal(output.traffic_promoted,false);
  const file=readFileSync("artifacts/protected-canary/candidate-binding-readonly-audit.json","utf8");
  assert.match(file,/UNREVIEWED_EXTRA/);
  assert.doesNotMatch(file,/DO_NOT_LOG_|super-secret-cloudflare-token|keep-private-db-id/);
  assert.ok(calls.every(x=>x.method==="GET"));
  assert.equal(calls.length,4);
 }finally{process.chdir(previous);rmSync(temp,{recursive:true,force:true})}
});
test("moving main or unknown reviewed secret list fail before provider credential reads",async()=>{
 let calls=0;
 await assert.rejects(runProtectedBindingDiff({
  env:{...env(),GITHUB_SHA:"b".repeat(40)},
  fetcher:async()=>{calls++;throw Error("fetch should never run")},run:()=>SHA
 }),/PROTECTED_MAIN_OR_CREDENTIALS_UNAVAILABLE/);
 assert.equal(calls,0);
 await assert.rejects(runProtectedBindingDiff({
  env:{...env(),REVIEWED_ADDITIVE_SECRET_NAMES:"UNKNOWN_SECRET"},
  fetcher:async()=>{
   calls++;
   return new Response(JSON.stringify({commit:{sha:SHA}}),{status:200})
  },
  run:()=>SHA
 }),/REVIEWED_SECRET_LIST_INVALID/);
 assert.equal(calls,1); // exact-main read only, before any Cloudflare GET
});

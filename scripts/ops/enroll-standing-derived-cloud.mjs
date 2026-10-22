#!/usr/bin/env node
/**
 * One-time OWNER-run cloud enrollment of an ALREADY genuinely signed
 * derived-only standing delegation. NEVER accesses human private keys.
 * Secrets use gh stdin only. No paid API, Supabase or payment action.
 */
import {spawnSync} from "node:child_process";
import {readFileSync,statSync,lstatSync,realpathSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";

import {createInterface} from "node:readline/promises";
import {prepareEnrollment,REPOSITORY,SECRETS} from "../lib/standing-derived-cloud-enrollment.mjs";
const REF="refs/heads/main";
const WORKFLOW="standing-delegated-derived-attestation.yml";
const ERROR="STANDING_DERIVED_CLOUD_ENROLLMENT_REFUSED";
const fail=()=>{throw Error(ERROR);};
const expected=(dir,name)=>join(dir,name);
function privateFile(path,limit=32768){
 if(!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||
    statSync(path).size<1||statSync(path).size>limit||
    (process.platform!=="win32"&&(statSync(path).mode&0o077)!==0))fail();
 return readFileSync(path,"utf8");
}
function publicFile(path){
 if(!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||
    statSync(path).size>8192)fail();
 return readFileSync(path,"utf8");
}
function run(cmd,args,input){
 const out=spawnSync(cmd,args,{encoding:"utf8",input,
  timeout:30000,maxBuffer:65536,stdio:["pipe","pipe","pipe"]});
 if(out.error||out.status!==0)fail();
 return (out.stdout??"").trim();
}
const gh=(args,input)=>run("gh",args,input);
function ensureExactMain(){
 const local=run("git",["rev-parse","HEAD"]);
 const remote=gh(["api","repos/"+REPOSITORY+"/commits/main","--jq",".sha"]);
 if(!/^[a-f0-9]{40}$/.test(local)||remote!==local)fail();
 const inside=run("git",["rev-parse","--show-toplevel"]);
 if(realpathSync(inside)!==realpathSync(process.cwd()))fail();
 // Never mix enrollment with an uncommitted x402 branch.
 if(run("git",["status","--porcelain"])!=="")fail();
}
async function approve(){
 if(!process.stdin.isTTY||!process.stdout.isTTY)fail();
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  console.log("SCOPE: free DERIVED-ONLY machine receipts, NOT GRI, rights, hot snapshots or USDC.");
  const answer=await rl.question("Type ENROLL VERIFIED DERIVED ONLY NO FUNDS: ");
  if(answer!=="ENROLL VERIFIED DERIVED ONLY NO FUNDS")fail();
 }finally{rl.close();}
}
export async function main(env=process.env){
 if(process.argv.length!==3||
    process.argv[2]!=="--enroll-two-signed-human-consents-no-funds"||
    env.CI==="true"||env.GITHUB_ACTIONS==="true"||!env.HOME||process.getuid?.()===0)fail();
 if(!/^[a-z0-9._-]+$/i.test(env.USER??""))fail();
 const d=resolve(env.HOME,"geomacro-private/pallab/delegation");
 if(realpathSync(d)!==d||(statSync(d).mode&0o077)!==0)fail();
 const ownerDir=resolve(env.HOME,"geomacro-private/pallab");
 const inputs={
  policy:JSON.parse(privateFile(expected(d,"standing-policy.json"))),
  ownerApproval:JSON.parse(privateFile(expected(d,"pallab-approval.json"))),
  sumanApproval:JSON.parse(privateFile(expected(d,"suman-approval.json"))),
  ownerPem:publicFile(expected(ownerDir,"owner-public.pem")),
  reviewerPem:publicFile(expected(d,"suman-public.pem")),
  machinePublicPem:privateFile(expected(d,"machine-public.pem")),
  machinePrivatePem:privateFile(expected(d,"machine-private.pem"))
 };
 const {secrets,receipt}=prepareEnrollment(inputs);
 gh(["auth","status","-h","github.com"]);
 ensureExactMain();
 await approve();
 // Fail-closed: disable before mutating secrets.
 gh(["variable","set","GEOMACRO_STANDING_DELEGATION_ENABLED","--repo",REPOSITORY,"--body","NO"]);
 gh(["variable","set","GEOMACRO_STANDING_DELEGATION_REVOKED","--repo",REPOSITORY,"--body","YES"]);
 let successful=false;
 try{
  for(const name of SECRETS)gh(["secret","set",name,"--env","production","--repo",REPOSITORY],secrets[name]);
  const available=JSON.parse(gh(["secret","list","--env","production","--repo",REPOSITORY,"--json","name"]));
  if(!Array.isArray(available)||SECRETS.some(name=>!available.some(x=>x.name===name)))fail();
  gh(["variable","set","GEOMACRO_STANDING_DELEGATION_REVOKED","--repo",REPOSITORY,"--body","NO"]);
  gh(["variable","set","GEOMACRO_STANDING_DELEGATION_ENABLED","--repo",REPOSITORY,"--body","YES_DELEGATED_DERIVED_ONLY"]);
  const vars=JSON.parse(gh(["variable","list","--repo",REPOSITORY,"--json","name,value"]));
  if(!Array.isArray(vars)||
    !vars.some(x=>x.name==="GEOMACRO_STANDING_DELEGATION_ENABLED"&&x.value==="YES_DELEGATED_DERIVED_ONLY")||
    !vars.some(x=>x.name==="GEOMACRO_STANDING_DELEGATION_REVOKED"&&x.value==="NO"))fail();
  gh(["workflow","run",WORKFLOW,"--ref","main","--repo",REPOSITORY]);
  successful=true;
 }finally{
  if(!successful){
   try{gh(["variable","set","GEOMACRO_STANDING_DELEGATION_ENABLED","--repo",REPOSITORY,"--body","NO"])}catch{}
   try{gh(["variable","set","GEOMACRO_STANDING_DELEGATION_REVOKED","--repo",REPOSITORY,"--body","YES"])}catch{}
  }
 }
 console.log(JSON.stringify({
  status:"CLOUD_ENROLLED_AND_WORKFLOW_TRIGGERED_AWAIT_LIVE_RESULT",
  two_human_signatures_verified:true,
  profile:"GEOMACRO_DELEGATED_DERIVED_ONLY_NOT_GRI_V1",
  protected_secrets_metadata_verified:true,
  extra_human_private_key_uploads:0,commercial_rights_verified:false,
  numerical_gri_authorized:false,hot_signed_3_of_3_verified:false,
  funds_transferred:0,
  next:"gh run list --workflow standing-delegated-derived-attestation.yml --limit 3 --repo blocknine0/geomacro"
 }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(()=>{console.error(ERROR);process.exitCode=2;});

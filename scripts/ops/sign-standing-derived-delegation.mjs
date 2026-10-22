#!/usr/bin/env node
// One-time, interactive, LOCAL human governance consent. Never uploads keys.
import {readFileSync,writeFileSync,statSync,realpathSync,existsSync} from "node:fs";
import {dirname,resolve,relative,isAbsolute} from "node:path";
import {createPrivateKey,createPublicKey,createHash} from "node:crypto";
import {createInterface} from "node:readline/promises";
import {readHumanKeyPassphrase} from "../lib/read-human-key-passphrase.mjs";
import {makePolicy,policyBytes,signPolicyForRole,validateDelegation,
 ENVELOPE_SCHEMA,ENABLE} from "../lib/standing-derived-delegation.mjs";
const fail=()=>{throw Error("STANDING_DELEGATION_LOCAL_INPUT_OR_APPROVAL_REQUIRED");};
const requirePath=p=>{
 if(!isAbsolute(p??"")||!existsSync(p))fail();
 if(statSync(p).size>15000)fail();
 return p;
};
function outPath(p){
 if(!isAbsolute(p??"")||existsSync(p))fail();
 const repo=realpathSync(process.cwd()),dir=realpathSync(dirname(p));
 const rel=relative(repo,dir);
 if(rel===""||(!rel.startsWith("..")&&!isAbsolute(rel)))fail();
 if(process.platform!=="win32"&&(statSync(dir).mode&0o077)!==0)fail();
 return p;
}
const readJson=p=>JSON.parse(readFileSync(requirePath(p),"utf8"));
const write=(p,obj)=>writeFileSync(outPath(p),JSON.stringify(obj,null,2)+"\n",
 {flag:"wx",mode:0o600});
const pin=pem=>createHash("sha256")
 .update(createPublicKey(pem).export({type:"spki",format:"der"})).digest("hex");
async function main(env=process.env){
 if(!process.stdin.isTTY||!process.stdout.isTTY||
  env.GITHUB_ACTIONS==="true"||env.CI==="true"||process.argv.length!==3)fail();
 const mode=process.argv[2];
 if(mode==="--init-policy"){
  const pem=readFileSync(requirePath(env.GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PATH),"utf8");
  const p=makePolicy({machinePublicKeyPem:pem});
  write(env.GEOMACRO_DELEGATION_POLICY_PATH,p);
  console.log("DERIVED_ONLY_POLICY_CREATED_UNAPPROVED");
  return;
 }
 if(mode==="--sign-owner"||mode==="--sign-reviewer"){
  const role=mode==="--sign-owner"?"PALLAB_OWNER":"SUMAN_GOVERNANCE_CONSENT";
  const policy=readJson(env.GEOMACRO_DELEGATION_POLICY_PATH);
  const keyPath=requirePath(env.GEOMACRO_DELEGATION_PRIVATE_KEY_PATH);
  if(process.platform!=="win32"&&(statSync(keyPath).mode&0o077)!==0)fail();
  const publicKey=createPublicKey(readFileSync(requirePath(
   env.GEOMACRO_DELEGATION_PUBLIC_KEY_PATH),"utf8"));
  const digest=createHash("sha256").update(policyBytes(policy)).digest("hex");
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{
   console.log("ONE-TIME GOVERNANCE "+role+" policy SHA256 "+digest);
   console.log("DERIVED-ONLY: no legal rights, no GRI numerical score, no payment, no human review impersonation.");
   const answer=await rl.question("Type AUTHORIZE DERIVED ONLY STANDING DELEGATION: ");
   if(answer!=="AUTHORIZE DERIVED ONLY STANDING DELEGATION")fail();
  }finally{rl.close();}
  const passphrase=await readHumanKeyPassphrase("Enter YOUR encrypted Ed25519 key passphrase (hidden): ");
  const raw=readFileSync(keyPath);
  if(!raw.toString("ascii",0,90).includes("BEGIN ENCRYPTED PRIVATE KEY"))fail();
  const privateKey=createPrivateKey({key:raw,passphrase});
  if(pin(publicKey)!==pin(createPublicKey(privateKey)))fail();
  const signed=signPolicyForRole(policy,privateKey,role);
  write(env.GEOMACRO_DELEGATION_APPROVAL_OUTPUT_PATH,signed);
  console.log("GENUINE_LOCAL_STANDING_DELEGATION_SIGNATURE_CREATED "+role);
  return;
 }
 if(mode==="--assemble"){
  const policy=readJson(env.GEOMACRO_DELEGATION_POLICY_PATH);
  const owner=readJson(env.GEOMACRO_DELEGATION_OWNER_APPROVAL_PATH);
  const reviewer=readJson(env.GEOMACRO_DELEGATION_REVIEWER_APPROVAL_PATH);
  const ownerPem=readFileSync(requirePath(env.GEOMACRO_OWNER_PUBLIC_KEY_PATH),"utf8");
  const reviewerPem=readFileSync(requirePath(env.GEOMACRO_SUMAN_PUBLIC_KEY_PATH),"utf8");
  const machinePem=readFileSync(requirePath(env.GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PATH),"utf8");
  const envelope={schema:ENVELOPE_SCHEMA,policy,approvals:[owner,reviewer]};
  const receipt=validateDelegation(envelope,{
   ownerPem,ownerPin:pin(ownerPem),reviewerPem,reviewerPin:pin(reviewerPem),
   machinePem,machinePin:pin(machinePem),enabled:ENABLE,revoked:"NO"
  });
  write(env.GEOMACRO_DELEGATION_ENVELOPE_OUTPUT_PATH,envelope);
  console.log(JSON.stringify({status:receipt.status,
   note:"LOCAL_ONLY_PRODUCTION_PUBLIC_PINS_STILL_REQUIRE_PROTECTED_GITHUB_CHECK",
   payments:0}));
  return;
 }
 fail();
}
main().catch(()=>{console.error("STANDING_DELEGATION_LOCAL_OPERATION_REFUSED");process.exitCode=2;});
#!/usr/bin/env bun
/**
 * Owner-private machine Intelligence handoff. Does NOT issue facts/rights
 * signatures or licences. B2 private archival is permitted only AFTER a real
 * signature, original-page and rights-registry qualification succeeds.
 * Subsequent protected GitHub publisher independently repeats every check.
 */
import {createHash} from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {qualifyMachineIntelligenceBatch} from
  "../../src/lib/machine-intelligence-publication.server.ts";
import {machineCommercialAuthorityConfigurationValid} from
  "../../src/lib/geomacro-machine-commercial-qualification.server.ts";
import {createB2Client} from "./b2-s3-client.mjs";

const SHA=/^[a-f0-9]{64}$/u;
const PREFIX="geomacro-evidence/v1/private/machine-intelligence-current/";
const MAX=2*1024*1024;
const fail=code=>{throw Error("MACHINE_INTELLIGENCE_STAGE_"+code)};
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const blocked=["SUPABASE_URL","SUPABASE_DB_URL","APP_SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
 "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY",
 "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"];

export function readMachineStageInput({env=process.env,readFile=readFileSync,stat=lstatSync}={}){
 const path=env.GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT;
 const pin=env.GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256;
 if(!path||!SHA.test(String(pin??"")))fail("PIN_REQUIRED");
 const s=stat(path);
 if(!s.isFile()||s.isSymbolicLink()||s.size<100||s.size>MAX||
    process.platform!=="win32"&&(s.mode&0o077)!==0)fail("PRIVATE_INPUT_FILE_INVALID");
 const bytes=Buffer.from(readFile(path));
 if(bytes.length!==s.size||digest(bytes)!==pin)fail("EXACT_BYTES_INVALID");
 let input;
 try{input=JSON.parse(bytes.toString("utf8"))}catch{fail("INVALID_JSON")}
 if(!input||typeof input!=="object"||Array.isArray(input)||
    Object.keys(input).length!==2||!Object.hasOwn(input,"rows")||
    !Object.hasOwn(input,"eventPackages")||
    !Array.isArray(input.rows)||!Array.isArray(input.eventPackages)||
    input.rows.length<3||input.rows.length>12||
    input.rows.length!==input.eventPackages.length)fail("BATCH_SHAPE_INVALID");
 const domains=new Set(input.eventPackages.map(p=>p?.category));
 if(!["geopolitics","macro","rare_earth"].every(s=>domains.has(s)))
    fail("THREE_DOMAINS_REQUIRED");
 return {input,bytes,pin,key:PREFIX+pin+".json"};
}
export function assertMachineStageEnvironment(env=process.env){
 if(blocked.some(k=>Boolean(env[k])))fail("FUNDS_OR_SUPABASE_FORBIDDEN");
 if(env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="machine_intelligence_signed_staging"||
    env.B2_REQUEST_BUDGET!=="6"||
    !env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
    !env.D1_DATABASE_ID||!env.CLOUDFLARE_ACCOUNT_ID||
    !env.CLOUDFLARE_API_TOKEN||
    String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32)
   fail("QUOTA_GOVERNED_PRIVATE_RUNTIME_REQUIRED");
 if(env.MACHINE_SIGNED_READY_DISPATCH_ACK &&
    env.MACHINE_SIGNED_READY_DISPATCH_ACK!=="YES_NO_FUNDS")
   fail("INVALID_DISPATCH_CONSENT");
}
export function machineStageDispatchPayload(key,pin){
 if(!SHA.test(String(pin??""))||key!==PREFIX+pin+".json")
   fail("IMMUTABLE_DISPATCH_PIN_INVALID");
 return {event_type:"machine_intelligence_dual_signed_ready",client_payload:{
   schema:"geomacro.machine-intelligence-dual-signed-ready.v1",
   machine_b2_key:key,machine_b2_sha256:pin,
 }};
}
export async function stageMachineIntelligence({
 env=process.env,now=()=>new Date(),fetchImpl=fetch,
 qualifier=qualifyMachineIntelligenceBatch,
 archiveClient=()=>createB2Client({endpointUrl:"https://s3.us-east-005.backblazeb2.com",
   bucket:"geomacro-private-archive",accessKey:env.B2_KEY_ID,
   secretKey:env.B2_APPLICATION_KEY}),
}={}){
 assertMachineStageEnvironment(env);
 if(!machineCommercialAuthorityConfigurationValid(env))
   fail("INDEPENDENT_FACTS_RIGHTS_PUBLIC_KEY_PINS_REQUIRED");
 const {input,bytes,pin,key}=readMachineStageInput({env});
 const qualified=await qualifier({...input,now:now()});
 const expires=Date.parse(qualified?.qualified_until??"");
 if(qualified?.receipt?.commercial_event_admission!==true||
    qualified?.receipt?.qualified_event_count!==input.rows.length||
    !Number.isFinite(expires)||expires<=now().getTime())
   fail("REAL_SIGNED_EVENT_AND_RIGHTS_QUALIFICATION_REQUIRED");
 // The immutable input is private only; never overwrite a different object.
 const b2=archiveClient();
 const old=await b2.getOptional(key);
 let writes=0;
 if(old){
   if(!Buffer.from(old).equals(bytes))fail("IMMUTABLE_KEY_COLLISION");
 }else{
   await b2.put(key,bytes);writes=1;
 }
 const observed=Buffer.from(await b2.get(key));
 if(!observed.equals(bytes)||digest(observed)!==pin)
   fail("EXACT_PRIVATE_B2_READBACK_REQUIRED");
 if(expires<=now().getTime())fail("REAL_SIGNED_APPROVAL_EXPIRED_DURING_STAGING");
 let dispatched=false;
 if(env.MACHINE_SIGNED_READY_DISPATCH_ACK==="YES_NO_FUNDS"){
   if(String(env.GITHUB_TOKEN??"").length<30)fail("PRIVATE_DISPATCH_TOKEN_REQUIRED");
   const response=await fetchImpl("https://api.github.com/repos/blocknine0/geomacro/dispatches",{
     method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
     headers:{"accept":"application/vnd.github+json",
       authorization:"Bearer "+env.GITHUB_TOKEN,
       "content-type":"application/json",
       "x-github-api-version":"2022-11-28"},
     body:JSON.stringify(machineStageDispatchPayload(key,pin)),
   });
   if(response.status!==204)fail("PROTECTED_MACHINE_PUBLISHER_DISPATCH_REJECTED");
   dispatched=true;
 }
 return Object.freeze({schema:"geomacro.private-machine-intelligence-b2-stage.v1",
   immutable_b2_key:key,immutable_b2_sha256:pin,qualified_event_count:input.rows.length,
   real_signed_rights_preflight_verified:true,exact_private_b2_readback_verified:true,
   publisher_dispatch_accepted:dispatched,publisher_published:false,
   current_public_intelligence_verified:false,
   b2_writes:writes,b2_requests_started:b2.usage().requests_started,
   supabase_requests:0,real_payments:0});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=="--stage-dual-signed-no-funds")
     fail("EXPLICIT_PRIVATE_STAGING_MODE_REQUIRED");
  console.log(JSON.stringify(await stageMachineIntelligence()));
 }catch{
  console.error("MACHINE_INTELLIGENCE_SIGNED_B2_STAGE_FAILED_CLOSED");
  process.exitCode=2;
 }
}

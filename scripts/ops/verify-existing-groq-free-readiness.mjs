#!/usr/bin/env node
/**
 * One zero-inference readiness check on the EXISTING GROQ_API_KEY.
 * GET /models is metadata, not a browser-search or chat-completion call.
 * Never prints key, response body, identifiers, headers, plan guesses, or
 * personal/customer source information.
 */
import {fileURLToPath} from "node:url";
const MODELS="https://api.groq.com/openai/v1/models";
const GROQ_MODEL="openai/gpt-oss-20b";
const fixed=s=>s?"PRESENT":"NOT_CONFIGURED";
export async function checkExistingGroqReadiness({
 env=process.env,fetchImpl=fetch
}={}){
 const key=env.GROQ_API_KEY;
 const present=typeof key==="string"&&key.trim().length>0;
 const flag=env.GROQ_BROWSER_SEARCH_ENABLED==="1";
 const ack=env.GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK==="YES_BROWSER_FREE_TIER_CONFIRMED";
 let modelState="NOT_CHECKED_NO_EXISTING_KEY";
 // Zero model inference, zero browser_search. No paid call; never echo a
 // server-originated response even when it is unexpectedly an HTML error.
 if(present){
  modelState="MODEL_METADATA_UNAVAILABLE";
  try{
   const res=await fetchImpl(MODELS,{
    method:"GET",redirect:"error",
    headers:{Authorization:"Bearer "+key,Accept:"application/json"},
    signal:AbortSignal.timeout(10000)
   });
   if(res?.status===200 &&
      Number(res.headers?.get?.("content-length")||0)<=128000){
    const body=await res.text();
    if(body.length<=128000){
     const parsed=JSON.parse(body);
     modelState=Array.isArray(parsed?.data)&&
      parsed.data.some(x=>x?.id===GROQ_MODEL)?
      "EXISTING_KEY_CAN_READ_GPT_OSS_MODEL_METADATA":
      "MODEL_NOT_IN_EXISTING_KEY_METADATA";
    }
   }else if(res?.status===401||res?.status===403){
    modelState="EXISTING_KEY_AUTH_REJECTED";
   }else if(res?.status===429){
    modelState="METADATA_RATE_LIMITED";
   }
  }catch{modelState="MODEL_METADATA_UNAVAILABLE";}
 }
 const ready=present&&flag&&ack&&modelState==="EXISTING_KEY_CAN_READ_GPT_OSS_MODEL_METADATA";
 return Object.freeze({
  schema:"geomacro.groq-existing-key-readiness.v1",
  mode:"READ_ONLY_METADATA_NO_INFERENCE_OR_BROWSER_SEARCH",
  existing_key_configured:fixed(present),
  supported_model_access_state:modelState,
  browser_search_flag:fixed(flag),
  owner_free_tier_attestation:ack?"PROVIDED":"NOT_PROVIDED",
  free_account_tier_verified:false,
  browser_search_entitlement_verified:false,
  deployed_lovable_ask_env_verified:false,
  browser_search_actual_completion_verified:false,
  configuration_ready_to_try_on_owner_verified_free_plan:ready,
  service_permission_to_bill:false,
  new_key_provisioned:false,
  key_rotated:false,
  inference_requests:0,browser_search_requests:0,
  b2_requests:0,d1_writes:0,supabase_requests:0,real_payments:0
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)throw Error("INVALID_ARGUMENTS");
  console.log(JSON.stringify(await checkExistingGroqReadiness()));
 }catch{
  console.error("GROQ_METADATA_ONLY_CHECK_FAILED_CLOSED");
  process.exitCode=2;
 }
}

#!/usr/bin/env node
/**
 * One existing-GROQ_API_KEY FREE-tier browser_search integration acceptance.
 * Uses EXACT production fallback client (not a fake metadata proxy).
 * Logs exclusively fixed statuses, no Groq text, links, sources or secrets.
 * No B2/D1, public paid endpoint, Supabase or money side effects.
 */
import {fileURLToPath} from "node:url";
import {groqBrowserResearchForMissingOfficial} from "../lib/groq-browser-live-fallback.mjs";
const BLOCK="GROQ_PROTECTED_LIVE_BROWSER_SMOKE_DENIED";
function deny(){throw Error(BLOCK)}
const ALLOWED_HTTP=new Set([200,400,401,403,408,422,429,500,502,503,504]);
export function classifyLiveGroqBrowserEnvelope(status,envelope){
 const http=ALLOWED_HTTP.has(status)?status:null;
 let msg=null;
 if(http===200){
  msg=envelope?.choices?.[0]?.message?.content;
 }
 return Object.freeze({
  provider_http_status:http,
  completion_text_received:typeof msg==="string"&&msg.trim().length>0,
  strict_json_text_received:typeof msg==="string"&&
   msg.trim().startsWith("{")&&msg.trim().endsWith("}"),
  provider_model:String(envelope?.model??"").slice(0,80)==="openai/gpt-oss-20b"?
   "GPT_OSS_20B":"UNCONFIRMED",
 });
}
export function assertHostedLiveGroqEnv(env=process.env){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    false)deny();
 // Site owner's plan confirmation is encoded in the versioned workflow and
 // this exact code's feature contract; never silently use a Developer plan.
 if(env.GROQ_SMOKE_OWNER_FREE_PLAN!=="YES_OWNER_CONFIRMED_FREE"||
    typeof env.GROQ_API_KEY!=="string"||!env.GROQ_API_KEY.trim()||
    ["SUPABASE_URL","SUPABASE_DB_URL","COINBASE_API_KEY",
     "COINBASE_COMMERCE_API_KEY","COINBASE_X402_MAINNET_ACK"]
       .some(k=>Boolean(env[k])))deny();
 return true;
}
export async function verifyRealGroqBrowserOnce({
 env=process.env,now=new Date(),fetchImpl=fetch
}={}){
 assertHostedLiveGroqEnv(env);
 let callCount=0;
 let observation=null;

 const intercepted=async(url,options)=>{
  callCount++;
  if(callCount!==1||url!=="https://api.groq.com/openai/v1/chat/completions"||
      options?.method!=="POST")deny();
  let request;
  try{request=JSON.parse(options.body)}catch{deny()}
  if(request.model!=="openai/gpt-oss-20b"||
     request.tool_choice!=="required"||
     JSON.stringify(request.tools)!=='[{"type":"browser_search"}]'||
     request.response_format!==undefined||
     request.messages?.some(m=>typeof m.content!=="string")||
     request.max_completion_tokens>900)deny();
  const r=await fetchImpl(url,options);
  let body=null;
  try{
   // No raw browser result is ever printed. Only envelope shape is checked.
   body=await r.json();
  }catch{}
  observation=classifyLiveGroqBrowserEnvelope(r?.status,body);
  return {status:r?.status,json:async()=>body};
 };
 let result=null,validation="NO_CALL";
 try{
  result=await groqBrowserResearchForMissingOfficial({
   categories:["MACRO"],country_iso3:"IND",country_name:"India",
   now,env,fetchImpl:intercepted
  });
  validation=result?.leads?.length>0?"VALIDATED_PROVISIONAL_LEADS":
   "NO_ELIGIBLE_RESEARCH_LEADS";
 }catch{
  validation=observation?.provider_http_status===200?
   "HTTP_200_BUT_MODEL_OUTPUT_NOT_VALID_STRICT_STRUCTURED_LEADS":
   "BROWSER_SEARCH_UPSTREAM_UNAVAILABLE";
 }
 if(callCount!==1)deny();
 const receipt={
  schema:"geomacro.live-groq-browser-exact-fallback-smoke.v1",
  mode:"ONE_REAL_EXISTING_FREE_GROQ_BROWSER_REQUEST_ONLY",
  one_browser_tool_request_sent:true,
  tool_choice_required:true,
  provider_http_status:observation?.provider_http_status??null,
  completion_text_received:observation?.completion_text_received??false,
  strict_json_text_received:observation?.strict_json_text_received??false,
  model_name_validated:observation?.provider_model==="GPT_OSS_20B",
  fallback_validation:validation,
  structured_provisional_leads:result?.leads?.length??0,
  actual_first_party_original_html_readback:false,
  independent_event_verification:false,
  third_party_commercial_rights_verified:false,
  gro_signed_product_published:false,
  paid_output_authorized:false,
  deep_health_200_verified:false,
  customer_site_runtime_verified:false,
  inference_requests:1,browser_tool_requests:1,
  source_or_model_text_logged:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,real_payments:0
 };
 if(JSON.stringify(receipt).includes("http://")||JSON.stringify(receipt).includes("https://"))deny();
 return Object.freeze(receipt);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try {
  if(process.argv.length!==2)deny();
  const r=await verifyRealGroqBrowserOnce();
  process.stdout.write(JSON.stringify(r)+"\n");
  if(r.provider_http_status!==200 ||
     r.fallback_validation!=="VALIDATED_PROVISIONAL_LEADS")
   process.exitCode=2;
 }catch {
  process.stderr.write(BLOCK+"\n");
  process.exitCode=2;
 }
}

#!/usr/bin/env node
/**
 * One actual protected Groq GPT-OSS browser_search canary. Never output
 * user query, web snippets, publisher names, URLs, key, text or response body.
 * Product-code parser is the exact production validator, not a duplicate.
 * Zero B2/D1 writes, no payment, no downstream licensed publication.
 */
import {fileURLToPath} from "node:url";
import {groqBrowserResearchForMissingOfficial,
 validateGroqBrowserLeadText,GROQ_BROWSER_STRICT_LOCK_SHA}
 from "../lib/groq-browser-live-fallback.mjs";
const DENY="GROQ_BROWSER_LIVE_STRICT_ACCEPTANCE_NOT_VERIFIED";
export async function runProtectedGroqBrowserAcceptance({
 env=process.env,realFetch=fetch,now=new Date()
}={}){
 if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_ACTIONS!=="true"||
    typeof env.GROQ_API_KEY!=="string"||!env.GROQ_API_KEY.trim()||
    typeof realFetch!=="function")throw Error(DENY);
 const categories=["MACRO"];
 let calls=0,browser200=false,converter200=false,structuredAccepted=false;
 let providerToolEvidence=false;
 const wrapped=async(url,opts)=>{
  if(url!=="https://api.groq.com/openai/v1/chat/completions"||
   opts?.method!=="POST"||calls>=2)throw Error(DENY);
  const req=JSON.parse(opts.body||"{}");
  const stage=++calls;
  if(stage===1){
   if(req.model!=="openai/gpt-oss-20b"||
      req.tool_choice!=="required"||
      JSON.stringify(req.tools)!=='[{"type":"browser_search"}]'||
      req.response_format!==undefined)throw Error(DENY);
  }else{
   if(req.tools!==undefined||req.tool_choice!==undefined||
    req.response_format?.type!=="json_schema"||
    req.response_format?.json_schema?.strict!==true)throw Error(DENY);
  }
  let response;
  try{response=await realFetch(url,opts)}catch{throw Error(DENY)}
  if(response?.status!==200)return response;
  let data;try{data=await response.json()}catch{throw Error(DENY)}
  if(stage===1){
   browser200=true;
   providerToolEvidence=Array.isArray(data?.choices?.[0]?.message?.executed_tools)&&
    data.choices[0].message.executed_tools.some(x=>
      typeof x?.type==="string"&&x.type==="browser_search");
  }else converter200=true;
  // The mere presence of JSON/prose does not prove built-in web execution.
  if(stage===1&&!providerToolEvidence)throw Error(DENY);
  const content=data?.choices?.[0]?.message?.content;
  try{
   // An empty leads[] still proves the STRICT validator accepted a legitimate
   // no-current-information result. It cannot create a sourced customer claim.
   validateGroqBrowserLeadText(content,{categories,now});
   structuredAccepted=true;
  }catch{}
  return {status:200,json:async()=>data};
 };
 let result;
 try{result=await groqBrowserResearchForMissingOfficial({
  categories,country_iso3:"IND",country_name:"India",
  env:{GROQ_API_KEY:env.GROQ_API_KEY},
  fetchImpl:wrapped,now
 });}catch{throw Error(DENY)}
 if(!browser200||!providerToolEvidence||!structuredAccepted||calls<1||calls>2)throw Error(DENY);
 return Object.freeze({
  schema:"geomacro.groq-real-browser-strict-acceptance.v1",
  status:"REAL_PROVIDER_BROWSER_RESPONSE_AND_STRICT_SCHEMA_ACCEPTED",
  production_validator:GROQ_BROWSER_STRICT_LOCK_SHA,
  provider_browser_http_200:browser200,
  provider_executed_tools_marker_observed:providerToolEvidence,
  schema_validated_by_production_validator:structuredAccepted,
  converter_http_200:converter200,
  provider_calls:calls,
  accepted_provisional_leads:result?.leads?.length||0,
  authoritative_original_source_verified:false,
  source_rights_verified:false,
  signed_commercial_intelligence:false,
  groq_key_printed:false,source_data_printed:false,
  real_payments:0,b2_requests:0,d1_writes:0,supabase_requests:0
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const result=await runProtectedGroqBrowserAcceptance();
  process.stdout.write(JSON.stringify(result)+"\n");
 }catch{
  console.error(DENY);
  process.exitCode=2;
 }
}

#!/usr/bin/env node
/** First revenue: bounded, actual-production, three-category Intelligence Query probe.
 * No payment headers, signed transaction, credentials, D1/B2 calls, source output,
 * live-research fallback or entitlement writes. An observed 402 is NOT a sale.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const ORIGIN="https://geomacro.live";
const PATH="/api/v1/intelligence/query";
const SHA=/^[a-f0-9]{40}$/u;
const ERR=/^[A-Z][A-Z0-9_]{1,100}$/u;
const MAX_BODY=128_000;
const output="artifacts/commercial/first-revenue-three-category-no-funds.json";
export const CASES=Object.freeze([
 Object.freeze({category:"geopolitics",country_iso3:"USA",topic:"conflict_geopolitics",
  question:"What is the latest verified US geopolitical announcement, and why does that specific event matter?"}),
 Object.freeze({category:"macro",country_iso3:"USA",topic:"macro_risk",
  question:"What is the latest verified US monetary-policy release, and what does it mean for macro risks?"}),
 Object.freeze({category:"critical_minerals",country_iso3:"CHL",topic:"critical_minerals",
  question:"What is the latest verified Chilean critical-minerals policy or lithium announcement, and why does that event matter?"}),
]);
const plain=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:null;
const safeError=x=>typeof x==="string"&&ERR.test(x)?x:null;
const requestBody=c=>JSON.stringify({
 schema_version:"geomacro.agent-query.v1",
 question:c.question,
 product:{capability:"intelligence_query",variant:"focused"},
 subjects:[{type:"country",country_iso3:c.country_iso3}],
 topics:[c.topic],detail:"compact",evidence:"required",
 fulfillment_mode:"published_only",delivery_tier:"signed_risk_intelligence",
});
async function readBounded(fetchImpl,url,init={}){
 let response;
 try{
  response=await fetchImpl(url,{redirect:"error",cache:"no-store",
   ...init,signal:AbortSignal.timeout(15_000)});
 }catch{return {status:0,body:null,headers:new Headers(),invalid:true};}
 if(response.redirected||!Number.isInteger(response.status)||
    Number(response.headers.get("content-length")||0)>MAX_BODY)
  return {status:response.status,body:null,headers:response.headers,invalid:true};
 try{
  const wire=await response.text();
  if(wire.length>MAX_BODY)return {status:response.status,body:null,headers:response.headers,invalid:true};
  return {status:response.status,body:plain(JSON.parse(wire)),headers:response.headers,invalid:false};
 }catch{return {status:response.status,body:null,headers:response.headers,invalid:true};}
}
export function classifyUnpaid(res){
 const data=plain(res.body);
 if(res.invalid||!data||res.status===0)return {disposition:"TRANSPORT_OR_JSON_UNVERIFIED",error_code:null};
 if(res.headers.has("payment-response")||res.headers.has("x-geomacro-delivery-sha256"))
  return {disposition:"UNPAID_SETTLEMENT_OR_DELIVERY_CLAIM_REJECTED",error_code:null};
 const paymentHeader=res.headers.has("payment-required");
 if(res.status===402){
  const url=typeof data.resource?.url==="string"?data.resource.url:"";
  let exact=false;
  try{const u=new URL(url);exact=u.origin===ORIGIN&&u.pathname===PATH&&!u.search&&!u.hash}catch{}
  const valid=paymentHeader&&data.x402Version===2&&exact&&
   Array.isArray(data.accepts)&&data.accepts.length>0;
  return {disposition:valid?"UNPAID_402_CHALLENGE_ONLY":"MALFORMED_402_REJECTED",error_code:null};
 }
 const noFunds=data.chargeable===false&&data.payment_required_now===false&&
  data.payment_authorized!==true&&data.execution_authorized===false&&!paymentHeader;
 const error_code=safeError(data.error?.code)??safeError(data.availability?.code);
 if(noFunds&&[400,422,429,503].includes(res.status))
  return {disposition:"NO_CHARGE_NOT_QUALIFIED",error_code};
 if(noFunds&&res.status===200)
  return {disposition:"NO_CHARGE_RESEARCH_ONLY",error_code};
 return {disposition:"UNEXPECTED_UNPAID_HTTP_REJECTED",error_code};
}
export async function inspectThreeCategories({fetchImpl=fetch,expectedSha,now=new Date()}={}){
 if(typeof expectedSha!=="string"||!SHA.test(expectedSha)||
   !(now instanceof Date)||!Number.isFinite(now.valueOf()))
  throw Error("FIRST_REVENUE_EXPECTED_SHA_REQUIRED");
 const build=await readBounded(fetchImpl,ORIGIN+"/.well-known/geomacro-build.json");
 const parity=build.status===200&&!build.invalid&&
   build.body?.schema_version==="geomacro.deployment-build.v1"&&
   build.body?.canonical_repository==="blocknine0/geomacro"&&
   build.body?.canonical_main_sha===expectedSha;
 const entries=[];
 if(parity){
  for(const item of CASES){
   const res=await readBounded(fetchImpl,ORIGIN+PATH,{
    method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
    body:requestBody(item),
   });
   const verdict=classifyUnpaid(res);
   entries.push({
    category:item.category,subject_country_iso3:item.country_iso3,
    requested_variant:"focused",published_only:true,
    http_status:res.status,disposition:verdict.disposition,error_code:verdict.error_code,
    x402_unpaid_challenge_observed:verdict.disposition==="UNPAID_402_CHALLENGE_ONLY",
    product_rights_verified:false,immutable_prequote_verified:false,
    paid_delivery_verified:false,
   });
  }
 }
 const unsafe=entries.some(x=>["UNPAID_SETTLEMENT_OR_DELIVERY_CLAIM_REJECTED",
   "MALFORMED_402_REJECTED","UNEXPECTED_UNPAID_HTTP_REJECTED"].includes(x.disposition));
 return Object.freeze({
  schema:"geomacro.first-revenue.three-category-no-funds.v1",
  checked_at:now.toISOString(),canonical_main_sha:expectedSha,
  exact_deployed_sha_verified:parity,canonical_endpoint:PATH,
  requested_categories:["geopolitics","macro","critical_minerals"],
  request_count:entries.length,unpaid_402_challenge_count:entries.filter(x=>x.x402_unpaid_challenge_observed).length,
  status:!parity?"DEPLOYMENT_PARITY_BLOCKED":unsafe?"UNSAFE_RESPONSE_BLOCKED":
    entries.some(x=>x.disposition==="TRANSPORT_OR_JSON_UNVERIFIED")?"PROBE_INCOMPLETE":
    "THREE_CATEGORY_NO_FUNDS_OBSERVATION_COMPLETE_NOT_LAUNCHED",
  payment_signature_sent:false,funds_touched:false,settlement_attempted:false,
  commercial_source_rights_verified:false,b2_same_record_receipts_verified:false,
  signed_paid_response_verified:false,first_real_revenue_verified:false,
  first_paid_query_qualified:false,prices_or_payment_config_modified:false,
  predge_or_historical_modified:false,cases:entries,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.env.GITHUB_ACTIONS!=="true"||
     process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main")
   throw Error("FIRST_REVENUE_TRUSTED_MAIN_REQUIRED");
  const receipt=await inspectThreeCategories({expectedSha:process.env.EXPECTED_CANONICAL_SHA});
  mkdirSync("artifacts/commercial",{recursive:true,mode:0o700});
  writeFileSync(output,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
  if(!receipt.exact_deployed_sha_verified||receipt.status==="UNSAFE_RESPONSE_BLOCKED"||
     receipt.status==="PROBE_INCOMPLETE")process.exitCode=3;
 }catch(error){
  const code=String(error?.message??"");
  console.error("::error::"+(/^[A-Z0-9_]+$/u.test(code)?code:"FIRST_REVENUE_NO_FUNDS_FAILED_CLOSED"));
  process.exitCode=3;
 }
}

#!/usr/bin/env node
/** Phase 2H / first Intelligence Query PRODUCTION no-funds customer receipt.
 * At most one existing public endpoint POST; no PAYMENT-SIGNATURE, wallet,
 * payer ID, customer content, original news title/URL, database or B2 access.
 * A challenge is NOT proof of source rights or successful settlement.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
export const FIRST_QUERY_PATH="/api/v1/intelligence/structured-answer";
export const FIRST_QUERY=Object.freeze({
 question:"What is the most recent verified Federal Reserve monetary policy announcement for the United States, and why could it matter for USD exchange rates?",
 subjects:[{type:"country",country_iso3:"USA"}],
 topics:["macro_risk","fx_external_risk"],
});
const BASE="https://geomacro.live";
const SHA=/^[a-f0-9]{40}$/u;
const ERR=/^[A-Z][A-Z0-9_]{1,100}$/u;
const fail=code=>{throw Error("PHASE2H_NO_FUNDS_QUERY_"+code)};
const jsonObject=x=>x&&typeof x==="object"&&!Array.isArray(x)?x:null;
const safeCode=x=>typeof x==="string"&&ERR.test(x)?x:null;
const OUTPUT="artifacts/commercial/phase2h-first-intelligence-query-no-funds.json";
async function bounded(fetchImpl,url,init={}){
 const response=await fetchImpl(url,{redirect:"error",cache:"no-store",
  ...init,signal:AbortSignal.timeout(18000)});
 if(!Number.isInteger(response.status)||response.redirected||
    Number(response.headers.get("content-length")||"0")>128000)
  fail("UNBOUNDED_OR_REDIRECT_RESPONSE");
 const wire=await response.text();
 if(wire.length>128000)fail("UNBOUNDED_RESPONSE");
 let body;try{body=JSON.parse(wire)}catch{fail("NON_JSON_RESPONSE")}
 return {status:response.status,body:jsonObject(body),headers:response.headers};
}
export async function probeFirstQuery({fetchImpl=fetch,expectedSha,now=new Date()}={}){
 if(typeof expectedSha!=="string"||!SHA.test(expectedSha)||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
  fail("INVALID_INPUT");
 // Public immutable SHA marker read is NOT a private D1 census or B2 proof.
 const deployment=await bounded(fetchImpl,BASE+"/.well-known/geomacro-build.json");
 if(deployment.status!==200||
    deployment.body?.schema_version!=="geomacro.deployment-build.v1"||
    deployment.body?.canonical_repository!=="blocknine0/geomacro"||
    deployment.body?.canonical_main_sha!==expectedSha)
  fail("DEPLOYED_SHA_PARITY_UNVERIFIED");
 // Only one live-priced machine-style question; normal public rate limiting,
 // without payment headers, special credentials or a second provider poll.
 const response=await bounded(fetchImpl,BASE+FIRST_QUERY_PATH,{
  method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
  body:JSON.stringify(FIRST_QUERY),
 });
 if(response.headers.has("payment-response")||
    response.headers.has("x-geomacro-delivery-sha256"))
  fail("UNPAID_RESPONSE_CLAIMED_SETTLEMENT");
 const payload=response.body;
 let disposition=null;
 const noFunds=payload?.chargeable===false&&
    payload?.payment_required_now===false&&
    payload?.payment_authorized!==true&&
    payload?.execution_authorized!==true;
 if([422,503,429].includes(response.status)&&noFunds&&
    !response.headers.has("payment-required")){
   disposition="NO_CHARGE_UNQUALIFIED_OR_UNAVAILABLE";
 }else if(response.status===200&&noFunds&&
    !response.headers.has("payment-required")){
   // Free, unverified research response is not a frozen PAYABLE answer.
   disposition="NONCOMMERCIAL_RESEARCH_ONLY";
 }else if(response.status===402&&response.headers.has("payment-required")&&
    !response.headers.has("payment-response")&&payload){
   // Only the signed existing canonical handler can issue this; it is NOT
   // per-event source-rights certification, prequote freeze or paid delivery.
   disposition="CHALLENGE_OBSERVED_REQUIRES_INDEPENDENT_RIGHTS_AND_FREEZE";
 }else fail("UNEXPECTED_UNPAID_CUSTOMER_HTTP");
 const receipt={
  schema:"geomacro.phase2h.first-query-production-no-funds.v1",
  observed_at:now.toISOString(),canonical_main_sha:expectedSha,
  endpoint:FIRST_QUERY_PATH,canonical_payment_resource:"/api/v1/intelligence/query",
  requested_category:"macro",subject_country_iso3:"USA",
  question_is_hypothesis_not_fabricated_event:true,
  real_customer_style_post_count:1,
  production_http_status:response.status,
  error_code:safeCode(payload?.error?.code)??safeCode(payload?.availability?.code),
  disposition,
  no_payment_signature_sent:true,no_payment_performed:true,
  x402_challenge_header_observed:response.status===402,
  immutable_prequote_readback_verified:false,
  b2_put_or_get_performed:false,canonical_d1_census_verified:false,
  original_article_rights_verified:false,signed_customer_answer_verified:false,
  actual_paid_customer_delivery_verified:false,first_paid_query_qualified:false,
  prices_changed:false,partner_or_historical_modified:false,
 };
 return Object.freeze(receipt);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.env.GITHUB_ACTIONS!=="true"||
     process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main")fail("TRUSTED_MAIN_ONLY");
  const receipt=await probeFirstQuery({expectedSha:process.env.GITHUB_SHA});
  mkdirSync("artifacts/commercial",{recursive:true,mode:0o700});
  writeFileSync(OUTPUT,JSON.stringify(receipt)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
 }catch(error){
  const reason=String(error?.message??"");
  console.error("::error::"+(/^PHASE2H_NO_FUNDS_QUERY_[A-Z_]+$/u.test(reason)
   ?reason:"PHASE2H_NO_FUNDS_QUERY_UNVERIFIED"));
  process.exitCode=3;
 }
}

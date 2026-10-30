#!/usr/bin/env node
/** Independent, actual deployed-Worker P0-B source-first acceptance.
 * Three country/category queries, real authenticated production response,
 * exact deployed main SHA, no synthetic source, no D1/B2 writes or payments.
 * Redacted evidence is retained even when the workflow fails closed.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {createHmac} from "node:crypto";
const CATS=[
 ["geopolitics","Holy See sanctions diplomatic restrictions 2026"],
 ["macro","Holy See inflation employment financial markets 2026"],
 ["rare_earth","Holy See lithium mineral processing permits 2026"]
];
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const FILE="artifacts/derived-news/p0b-source-first-live-acceptance.json";
const verify=async({env=process.env,fetchImpl=fetch,now=new Date()}={})=>{
 const write=o=>{mkdirSync("artifacts/derived-news",{recursive:true});
  writeFileSync(FILE,JSON.stringify(o,null,2)+"\n",{mode:0o600})};
 const result={schema:"geomacro.p0b.production-source-first-acceptance.v1",
  at:now.toISOString(),expected_sha:env.GITHUB_SHA??null,
  deployed_sha:null,source_first_readbacks:[],accepted:false,
  raw_article_redistribution:false,commerce_authorized:false,payments:0};
 try{
  if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_ACTIONS!=="true"||
   !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
   String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32)
   throw Error("PRODUCTION_MAIN_CREDENTIALS_UNAVAILABLE");
  const root=createHmac("sha256",env.GEOMACRO_COMMERCE_LEDGER_TOKEN)
   .update("geomacro-control-plane-v1").digest("hex");
  const get=async(path,authenticated=false)=>{
   const r=await fetchImpl(ORIGIN+path,{method:"GET",redirect:"error",
    headers:authenticated?{Authorization:"Bearer "+root,Accept:"application/json",
     "Cache-Control":"no-store"}:{Accept:"application/json"},
    signal:AbortSignal.timeout(20000)});
   const data=await r.json().catch(()=>null);
   if(r.status!==200||r.redirected||!data||data.ok!==true)
    throw Error("LIVE_WORKER_READBACK_UNAVAILABLE");
   return data;
  };
  const health=await get("/health");
  result.deployed_sha=health.deployed_source_sha??null;
  if(result.deployed_sha!==env.GITHUB_SHA)
   throw Error("DEPLOYED_WORKER_MAIN_SHA_NOT_MATCHED");
  for(const [cat,question] of CATS){
   const q=new URLSearchParams({country_iso3:"VAT",category:cat,question});
   const body=await get("/v1/internal/phase2h-raw-news?"+q,true);
   const firstParty=body.global_first_party_verified_count??0;
   const entries=body.question_matches??[];
   const complete=entries.some(x=>typeof x.five_part?.what_happened?.text==="string"&&
     typeof x.five_part?.why_it_matters?.text==="string"&&
     x.five_part.evidence_and_confidence?.paid_eligible===false);
   const attempted=body.global_search_attempted===true;
   const noLeak=JSON.stringify(entries).search(/"original_title"|"original_url"|"original_content"/u)<0;
   const good=body.requested_category===cat&&
    body.requested_country_iso3==="VAT"&&body.private_research_only===true&&
    body.chargeable===false&&body.paid_eligible===false&&
    body.raw_original_not_delivered===true&&body.global_search_complete===false&&
    Array.isArray(entries)&&noLeak&&
    Number.isInteger(firstParty)&&firstParty>=0&&
    (attempted||complete)&&
    (attempted?body.global_fallback_status!=="NOT_REQUIRED_OR_DISABLED":true)&&
    (attempted?body.global_provider_error_count<2:true);
   result.source_first_readbacks.push({
    category:cat,attempted,grounded_five_part_available:complete,
    verified_first_party_count:firstParty,
    discovery_only_count:body.global_discovery_only_count??0,
    provider_errors:body.global_provider_error_count??null,
    fallback_status:body.global_fallback_status??null,
    source_or_fallback_contract_verified:good});
  }
  result.accepted=result.source_first_readbacks.length===3&&
   result.source_first_readbacks.every(x=>x.source_or_fallback_contract_verified);
 }catch(e){
  result.failure_code=/^[A-Z_]+$/u.test(String(e?.message))?
   e.message:"UNEXPECTED_P0B_PROVIDER_FAILURE";
 }
 write(result);
 if(!result.accepted)throw Error("P0B_LIVE_PRODUCTION_NOT_ACCEPTED");
 return result;
};
export {verify as verifyP0BSourceFirstProduction};
if(process.argv[1]&&import.meta.url.endsWith("/p0b-source-first-production-acceptance.mjs")){
 try{console.log(JSON.stringify(await verify()))}
 catch(e){console.error("::error::"+String(e.message));process.exitCode=3}
}

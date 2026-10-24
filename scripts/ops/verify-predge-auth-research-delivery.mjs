#!/usr/bin/env node
// Protected, fail-closed Predge auth acceptance. Live tests may run seconds
// after wrangler secret put, which creates its own edge deployment revision.
// Retry only bounded propagation races; never claim a grant without live proof.
// No tokens, response bodies, original data, market context or URLs in logs.
import {readPredgeJournal,predgeJournalParity} from './predge-research-journal-parity.mjs';
import {createHmac} from "node:crypto";
const origin=String(process.env.CONTROL_PLANE_URL??"").replace(/\/$/u,"");
const token=process.env.PREDGE_RESEARCH_NEWS_TOKEN;
const base=origin+"/v1/";
const path="partner/predge/derived-structural-72h";
const get=async(p,bearer)=>{
 const res=await fetch(base+p,{method:"GET",redirect:"error",
  cache:"no-store",headers:bearer?{Authorization:"Bearer "+bearer}:{},
  signal:AbortSignal.timeout(15_000)});
 const body=await res.json().catch(()=>null);
 return {status:res.status,body};
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const STATUS=new Set([200,400,401,403,404,429,503]);
const safeHttp=n=>STATUS.has(n)?String(n):"OTHER";
function assertConfigured(origin,root){
 if(!/^https:\/\/[A-Za-z0-9._-]+\.workers\.dev$/.test(origin))
  throw Error("CONFIG_INVALID");
 if(typeof root!=="string"||root.length<32)
  throw Error("ROOT_REQUIRED_TO_VERIFY_REVOCATION");
}
async function verifyOnce(configured,oldBearer){
 const old=await get(path,oldBearer);
 if(!configured){
  const anonymous=await get(path);
  if(old.status===503&&anonymous.status===503&&
     old.body?.error==="PREDGE_RESEARCH_AUTH_UNCONFIGURED"&&
     anonymous.body?.error==="PREDGE_RESEARCH_AUTH_UNCONFIGURED"){
   return {ok:true,disabled:true};
  }
  return {ok:false,reason:"DISABLED_OLD_"+safeHttp(old.status)+
    "_ANON_"+safeHttp(anonymous.status)};
 }
 // Reject an accepted exposed/old bearer immediately, without retrying as if
 // the old credential were safely revoked.
 if(old.status===200)return {ok:false,fatal:true,reason:"EXPOSED_BEARER_STILL_ACCEPTED"};
 if(old.status!==401)return {ok:false,reason:"OLD_BEARER_HTTP_"+safeHttp(old.status)};
 const anonymous=await get(path);
 if(anonymous.status!==401||anonymous.body?.ok!==false)
  return {ok:false,reason:"ANONYMOUS_HTTP_"+safeHttp(anonymous.status)};
 const auth=await get(path,token);
 if(auth.status!==200)return {ok:false,reason:"ROTATED_AUTH_HTTP_"+safeHttp(auth.status)};
 const pub=await get("public/derived-structural-72h");
 if(pub.status!==200)return {ok:false,reason:"PUBLIC_FEED_HTTP_"+safeHttp(pub.status)};
 const a=auth.body,p=pub.body;
 if(a?.ok!==true||
    a?.partner_delivery_schema!=="geomacro.predge.research-news-delivery.v1"||
    a?.per_item_approval_ids_required!==false||
    a?.partner_resale_or_commercial_redistribution_authorized!==false||
    a?.execution_authorized!==false||
    a?.daily_utc_request_hard_cap!==500||
    a?.distributed_rate_governor!=="ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED"||
    a?.chargeable!==false)return {ok:false,reason:"AUTH_CONTRACT_MISMATCH"};
 const journal=await readPredgeJournal(get);
 if(!predgeJournalParity(a,p,journal))
  return {ok:false,reason:"ITEM_PARITY_MISMATCH"};
 return {ok:true,disabled:false,items:a.items.length,counts:a.counts};
}
try{
 const root=String(process.env.ROOT_LEDGER_TOKEN??"");
 assertConfigured(origin,root);
 const previouslyExposed=createHmac("sha256",root)
  .update("geomacro-predge-72h-research-only-v1").digest("hex");
 const configured=/^[a-f0-9]{64}$/.test(token??"");
 if(configured&&token===previouslyExposed)throw Error("EXPOSED_BEARER_REUSED");
 let verdict={ok:false,reason:"NO_ATTEMPTS"};
 // Bounded edge secret propagation delay. Each attempt independently verifies
 // legacy denial + anonymous denial + new token + SAME live public D1 rows.
 for(let attempt=1;attempt<=4;attempt++){
  try{verdict=await verifyOnce(configured,previouslyExposed)}
  catch{verdict={ok:false,reason:"LIVE_REQUEST_UNAVAILABLE"}}
  if(verdict.ok||verdict.fatal)break;
  if(attempt<4)await sleep(5000);
 }
 if(!verdict.ok)
  throw Error("ACCEPTANCE_"+verdict.reason);
 if(verdict.disabled){
  console.log(JSON.stringify({schema:"geomacro.predge-research-revocation-receipt.v1",
   old_token_denied:true,rotated_token_configured:false,
   private_feed_available:false,pilot_resumption_requires_owner_secret:true,
   supabase_writes:0,payments:0}));
 }else{
  console.log(JSON.stringify({schema:"geomacro.predge-auth-live-acceptance.v1",
   authenticated_research_delivery_verified:true,
   anonymous_denied:true,old_emailed_bearer_denied:true,
   same_d1_journal_projection_verified:true,
   required_source_attribution_preserved:true,
   items:verdict.items,counts:verdict.counts,
   individual_item_approval_needed:false,
   commercial_resale_authorized:false,source_licensing_waived:false,
   signed_gro_issued:false,partner_token_shared_with_predge_not_asserted:true,
   d1_atomic_utc_daily_cap:500,fail_closed_on_governor_outage:true,
   payments:0,supabase_writes:0,b2_operations:0}));
 }
}catch(err){
 const code=String(err?.message??"");
 // Static reason codes or allowlisted HTTP status only. No response bodies,
 // bearer strings or upstream error objects ever reach public Actions logs.
 const allowed=/^(?:CONFIG_INVALID|ROOT_REQUIRED_TO_VERIFY_REVOCATION|EXPOSED_BEARER_REUSED|ACCEPTANCE_(?:EXPOSED_BEARER_STILL_ACCEPTED|DISABLED_OLD_(?:200|400|401|403|404|429|503|OTHER)_ANON_(?:200|400|401|403|404|429|503|OTHER)|OLD_BEARER_HTTP_(?:200|400|401|403|404|429|503|OTHER)|ANONYMOUS_HTTP_(?:200|400|401|403|404|429|503|OTHER)|ROTATED_AUTH_HTTP_(?:200|400|401|403|404|429|503|OTHER)|PUBLIC_FEED_HTTP_(?:200|400|401|403|404|429|503|OTHER)|AUTH_CONTRACT_MISMATCH|ITEM_PARITY_MISMATCH|COUNT_PARITY_MISMATCH|LIVE_REQUEST_UNAVAILABLE|NO_ATTEMPTS))$/u;
 console.error("::error::PREDGE_AUTH_RESEARCH_DELIVERY_NOT_VERIFIED_"+(allowed.test(code)?code:"UNCLASSIFIED"));
 process.exitCode=2;
}

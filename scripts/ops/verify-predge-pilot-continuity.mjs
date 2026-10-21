#!/usr/bin/env node
// Read-only, no-funds Predge pilot continuity. One research GET per run.
// Never log secrets, upstream original records, or private URLs.
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const PILOT_END="2027-01-17T00:00:00.000Z";
const PREFIX="PREDGE_CONTINUITY_NOT_VERIFIED";
export function assessPredgeContinuity(research,publicFeed,gate,now=Date.now()){
 if(research?.ok!==true||publicFeed?.ok!==true||
 research.partner_delivery_schema!=="geomacro.predge.research-news-delivery.v1"||
 research.authentication!=="DEDICATED_BEARER_ONLY"||
 research.execution_authorized!==false||
 research.partner_resale_or_commercial_redistribution_authorized!==false||
 research.chargeable!==false||
 research.daily_utc_request_hard_cap!==500||
 research.distributed_rate_governor!=="ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED"||
 research.maximum_pilot_scope_expires_at!==PILOT_END||
 !Array.isArray(research.items)||!Array.isArray(publicFeed.items)||
 research.items.length>600||publicFeed.items.length>600||
 JSON.stringify(research.items)!==JSON.stringify(publicFeed.items)||
 JSON.stringify(research.counts)!==JSON.stringify(publicFeed.counts))
 throw Error(PREFIX+"_RESEARCH_CONTRACT_OR_PARITY");
 if(gate?.authority!=="cloudflare-d1"||
    gate.scope!=="predge-risk-gate-country-v1"||
    gate.execution_authorized!==false||gate.paid_launch_approved!==false||
    !["ready","not_ready"].includes(gate.status))
 throw Error(PREFIX+"_RISK_GATE_BOUNDARY");
 if(!Number.isFinite(now)||Date.parse(PILOT_END)<=now)
 throw Error(PREFIX+"_PILOT_EXPIRED");
 const counts=research.counts;
 if(!counts||Object.keys(counts).sort().join(",")!=="geopolitics,macro,rare_earth"||
   Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0))
 throw Error(PREFIX+"_COUNTS");
 const days=Math.ceil((Date.parse(PILOT_END)-now)/86400000);
 return Object.freeze({
   schema:"geomacro.predge-continuity-receipt.v1",
   authenticated_research_verified:true,shared_d1_items_verified:true,
   category_counts:{geopolitics:counts.geopolitics,macro:counts.macro,rare_earth:counts.rare_earth},
   daily_request_hard_cap:500,
   pilot_end:PILOT_END,days_until_pilot_end:days,
   renewal_action_required:days<=30,
   signed_risk_gate_ready:gate.status==="ready",
   paid_launch_approved:false,research_resale_authorized:false,
   execution_authorized:false,payments:0,supabase_requests:0
 });
}
async function read(path,token){
 const response=await fetch(ORIGIN+path,{method:"GET",redirect:"manual",cache:"no-store",
  headers:token?{authorization:"Bearer "+token}:{},
  signal:AbortSignal.timeout(15000)});
 if(![200,503].includes(response.status))throw Error(PREFIX+"_HTTP_"+response.status);
 const raw=await response.text();
 if(raw.length>250000)throw Error(PREFIX+"_OVERSIZED");
 let body;try{body=JSON.parse(raw)}catch{throw Error(PREFIX+"_INVALID_JSON")}
 return {status:response.status,body};
}
export async function runContinuityCheck(token,now=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(token??""))throw Error(PREFIX+"_OWNER_TOKEN_ABSENT");
 const [research,publicFeed,gate]=await Promise.all([
  read("/v1/partner/predge/derived-structural-72h",token),
  read("/v1/public/derived-structural-72h"),
  read("/v1/public/risk-gate-d1-readiness")
 ]);
 if(research.status!==200||publicFeed.status!==200||
   (gate.status===503&&gate.body?.status!=="not_ready"))
 throw Error(PREFIX+"_RESEARCH_UNAVAILABLE");
 return assessPredgeContinuity(research.body,publicFeed.body,gate.body,now);
}
if(process.argv[1]?.endsWith("verify-predge-pilot-continuity.mjs")){
 runContinuityCheck(process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE)
 .then(v=>{console.log(JSON.stringify(v));if(v.renewal_action_required)
  console.log("::warning::PREDGE_PILOT_RENEWAL_REQUIRED_WITHIN_30_DAYS");})
 .catch(e=>{const s=String(e?.message??"");
 console.error("::error::"+(s.startsWith(PREFIX)?s:PREFIX+"_REQUEST_UNAVAILABLE"));
 process.exitCode=1;});
}

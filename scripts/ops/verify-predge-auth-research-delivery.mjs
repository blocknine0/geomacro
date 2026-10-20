#!/usr/bin/env node
// Genuine post-deploy PRIVATE Predge research auth and SAME D1 identity proof.
// Do not log tokens, raw source content, or per-item partner grants.
import {createHmac} from "node:crypto";
const origin=String(process.env.CONTROL_PLANE_URL??"").replace(/\/$/u,"");
const token=process.env.PREDGE_RESEARCH_NEWS_TOKEN;
const base=origin+"/v1/";
const get=async(path,tokenValue)=>{
 const response=await fetch(base+path,{method:"GET",redirect:"error",
  cache:"no-store",headers:tokenValue?{Authorization:"Bearer "+tokenValue}:{},
  signal:AbortSignal.timeout(15_000)});
 const body=await response.json().catch(()=>null);
 return {status:response.status,body};
};
try{
 if(!/^https:\/\/[A-Za-z0-9._-]+\.workers\.dev$/.test(origin))
   throw Error("CONFIG_INVALID");
 const legacyRoot=String(process.env.ROOT_LEDGER_TOKEN??"");
 if(legacyRoot.length<32)throw Error("ROOT_REQUIRED_TO_VERIFY_REVOCATION");
 const previouslyExposed=createHmac("sha256",legacyRoot)
   .update("geomacro-predge-72h-research-only-v1").digest("hex");
 const legacyAttempt=await get("partner/predge/derived-structural-72h",previouslyExposed);
 const configured=/^[a-f0-9]{64}$/.test(token??"");
 // When no new protected token is supplied, research intentionally shuts down.
 // Both anonymous and the old emailed/HMAC token must receive closed 503.
 if(!configured){
   const anonymous=await get("partner/predge/derived-structural-72h");
   if(anonymous.status!==503||legacyAttempt.status!==503||
       anonymous.body?.error!=="PREDGE_RESEARCH_AUTH_UNCONFIGURED"||
       legacyAttempt.body?.error!=="PREDGE_RESEARCH_AUTH_UNCONFIGURED")
      throw Error("OLD_RESEARCH_TOKEN_NOT_REVOKED");
   console.log(JSON.stringify({schema:"geomacro.predge-research-revocation-receipt.v1",
     old_token_denied:true,rotated_token_configured:false,
     private_feed_available:false,pilot_resumption_requires_owner_secret:true,
     supabase_writes:0,payments:0}));
   process.exit(0);
 }
 if(token===previouslyExposed||legacyAttempt.status!==401)
   throw Error("OLD_RESEARCH_TOKEN_NOT_REVOKED");
 const unauthorized=await get("partner/predge/derived-structural-72h");
 if(unauthorized.status!==401||unauthorized.body?.ok!==false)
   throw Error("ANONYMOUS_NOT_DENIED");
 const auth=await get("partner/predge/derived-structural-72h",token);
 const pub=await get("public/derived-structural-72h");
 if(auth.status!==200||pub.status!==200||auth.body?.ok!==true||
    auth.body?.partner_delivery_schema!=="geomacro.predge.research-news-delivery.v1"||
    auth.body?.per_item_approval_ids_required!==false||
    auth.body?.partner_resale_or_commercial_redistribution_authorized!==false||
    auth.body?.execution_authorized!==false||
    auth.body?.daily_utc_request_hard_cap!==500||
    auth.body?.distributed_rate_governor!=="ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED"||
    auth.body?.chargeable!==false||
    JSON.stringify(auth.body.items)!==JSON.stringify(pub.body.items)||
    JSON.stringify(auth.body.counts)!==JSON.stringify(pub.body.counts))
   throw Error("AUTH_PRIVATE_PUBLIC_D1_PARITY_FAILED");
 console.log(JSON.stringify({schema:"geomacro.predge-auth-live-acceptance.v1",
   authenticated_research_delivery_verified:true,
   anonymous_denied:true,exact_same_public_eligible_items_verified:true,
   items:auth.body.items.length,counts:auth.body.counts,
   individual_item_approval_needed:false,
   commercial_resale_authorized:false,source_licensing_waived:false,
   signed_gro_issued:false,partner_token_shared_with_predge_not_asserted:true,
   d1_atomic_utc_daily_cap:500,fail_closed_on_governor_outage:true,
   payments:0,supabase_writes:0,b2_operations:0}));
}catch{
 console.error("::error::PREDGE_AUTH_RESEARCH_DELIVERY_NOT_VERIFIED");
 process.exitCode=2;
}

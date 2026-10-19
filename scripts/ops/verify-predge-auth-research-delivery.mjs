#!/usr/bin/env node
// Genuine post-deploy PRIVATE Predge research auth and SAME D1 identity proof.
// Do not log tokens, raw source content, or per-item partner grants.
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
 if(!/^https:\/\/[A-Za-z0-9._-]+\.workers\.dev$/.test(origin)||
    !/^[a-f0-9]{64}$/.test(token??""))throw Error("CONFIG_INVALID");
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
   payments:0,supabase_writes:0,b2_operations:0}));
}catch{
 console.error("::error::PREDGE_AUTH_RESEARCH_DELIVERY_NOT_VERIFIED");
 process.exitCode=2;
}

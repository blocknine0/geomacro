#!/usr/bin/env node
/** Manual outside-in no-funds acceptance; no persistence or provider article logs. */
const host="https://geomacro.live/api/v1/intelligence/live-structured";
const requests=[
 {category:"geopolitics"},{category:"macro-fx"},{category:"critical-minerals"},
 {question:"What is the latest annual GDP growth for India?"},
 {question:"What is the latest EUR USD exchange rate?"},
];
const assert=(test,code)=>{if(!test)throw Error(code);};
// Independent product-scoped health must not spoof the older signed B2/D1
// health response or accept a 200 based on source-retrieval time alone.
const health=await fetch("https://geomacro.live/api/health?deep=1&profile=live-structured",{
  method:"GET",redirect:"manual",signal:AbortSignal.timeout(20000),
  headers:{Accept:"application/json"},
});
assert((health.headers.get("content-type")??"").includes("application/json"),
 "LIVE_STRUCTURED_DEEP_HEALTH_NONJSON");
const healthBody=await health.json();
assert(healthBody.schema==="geomacro.product-scoped-deep-health.v1",
 "LIVE_STRUCTURED_DEEP_HEALTH_SCHEMA");
assert(healthBody.x402_payment_authorized===false&&
 healthBody.fresh_signed_snapshot_readiness_attested===false&&
 healthBody.legacy_signed_intelligence_gri_risk_indices==="NOT_EVALUATED_IN_THIS_PROFILE"&&
 healthBody.new_intelligence_durable_storage_required===false,
 "LIVE_STRUCTURED_DEEP_HEALTH_FALSE_SIGNED_OR_PAYMENT_PROMOTION");
const healthStatuses=Object.fromEntries(["geopolitics","macro-fx","critical-minerals"]
  .map(category=>[category,healthBody.categories?.[category]?.source_fetch_accepted===true]));
console.log(JSON.stringify({check:"product_scoped_deep_health",
 http_status:health.status,category_accepted:healthStatuses,
 ready:health.status===200&&healthBody.ok===true,
 signed_legacy_products_claimed:false,payment_attempted:false}));
const healthReady=health.status===200&&healthBody.ok===true&&
 Object.values(healthStatuses).every(Boolean);
// An unavailable category must fail acceptance without hiding the other
// categories and numeric routes behind an early exit. Contract/privacy
// violations still abort immediately through the assertions above/below.
if(!healthReady)process.exitCode=2;
const safe=(s)=>String(s??"").replace(/[^A-Z0-9_-]/giu,"").slice(0,90);
const discovery=await fetch(host,{method:"GET",signal:AbortSignal.timeout(12000),redirect:"manual",
 headers:{Accept:"application/json"}});
assert(discovery.status===200,"LIVE_STRUCTURED_DISCOVERY_HTTP");
assert((discovery.headers.get("content-type")??"").includes("application/json"),"LIVE_STRUCTURED_DISCOVERY_NONJSON");
const d=await discovery.json();
assert(d.schema==="geomacro.live-structured-discovery.v1","LIVE_STRUCTURED_DISCOVERY_SCHEMA");
assert(d.x402_enabled===false&&d.durable_storage_required===false,"LIVE_STRUCTURED_DISCOVERY_BOUNDARY");
let passed=0;
for(const [i,input] of requests.entries()){
 const res=await fetch(host,{method:"POST",redirect:"manual",
   headers:{"Content-Type":"application/json",Accept:"application/json"},
   body:JSON.stringify(input),signal:AbortSignal.timeout(18000)});
 assert((res.headers.get("content-type")??"").includes("application/json"),"LIVE_STRUCTURED_NONJSON_"+i);
 const json=await res.json();
 assert(json.schema==="geomacro.live-structured.v1","LIVE_STRUCTURED_SCHEMA_"+i);
 assert(json.chargeable===false&&json.payment_required===false&&json.durable_storage_written===false,
  "LIVE_STRUCTURED_PAYMENT_OR_STORAGE_"+i);
 assert(json.signature===null&&json.score===null,"LIVE_STRUCTURED_SIGNING_OR_SCORE_"+i);
 assert(!/https?:\/\/|<script|PAYMENT-SIGNATURE|private_key|article_url|source_url/iu.test(JSON.stringify(json)),
  "LIVE_STRUCTURED_PRIVATE_SOURCE_LEAK_"+i);
 const valid=res.status===200&&json.status==="LIVE_SOURCE_FETCHED"&&
  Array.isArray(json.observations)&&json.observations.length>0;
 console.log(JSON.stringify({
   check:i+1,domain:"category" in input?input.category:"numeric",http_status:res.status,
   pass:valid,observation_count:Array.isArray(json.observations)?json.observations.length:0,
   status:safe(json.status),reason:safe(json.reason),
 }));
 if(valid)passed++;else process.exitCode=2;
}
console.log(JSON.stringify({schema:"geomacro.stateless-live-no-funds-acceptance.v1",
 checked:requests.length,passed,product_scoped_health_ready:healthReady,
 accepted:healthReady&&passed===requests.length,
 payment_attempts:0,new_durable_intelligence_storage:0}));

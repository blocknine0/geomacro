#!/usr/bin/env node
/** Manual outside-in no-funds acceptance; no persistence or provider article logs. */
const host="https://geomacro.live/api/v1/intelligence/live-structured";
const requests=[
 {category:"geopolitics"},{category:"macro-fx"},{category:"critical-minerals"},
 {question:"What is the latest annual GDP growth for India?"},
 {question:"What is the latest EUR USD exchange rate?"},
];
const assert=(test,code)=>{if(!test)throw Error(code);};
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
 checked:requests.length,passed,accepted:passed===requests.length,
 payment_attempts:0,new_durable_intelligence_storage:0}));

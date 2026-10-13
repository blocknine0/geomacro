#!/usr/bin/env node
/**
 * Real hosted runtime smoke, NEVER a production mutation or payment.
 * Fixed host, four GETs, three no-payment category research requests only
 * after the public deployment marker proves Phase 1 is actually published.
 * Respect the existing 2-request/minute free discovery cap.
 */
const ORIGIN="https://geomacro.live";
const EXPECTED="295c483d45536a57fbea255f6a98dae68834d5d8";
const out={schema:"geomacro.phase2-production-readonly.v1",
  checked_at:new Date().toISOString(),expected_merge_sha:EXPECTED,
  deployed_sha:null,marker_verified:false,
  responses:[],no_money:true};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const request=async(path,method="GET",body)=>{
  const u=new URL(path,ORIGIN);
  if(u.origin!==ORIGIN)throw Error("PRODUCTION_ORIGIN_INVALID");
  const response=await fetch(u,{
    method,redirect:"error",
    headers:{accept:"application/json","cache-control":"no-cache",
      ...(body?{"content-type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(method==="GET"?18_000:75_000),
  });
  const type=response.headers.get("content-type")??"";
  const text=await response.text();
  if(text.length>128_000)throw Error("PRODUCTION_BODY_OVERSIZED");
  let j={};
  if(type.includes("json")){try{j=JSON.parse(text)}catch{j={}}}
  const data={
    path:u.pathname+u.search,method,http_status:response.status,
    json_content_type:type.includes("json"),
    schema_version:typeof j.schema_version==="string"?j.schema_version:
      typeof j.schema==="string"?j.schema:null,
    error_code:typeof j.error==="string"?j.error:
      typeof j.error?.code==="string"?j.error.code:null,
    chargeable:j.chargeable??null,payment_required_now:j.payment_required_now??null,
    signed_gro_generated:j.signed_gro_generated??null,
    execution_authorized:j.execution_authorized??null,
    evidence_qualification_status:
      j.on_demand?.evidence_qualification?.status??null,
  };
  out.responses.push(data);
  return {response,j,data};
};
try {
  // Capture actual externally observed routes regardless of deploy state.
  for(const path of [
    "/api/v1/intelligence/query",
    "/api/v1/intelligence/geopolitics?view=latest",
    "/api/v1/intelligence/macro-fx?view=latest",
    "/api/v1/intelligence/critical-minerals?view=latest",
  ]) {
    try{await request(path)}catch(error){
      out.responses.push({path,method:"GET",error:"NETWORK_OR_MIME_UNAVAILABLE"});
    }
  }
  const {response,j}=await request("/.well-known/geomacro-build.json");
  out.deployed_sha=typeof j.canonical_main_sha==="string"?j.canonical_main_sha:null;
  out.marker_verified=response.ok &&
    j.schema_version==="geomacro.deployment-build.v1" &&
    j.canonical_repository==="blocknine0/geomacro" &&
    /^[a-f0-9]{40}$/.test(out.deployed_sha??"") &&
    out.deployed_sha===EXPECTED &&
    j.production_activation_performed===false;
  if(out.marker_verified){
    const scenarios=[
      {path:"/api/v1/intelligence/geopolitics",country:"RUS",
       topics:["conflict_geopolitics"],question:"Russia conflict in the last 31 days"},
      {path:"/api/v1/intelligence/macro-fx",country:"CHN",
       topics:["macro_risk","fx_external_risk"],
       question:"China macro and FX in the last 7 days"},
      {path:"/api/v1/intelligence/critical-minerals",country:"GBR",
       topics:["critical_minerals"],question:"UK lithium in the last 31 days"},
    ];
    for(let i=0;i<scenarios.length;i++){
      if(i>0)await delay(65_000);
      const s=scenarios[i];
      try{await request(s.path,"POST",{
        question:s.question,topics:s.topics,
        subjects:[{type:"country",country_iso3:s.country}],
        fulfillment_mode:"live_on_demand",
      })}catch{out.responses.push({path:s.path,method:"POST",
        error:"NETWORK_OR_TIMEOUT",chargeable:false});}
    }
  }
}catch{out.error="BUILD_MARKER_UNAVAILABLE_OR_INVALID"}
console.log(JSON.stringify(out));
if(!out.marker_verified ||
  out.responses.some(x=>x.method==="GET" && x.path.includes("intelligence") &&
    (!Number.isInteger(x.http_status)||x.http_status>=500)) ||
  out.responses.some(x=>x.method==="POST" &&
    (x.http_status===402 || x.payment_required_now===true ||
     x.execution_authorized===true)))process.exitCode=4;

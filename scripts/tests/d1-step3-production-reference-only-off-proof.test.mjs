import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyProductionRefOnlySettings,verifyProductionRefOnlyOff}
 from "../lib/d1-step3-production-reference-only-off-proof.mjs";
const ACCOUNT="a".repeat(32),TOKEN="b".repeat(40);
const VERSION="11111111-1111-4111-8111-111111111111";
const live=[{name:"DB",type:"d1",database_id:"db057ca9-9f6e-4957-ac28-144f3b798f9b"},
 {name:"CONTROL_PLANE_TOKEN",type:"secret_text"},
 {name:"GEOMACRO_PHASE2H_REF_ONLY_V1",type:"plain_text",text:"0"},
 {name:"GEOMACRO_PHASE2H_REF_ONLY_READERS_V1",type:"plain_text",text:"0"}];
const versions=[{version_id:VERSION,percentage:100}];
test("real Cloudflare settings and one 100%-deployed version prove reference lane OFF only",()=>{
 const x=classifyProductionRefOnlySettings({bindings:live,deployedVersions:versions});
 assert.equal(x.status,"PASS_REAL_PROVIDER_PRODUCTION_REFERENCE_ONLY_SWITCHES_OFF");
 assert.equal(x.writer_enabled,false);
 assert.equal(x.reader_enabled,false);
 assert.equal(x.production_hmac_deployed,false);
 assert.equal(x.real_production_pointer_hmac_verified,false);
 assert.equal(x.remote_writes,0);
 assert.equal(x.production_cutover_authorized,false);
});
test("absent writer/reader flags are allowed as disabled but never infer HMAC custody",()=>{
 const x=classifyProductionRefOnlySettings({
  bindings:live.filter(b=>!b.name.startsWith("GEOMACRO_PHASE2H_")),
  deployedVersions:versions});
 assert.equal(x.writer_enabled,false);
 assert.equal(x.real_production_pointer_hmac_verified,false);
});
test("enabled, malformed, duplicate, secret-present or partial canary deployment fail closed",()=>{
 const cases=[
  {bindings:live.map(x=>x.name==="GEOMACRO_PHASE2H_REF_ONLY_V1"?{...x,text:"1"}:x)},
  {bindings:live.map(x=>x.name==="GEOMACRO_PHASE2H_REF_ONLY_READERS_V1"?{...x,text:"1"}:x)},
  {bindings:live.map(x=>x.name==="GEOMACRO_PHASE2H_REF_ONLY_V1"?{...x,text:"true"}:x)},
  {bindings:[...live,{name:"PHASE2H_R2_REFERENCE_HMAC_KEY",type:"secret_text"}]},
  {bindings:[...live,live[0]]},
  {bindings:live,deployedVersions:[{...versions[0],percentage:50}]},
  {bindings:live,deployedVersions:[versions[0],versions[0]]},
  {bindings:[]},
 ];
 for(const c of cases)
  assert.throws(()=>classifyProductionRefOnlySettings({
   bindings:c.bindings??live,deployedVersions:c.deployedVersions??versions
  }),/STEP3_PRODUCTION_REF_OFF_/u);
});
test("real provider read-only GET verifies settings and live version before accepting no-HMAC mode",async()=>{
 const seen=[];
 const got=await verifyProductionRefOnlyOff({
  env:{CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:TOKEN},
  fetchImpl:async(url,init)=>{
   seen.push({url,method:init.method,authorization:init.headers.Authorization});
   return {status:200,redirected:false,json:async()=>({
    success:true,result:url.endsWith("/settings")?
     {bindings:live}:{deployments:[{
       created_on:"2026-11-10T08:00:00Z",versions
      }]}
   })};
  }
 });
 assert.equal(got.status,"PASS_REAL_PROVIDER_PRODUCTION_REFERENCE_ONLY_SWITCHES_OFF");
 assert.equal(seen.length,2);
 assert(seen.every(x=>x.method==="GET"));
 assert(seen.every(x=>x.authorization==="Bearer "+TOKEN));
 assert.equal(JSON.stringify(got).includes(TOKEN),false);
});
test("provider unavailable, deployed HMAC or unverified JSON must not PASS",async()=>{
 for(const status of [401,403,404,503]){
  await assert.rejects(verifyProductionRefOnlyOff({
   env:{CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:TOKEN},
   fetchImpl:async()=>({status,redirected:false})
  }),/STEP3_PRODUCTION_REF_OFF_/);
 }
 await assert.rejects(verifyProductionRefOnlyOff({
  env:{CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:TOKEN},
  fetchImpl:async()=>({status:200,redirected:false,
   json:async()=>({success:false,result:{bindings:live}})})
 }),/STEP3_PRODUCTION_REF_OFF_/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {canonicalConfig,prepareShadowCanonical,assertScope} from
 "../ops/prepare-step3-shadow-canonical-candidate.mjs";

const SHA="b".repeat(40);
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const MODERN="geomacro-step3-shadow",LEGACY="geomacro-step3-shadow-legacy";
const OLD="48680b70-c41c-4af9-9e70-497213471dbb";
const NEW="01459fa0-4ab0-414c-a99a-83b936b45acd";
const baseEnv=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:SHA,SHADOW_CANONICAL_APPROVAL:
  "STAGE_TWO_ISOLATED_SHADOW_CANONICAL_VERSIONS_NO_TRAFFIC",
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"r".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED:"YES",
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:MODERN+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:LEGACY+".daspallab202391.workers.dev"
});
function bindings(name,{wrongDb=false,missingBearer=false}={}){
 return [
  {name:"DB",type:"d1",database_id:wrongDb?PROD:SHADOW},
  ...(!missingBearer?[{name:"CONTROL_PLANE_TOKEN",type:"secret_text"}]:[]),
  ...(name===MODERN?[{name:"PHASE2H_PRIVATE_R2",type:"r2_bucket",
   bucket_name:"geomacro-step3-shadow-private"}]:[]),
  {name:"PHASE2H_R2_REFERENCE_HMAC_KEY",type:"secret_text"}
 ];
}
function mock({wrongDb=false,missingBearer=false,failLegacyUpload=false}={}){
 const uploaded=new Set(),calls=[],configs=[];
 const runtime={compatibility_date:"2026-10-03",compatibility_flags:["nodejs_compat"]};
 const api=async (url,opts)=>{
  const u=new URL(url),p=u.pathname;
  calls.push({method:opts.method,pathname:p});
  assert.equal(opts.method,"GET","Provider may only be read through GET");
  assert(!opts.body);
  assert.equal(u.hostname,"api.cloudflare.com");
  const name=[MODERN,LEGACY].find(x=>p.includes("/workers/scripts/"+x+"/"));
  assert(name,"only isolated Shadow scripts");
  const base=bindings(name,{wrongDb,missingBearer});
  const result=(id)=>({id,resources:{
   bindings:id===OLD?base:[...base,{name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:SHA}],
   script_runtime:runtime,script:{handlers:["fetch"]}
  }});
  if(p.endsWith("/deployments"))return Response.json({success:true,
   result:{deployments:[{versions:[{version_id:OLD,percentage:100}]}]}});
  if(p.endsWith("/settings"))return Response.json({success:true,result:{bindings:base}});
  if(p.endsWith("/versions/"+OLD))return Response.json({success:true,result:result(OLD)});
  if(p.endsWith("/versions/"+NEW))return Response.json({success:true,result:result(NEW)});
  if(p.endsWith("/versions"))return Response.json({success:true,
   result:{items:uploaded.has(name)?[{id:NEW}]:[]}});
  throw Error("Unexpected provider path "+p);
 };
 const run=(cmd,args)=>{
  assert.equal(cmd,"npx");
  assert.deepEqual(args.slice(0,4),["-y","wrangler@4.136.3","versions","upload"]);
  assert(args.includes("--message"));
  const filename=args[args.indexOf("--config")+1];
  const config=JSON.parse(readFileSync(filename,"utf8"));
  configs.push(config);
  assert([MODERN,LEGACY].includes(config.name));
  assert.equal(config.main,"src/index.mjs");
  assert(!("assets" in config));
  assert.equal(config.d1_databases,undefined);
  assert.equal(config.vars.GEOMACRO_SOURCE_SHA,SHA);
  assert(config.unsafe.bindings.some(b=>b.name==="CONTROL_PLANE_TOKEN"&&b.type==="inherit"));
  assert(config.unsafe.bindings.some(b=>b.name==="DB"&&b.type==="inherit"));
  if(config.name===LEGACY&&failLegacyUpload)throw Error("safe masked upload error");
  uploaded.add(config.name);
 };
 return {api,run,uploaded,calls,configs};
}
test("scope requires exact account, main, two known Shadow identities and existing HOLD",()=>{
 assert.equal(assertScope(baseEnv(),true),true);
 assert.throws(()=>assertScope(baseEnv(),false),/SCOPE_INVALID/);
 assert.throws(()=>assertScope({...baseEnv(),D1_DATABASE_ID:SHADOW},true),/SCOPE_INVALID/);
 assert.throws(()=>assertScope({...baseEnv(),SHADOW_CANONICAL_APPROVAL:"BYPASS"},true),/SCOPE_INVALID/);
 assert.throws(()=>assertScope({...baseEnv(),GITHUB_REF:"refs/heads/feature"},true),/SCOPE_INVALID/);
});
test("config inherits ALL old scoped bindings, retains runtime and canonical module",()=>{
 const w={name:MODERN,r2:true};
 const b=bindings(MODERN);
 const c=canonicalConfig(w,{resources:{bindings:b,
  script_runtime:{compatibility_date:"2026-10-03",compatibility_flags:["nodejs_compat"]}}},SHA);
 assert.equal(c.main,"src/index.mjs");
 assert.equal(c.workers_dev,undefined,"Candidate upload cannot change routing");
 assert.equal(c.preview_urls,undefined,"Candidate upload cannot change preview URLs");
 assert.equal(c.name,MODERN);
 assert.equal(c.unsafe.bindings.length,b.length);
 assert(!JSON.stringify(c).includes(SHADOW));
 assert.equal(c.vars.GEOMACRO_SOURCE_SHA,SHA);
 assert.deepEqual(c.compatibility_flags,["nodejs_compat"]);
});
test("reject a production-bound Shadow version before writing any candidate",async()=>{
 const f=mock({wrongDb:true});
 const r=await prepareShadowCanonical({env:baseEnv(),fetchImpl:f.api,run:f.run,
  holdPresent:true,headCheck:()=>SHA});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/PRODUCTION_D1_LEAK/);
 assert.equal(f.configs.length,0);
});
test("reject absent Shadow admin secret before upload, never substitute prod",async()=>{
 const f=mock({missingBearer:true});
 const r=await prepareShadowCanonical({env:baseEnv(),fetchImpl:f.api,run:f.run,
  holdPresent:true,headCheck:()=>SHA});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/BEARER_SECRET_NOT_INHERITABLE/);
 assert.equal(f.configs.length,0);
});
test("two Shadow immutable canonical candidates can be uploaded with NO traffic and exact parity",async()=>{
 const f=mock();
 const r=await prepareShadowCanonical({env:baseEnv(),fetchImpl:f.api,run:f.run,
  holdPresent:true,headCheck:()=>SHA});
 assert.equal(r.status,"PASS_CANDIDATES_UPLOADED_ZERO_TRAFFIC");
 assert.equal(r.workers.length,2);
 assert.equal(f.configs.length,2);
 assert.equal(r.shadow_versions_uploaded,2);
 assert.equal(r.production_worker_changed,false);
 assert.equal(r.production_d1_mutated,false);
 assert.equal(r.traffic_promoted,false);
 assert.equal(r.canary_hold_removed,false);
 assert.equal(r.payments_authorized,false);
 assert(f.calls.every(x=>x.method==="GET"));
 assert(!f.calls.some(x=>x.pathname.includes("/query")));
});
test("second upload fails closed without disguising first unpromoted version as full PASS",async()=>{
 const f=mock({failLegacyUpload:true});
 const r=await prepareShadowCanonical({env:baseEnv(),fetchImpl:f.api,run:f.run,
  holdPresent:true,headCheck:()=>SHA});
 assert.equal(r.status,"HOLD");
 assert.equal(r.workers.length,1);
 assert.equal(r.shadow_versions_uploaded,1);
 assert.equal(r.traffic_promoted,false);
 assert(r.code.includes("CANDIDATE_UPLOAD_FAILED"));
});
test("workflow allows manually approved exact main shadow-only upload but no auto promotion",()=>{
 const w=readFileSync(".github/workflows/step3-shadow-canonical-candidate-upload.yml","utf8");
 assert.match(w,/workflow_dispatch:/);
 assert.match(w,/STAGE_TWO_ISOLATED_SHADOW_CANONICAL_VERSIONS_NO_TRAFFIC/);
 assert.match(w,/environment: production/);
 assert.match(w,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(w,/git ls-remote/);
 assert.doesNotMatch(w,/continue-on-error: true|wrangler deploy|versions deploy|migrations apply/);
});

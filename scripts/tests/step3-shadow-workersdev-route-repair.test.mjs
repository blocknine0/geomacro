import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertScope,readShadowProbe,repairShadowRoutes} from "../ops/repair-step3-shadow-workersdev-route.mjs";

const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const SCRIPTS=["geomacro-step3-shadow","geomacro-step3-shadow-legacy"];
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"b".repeat(40),
 SHADOW_ROUTE_APPROVAL:"ENABLE_ISOLATED_SHADOW_WORKERS_DEV_ONLY",
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"x".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED:"YES",
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:SCRIPTS[0]+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:SCRIPTS[1]+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private"
});
test("exact isolated owner-controlled routing only; HOLD required",()=>{
 assert.equal(assertScope(env(),true),true);
 assert.throws(()=>assertScope({...env(),D1_DATABASE_ID:SHADOW},true),/OWNER_APPROVAL_OR_EXACT_ISOLATION_MISSING/);
 assert.throws(()=>assertScope({...env(),SHADOW_ROUTE_APPROVAL:"BYPASS"},true),/OWNER_APPROVAL_OR_EXACT_ISOLATION_MISSING/);
 assert.throws(()=>assertScope(env(),false),/OWNER_APPROVAL_OR_EXACT_ISOLATION_MISSING/);
});
test("unauthenticated Worker routing probe MUST return JSON 401 from canonical guard",async()=>{
 const host=env().GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST;
 assert.equal(await readShadowProbe(host,{fetchImpl:async()=>Response.json(
  {ok:false,error:"UNAUTHORIZED"},{status:401})}),true);
 await assert.rejects(
  ()=>readShadowProbe(host,{fetchImpl:async()=>new Response("not found",{
   status:404,headers:{"Content-Type":"text/html"}})}),
  /STEP3_SHADOW_ROUTE_SHADOW_PROBE_HTTP_404_NON_JSON/);
 await assert.rejects(
  ()=>readShadowProbe(host,{fetchImpl:async()=>Response.json(
   {ok:false,error:"CONTROL_PLANE_AUTH_UNCONFIGURED"},{status:503})}),
  /STEP3_SHADOW_ROUTE_SHADOW_ADMIN_AUTH_BOUNDARY_UNVERIFIED_HTTP_503/);
});
function mock({activeInitially=false,brokenHost=false,missingSecret=false}={}){
 const active=new Map(SCRIPTS.map(w=>[w,activeInitially]));
 const mutations=[],calls=[];
 const fetchImpl=async(url,init)=>{
  const u=new URL(url),p=u.pathname;calls.push([p,init.method]);
  if(u.hostname==="api.cloudflare.com"){
   if(p==="/client/v4/accounts/fddd57d28199bad07a768445e7237693/workers/subdomain")
    return Response.json({success:true,result:{subdomain:"daspallab202391"}});
   if(p.includes("/d1/database/")){
    const id=p.split("/").at(-1);
    return Response.json({success:true,result:{
     uuid:id,name:id===PROD?"geomacro-control-plane":"geomacro-d1-publisher-shadow"
    }});
   }
   const script=SCRIPTS.find(w=>p.includes("/workers/scripts/"+w+"/"));
   assert(script,"Unexpected provider path: "+p);
   if(p.endsWith("/settings")){
    const bindings=[{type:"d1",name:"DB",database_id:SHADOW}];
    if(!missingSecret)bindings.push({name:"CONTROL_PLANE_TOKEN",type:"secret_text"});
    if(script===SCRIPTS[0])bindings.push({type:"r2_bucket",
      name:"PHASE2H_PRIVATE_R2",bucket_name:"geomacro-step3-shadow-private"});
    return Response.json({success:true,result:{bindings}});
   }
   if(p.endsWith("/deployments"))return Response.json({success:true,
    result:{deployments:[{versions:[
      {version_id:"f37d1f52-ff5b-4f6f-9322-cc3cf0c8dfd8",percentage:100}
    ]}]}});
   if(p.endsWith("/subdomain")){
    if(init.method==="POST"){
      const body=JSON.parse(init.body);
      assert.deepEqual(body,{enabled:true,previews_enabled:false});
      mutations.push(script);active.set(script,true);
    }
    return Response.json({success:true,result:{
      enabled:active.get(script),previews_enabled:false
    }});
   }
   throw Error("Unexpected provider path "+p);
  }
  const script=SCRIPTS.find(w=>u.hostname===w+".daspallab202391.workers.dev");
  assert(script);
  assert.equal(u.pathname,"/v1/internal/p0b/status");
  assert.equal(init.headers.Authorization,undefined);
  if(!active.get(script)||brokenHost)return new Response("<h1>404</h1>",{
    status:404,headers:{"content-type":"text/html"}});
  return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
 };
 return {fetchImpl,mutations,calls};
}
test("real Cloudflare route GET, isolated POST only when disabled, readback and Worker auth",async()=>{
 const f=mock();
 const r=await repairShadowRoutes({env:env(),fetchImpl:f.fetchImpl,hold:true});
 assert.equal(r.status,"PASS");
 assert.equal(r.workers.length,2);
 assert.deepEqual(f.mutations,SCRIPTS);
 assert.equal(r.canary_hold_removed,false);
 assert.equal(r.production_d1_mutated,false);
 assert.equal(r.production_worker_changed,false);
 assert.equal(r.payments_authorized,false);
 assert(!f.calls.some(([p])=>p.includes("/workers/scripts/geomacro-control-plane/")));
 assert(!f.calls.some(([p])=>p.endsWith("/d1/database/"+PROD+"/query")));
 const rerun=await repairShadowRoutes({env:env(),fetchImpl:f.fetchImpl,hold:true});
 assert.equal(rerun.status,"PASS");
 assert.equal(f.mutations.length,2,"Idempotent already-enabled routes never re-POST");
});
test("does not POST any route without strict Shadow admin secret binding",async()=>{
 const f=mock({missingSecret:true});
 const r=await repairShadowRoutes({env:env(),fetchImpl:f.fetchImpl,hold:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/SHADOW_BINDING_OR_ADMIN_SECRET_MISSING/);
 assert.equal(f.mutations.length,0);
});
test("an enabled Worker returning non-JSON 404 remains HOLD, not a false PASS",async()=>{
 const f=mock({activeInitially:true,brokenHost:true});
 const r=await repairShadowRoutes({env:env(),fetchImpl:f.fetchImpl,hold:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/SHADOW_PROBE_HTTP_404_NON_JSON/);
 assert.equal(f.mutations.length,0);
});
test("workflow keeps manually authorized exact-main protected boundary",()=>{
 const y=readFileSync(".github/workflows/step3-shadow-workersdev-route-repair.yml","utf8");
 assert.match(y,/workflow_dispatch:/);
 assert.match(y,/ENABLE_ISOLATED_SHADOW_WORKERS_DEV_ONLY/);
 assert.match(y,/environment: production/);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(y,/git ls-remote/);
 assert.doesNotMatch(y,/schedule:|continue-on-error: true|wrangler deploy|secrets\.CONTROL_PLANE_TOKEN|--apply/);
});

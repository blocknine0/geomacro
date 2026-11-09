import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  assertShadowSyncScope,classifyAuthProbe,syncShadowBearer
} from "../ops/sync-step3-shadow-bearer.mjs";

const TOKEN="a".repeat(64);
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const WORKERS=["geomacro-step3-shadow","geomacro-step3-shadow-legacy"];
const hosts=WORKERS.map(w=>w+".daspallab202391.workers.dev");
const env=()=>({
  GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
  GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
  GITHUB_SHA:"d".repeat(40),
  SHADOW_SYNC_APPROVAL:"SYNC_SHADOW_BEARERS_ONLY",
  GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED:"YES",
  CLOUDFLARE_ACCOUNT_ID:"1".repeat(32),
  CLOUDFLARE_API_TOKEN:"x".repeat(40),
  D1_DATABASE_ID:PROD,
  GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
  GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:hosts[0],
  GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:hosts[1],
  GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
  GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:TOKEN
});
test("shadow-only manual scope prohibits production/SHADOW DB collision or skipped HOLD",()=>{
  assert.equal(assertShadowSyncScope(env(),true),true);
  assert.throws(()=>assertShadowSyncScope({...env(),D1_DATABASE_ID:SHADOW},true),
    /EXACT_MAIN_ISOLATED_SCOPE_UNVERIFIED/);
  assert.throws(()=>assertShadowSyncScope({...env(),SHADOW_SYNC_APPROVAL:"BYPASS"},true),
    /EXACT_MAIN_ISOLATED_SCOPE_UNVERIFIED/);
  assert.throws(()=>assertShadowSyncScope(env(),false),
    /EXACT_MAIN_ISOLATED_SCOPE_UNVERIFIED/);
});
test("auth query must pass real admin guard before returning deterministic 400",async()=>{
  const ok=await classifyAuthProbe({host:hosts[0],token:TOKEN,
    fetchImpl:async()=>Response.json({ok:false,error:"P0B_STATUS_QUERY_INVALID"},{status:400})});
  const mismatch=await classifyAuthProbe({host:hosts[0],token:TOKEN,
    fetchImpl:async()=>Response.json({ok:false,error:"UNAUTHORIZED"},{status:401})});
  assert.equal(ok,"AUTHENTICATED");
  assert.equal(mismatch,"MISMATCH");
  await assert.rejects(
    ()=>classifyAuthProbe({host:hosts[0],token:TOKEN,
      fetchImpl:async()=>Response.json({ok:false,error:"D1_BINDING_MISSING"},{status:503})}),
    /SHADOW_AUTH_PROBE_UNEXPECTED_HTTP_503/);
});
test("non-JSON Cloudflare responses disclose only safe HTTP classification and do not authorize mutation",async()=>{
  for(const [status,headers,expected] of [
    [403,{"Content-Type":"text/html","cf-mitigated":"challenge"},"SHADOW_AUTH_PROBE_HTTP_403_CF_CHALLENGE"],
    [403,{"Content-Type":"text/html"},"SHADOW_AUTH_PROBE_HTTP_403_NON_JSON"],
    [503,{"Content-Type":"text/plain"},"SHADOW_AUTH_PROBE_HTTP_503_NON_JSON"],
  ]){
    await assert.rejects(
      ()=>classifyAuthProbe({host:hosts[0],token:TOKEN,
        fetchImpl:async()=>new Response("<html>private-details</html>",{status,headers})}),
      error=>error.message==="STEP3_BEARER_"+expected&&
        !error.message.includes("private-details")
    );
  }
  await assert.rejects(
    ()=>classifyAuthProbe({host:hosts[0],token:TOKEN,
      fetchImpl:async()=>new Response("invalid",{
        status:401,headers:{"content-type":"application/json"}
      })}),
    /STEP3_BEARER_SHADOW_AUTH_PROBE_HTTP_401_INVALID_JSON/
  );
});
test("only mismatched isolated Shadow credentials are synced, then proven live",async()=>{
  const updated=[],called=[],active=new Set([WORKERS[1]]);
  const fake=async(url,init)=>{
    const u=new URL(url),path=u.pathname;called.push({path,method:init.method});
    if(u.hostname==="api.cloudflare.com"){
      if(path.includes("/d1/database/")){
        const id=path.split("/").at(-1);
        return Response.json({success:true,result:{uuid:id,
          name:id===PROD?"geomacro-control-plane":"geomacro-d1-publisher-shadow"}});
      }
      const w=WORKERS.find(v=>path.includes("/workers/scripts/"+v+"/"));
      assert(w);
      if(path.endsWith("/settings")){
        const bindings=[{type:"d1",name:"DB",database_id:SHADOW}];
        if(w===WORKERS[0])bindings.push({type:"r2_bucket",
          name:"PHASE2H_PRIVATE_R2",bucket_name:"geomacro-step3-shadow-private"});
        return Response.json({success:true,result:{bindings}});
      }
      if(path.endsWith("/deployments"))
        return Response.json({success:true,result:{deployments:[{
          versions:[{version_id:"f37d1f52-ff5b-4f6f-9322-cc3cf0c8dfd8",percentage:100}]
        }]}});
      if(path.endsWith("/secrets")&&init.method==="PUT"){
        assert.equal(w,WORKERS[0]);
        const body=JSON.parse(init.body);
        assert.equal(body.name,"CONTROL_PLANE_TOKEN");
        assert.equal(body.text,TOKEN);
        updated.push(w);active.add(w);
        return Response.json({success:true,result:{name:body.name,type:body.type}});
      }
      throw Error("unlisted provider path "+path);
    }
    const w=WORKERS.find(v=>u.hostname===v+".daspallab202391.workers.dev");
    assert(w);
    assert.equal(u.pathname,"/v1/internal/p0b/status");
    assert.equal(u.search,"?deep=invalid");
    assert.equal(init.headers.Authorization,"Bearer "+TOKEN);
    return active.has(w)?
      Response.json({ok:false,error:"P0B_STATUS_QUERY_INVALID"},{status:400}):
      Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  };
  const result=await syncShadowBearer({env:env(),holdPresent:true,
    fetchImpl:fake,sleep:async()=>{}});
  assert.equal(result.status,"PASS");
  assert.deepEqual(updated,[WORKERS[0]]);
  assert.equal(result.shadow_workers.length,2);
  assert.equal(result.production_d1_mutated,false);
  assert.equal(result.production_worker_changed,false);
  assert.equal(result.hold_removed,false);
  assert(!called.some(x=>x.path.includes("/workers/scripts/geomacro-control-plane/")));
  assert(!called.some(x=>x.method==="POST"||x.path.endsWith("/query")));
});
test("the protected GitHub workflow has only an owner manual mutation path",()=>{
  const y=readFileSync(".github/workflows/step3-shadow-bearer-sync.yml","utf8");
  const s=readFileSync("scripts/ops/sync-step3-shadow-bearer.mjs","utf8");
  assert.match(y,/workflow_dispatch:/);
  assert.match(y,/environment: production/);
  assert.match(y,/SYNC_SHADOW_BEARERS_ONLY/);
  assert.match(y,/git ls-remote/);
  assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
  assert.match(y,/secrets\.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN/);
  assert.doesNotMatch(y,/schedule:|continue-on-error: true|secrets\.CONTROL_PLANE_TOKEN/);
  assert.doesNotMatch(s,/unlinkSync|wrangler d1|SECRET=|GEOMACRO_STEP3_APPLY/);
});

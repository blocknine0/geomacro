import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkFrozenSupabase,summary,PROJECT,SLUG} from "../ops/verify-live-flash-supabase-deployment.mjs";
const NOW=Date.parse("2026-10-28T18:25:00Z");
const TOKEN="private-fake-test-only-token";
function fake({updated="2026-10-28T18:15:00Z",route=405,health=200,meta=200}={}){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,method:init.method,body:init.body??null});
  if(url==="https://api.supabase.com/v1/projects/"+PROJECT+"/functions"){
   return Response.json([{slug:SLUG,status:"ACTIVE",version:15,
     updated_at:updated}],{status:meta});
  }
  if(init.method==="GET")return new Response(null,{status:route});
  return Response.json({ok:true,health:true,authenticated:true},{status:health});
 };
 return {fetchImpl,calls};
}
test("real active production metadata, newer deployment, GET method guard and authenticated no-write health are distinct",async()=>{
 const f=fake();
 const r=await checkFrozenSupabase({now:NOW,fetchImpl:f.fetchImpl,
   accessToken:TOKEN,flashToken:TOKEN});
 assert.equal(r.status,"READONLY_HEALTH_AND_DEPLOYMENT_TIME_VERIFIED");
 assert.equal(r.exact_deployed_bundle_hash_verified,false);
 assert.equal(r.no_write,true);
 assert.equal(r.no_payment,true);
 assert.deepEqual(f.calls.map(c=>c.method),["GET","GET","POST"]);
 assert.equal(f.calls[1].url,"https://"+PROJECT+".supabase.co/functions/v1/"+SLUG);
 assert.equal(f.calls[2].body,"{}");
 assert.doesNotMatch(JSON.stringify(r)+summary(r),/private-fake-test-only-token/);
});
test("source merge time alone is not a new deployed version",async()=>{
 const r=await checkFrozenSupabase({now:NOW,fetchImpl:fake({
   updated:"2026-10-28T17:59:00Z"
 }).fetchImpl,accessToken:TOKEN,flashToken:TOKEN});
 assert.equal(r.status,"NOT_VERIFIED");
 assert.equal(r.deploy_after_jose_merge_verified,false);
 assert.equal(r.reason,"NO_POST_JOSE_SOURCE_DEPLOYMENT");
});
test("404 / upstream auth / no health token / unhealthy DB each fails closed",async()=>{
 for(const x of [{route:404},{route:401},{health:503}]){
  const r=await checkFrozenSupabase({now:NOW,fetchImpl:fake(x).fetchImpl,
   accessToken:TOKEN,flashToken:TOKEN});
  assert.equal(r.status,"NOT_VERIFIED");
 }
 const r=await checkFrozenSupabase({now:NOW,fetchImpl:fake().fetchImpl,
  accessToken:TOKEN});
 assert.equal(r.reason,"HEALTH_TOKEN_NOT_CONFIGURED");
 assert.equal(r.authenticated_health_verified,false);
});
test("missing API token and unavailable management permission cannot imply current deployment",async()=>{
 assert.equal((await checkFrozenSupabase({now:NOW})).status,"NOT_VERIFIED");
 const r=await checkFrozenSupabase({now:NOW,accessToken:TOKEN,
  fetchImpl:fake({meta:403}).fetchImpl});
 assert.equal(r.management_verified,false);
});
test("frozen existing deploy job still disabled, acceptance workflow cannot publish",()=>{
 const prod=readFileSync(".github/workflows/deploy-country-flash-supabase.yml","utf8");
 assert.match(prod,/if:\s*\$\{\{\s*false\s*\}\}/);
 const monitor=readFileSync(".github/workflows/verify-live-flash-supabase.yml","utf8");
 assert.match(monitor,/verify-live-flash-supabase-deployment.mjs/);
 assert.doesNotMatch(monitor,/supabase functions deploy|db push|secrets set|actions: write|PREDGE_RISK_GATE/);
});

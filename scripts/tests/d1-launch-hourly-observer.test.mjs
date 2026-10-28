import test from "node:test";
import assert from "node:assert/strict";
import {observeD1LaunchHour} from "../ops/d1-launch-hourly-observer.mjs";

const now=new Date("2026-10-28T08:30:00.000Z");
const sha="a".repeat(40);
const env={CLOUDFLARE_API_TOKEN:"x".repeat(32),
 CLOUDFLARE_ACCOUNT_ID:"b".repeat(32),GH_TOKEN:"z".repeat(32),GITHUB_SHA:sha};
function provider(){
 return {data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[{
  sum:{rowsRead:100_000,rowsWritten:500},
  dimensions:{databaseId:"c".repeat(32),date:"2026-10-28"}}]}]}}};
}
function mock(fail=false){
 const calls=[];
 const fetchImpl=async (url,options)=>{
  calls.push([url,options.method??"GET"]);
  if(url.includes("cloudflare.com/client/v4/graphql"))
   return Response.json(provider());
  if(url.endsWith("/health"))
   return Response.json({deployed_source_sha:fail?"b".repeat(40):sha});
  if(url.includes("/v1/public/derived-structural-72h"))
   return Response.json(fail?{ok:false}:{
    ok:true,schema:"geomacro.derived-news-structural-feed.v1",
    projection:"source_neutral",chargeable:false,items:[]},{status:fail?503:200});
  if(url.includes("/actions/artifacts?"))
   return Response.json({total_count:1,artifacts:[{
    name:"geomacro-encrypted-private-osint-held",expired:false,
    workflow_run:{head_branch:"main"},created_at:now.toISOString()
   }]});
  throw Error("UNEXPECTED_NETWORK");
 };
 return {calls,fetchImpl};
}
test("no SQL, no protected/PREDGE route, no invented ingestion and backlog proof",async()=>{
 const x=mock(),r=await observeD1LaunchHour({env,fetchImpl:x.fetchImpl,now});
 assert.equal(r.provider.verified,true);
 assert.equal(r.provider.rows_read,100_000);
 assert.equal(r.public.verified,true);
 assert.equal(r.deploy.exact_main_sha_verified,true);
 assert.equal(r.backlog.pending_artifacts,1);
 assert.equal(r.critical.independent_d1_readback_verified,false);
 assert.equal(r.recovery.verified_replayed_items,null);
 assert.equal(r.d1_sql_queries_by_observer,0);
 assert.equal(x.calls.length,5);
 assert.ok(x.calls.every(c=>!c[0].includes("predge")&&!c[0].includes("d1/execute")));
 assert.equal(x.calls.filter(c=>c[1]==="POST").length,1);
});
test("failed public and SHA proof never become green",async()=>{
 const x=mock(true),r=await observeD1LaunchHour({env,fetchImpl:x.fetchImpl,now});
 assert.equal(r.provider.verified,true);
 assert.equal(r.public.verified,false);
 assert.equal(r.public.http_status,503);
 assert.equal(r.deploy.exact_main_sha_verified,false);
 assert.equal(r.deploy.observed_deploy_sha,"b".repeat(40));
 assert.equal(r.public.error,"PUBLIC_BUNDLE_SCHEMA_OR_HTTP_MISMATCH");
});
test("missing credentials and inventory do not fabricate account quota or recovery",async()=>{
 const x=mock();
 const r=await observeD1LaunchHour({env:{GITHUB_SHA:sha},fetchImpl:x.fetchImpl,now});
 assert.equal(r.provider.verified,false);
 assert.equal(r.backlog.verified,false);
 assert.equal(r.critical.independent_d1_readback_verified,false);
});

test("HTML D1 quota errors retain exact HTTP status without leaking body",async()=>{
 const original=mock(true).fetchImpl;
 const fetchImpl=(url,options)=>url.includes("/v1/public/derived-structural-72h")?
   Promise.resolve(new Response("<html>provider transient failure</html>",{status:503,
    headers:{"Content-Type":"text/html"}})):original(url,options);
 const r=await observeD1LaunchHour({env,fetchImpl,now});
 assert.equal(r.public.verified,false);
 assert.equal(r.public.http_status,503);
 assert.equal(r.public.error,"PUBLIC_BUNDLE_RESPONSE_NOT_JSON");
 assert.equal(JSON.stringify(r).includes("provider transient failure"),false);
});

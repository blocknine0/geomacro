import {test} from "node:test";
import assert from "node:assert/strict";
import {R2_KV_GRAPHQL,classifyR2Action,assessR2KVAccountAnalytics,
 readR2KVAccountAnalytics}
 from "../ops/read-cloudflare-r2-kv-account-analytics.mjs";
const NOW=new Date("2026-11-09T12:00:00.000Z"),ACCOUNT="a".repeat(32);
const row=(date,actionType,requests)=>({sum:{requests},dimensions:{date,actionType}});
const valid=()=>({data:{viewer:{accounts:[{
 r2OperationsAdaptiveGroups:[
  row("2026-11-05","PutObject",100),
  row("2026-11-09","GetObject",35),
  row("2026-11-09","DeleteObject",10),
 ],
 kvOperationsAdaptiveGroups:[
  row("2026-11-05","write",25),
  row("2026-11-09","read",120),
  row("2026-11-09","delete",6),
  row("2026-11-09","list",5),
 ]
}]}}});
test("provider schema uses account-wide R2/KV datasets; no bucket or namespace selection",()=>{
 assert.match(R2_KV_GRAPHQL,/r2OperationsAdaptiveGroups/);
 assert.match(R2_KV_GRAPHQL,/kvOperationsAdaptiveGroups/);
 assert.match(R2_KV_GRAPHQL,/datetime_geq/);
 assert.doesNotMatch(R2_KV_GRAPHQL,/bucketName|namespaceId/);
});
test("R2 Class A, B and free operations use Cloudflare's explicit documented taxonomy",()=>{
 for(const name of ["PutObject","CopyObject","ListObjects","UploadPart","PutBucket"])
  assert.equal(classifyR2Action(name),"r2_class_a");
 for(const name of ["GetObject","HeadObject","HeadBucket"])
  assert.equal(classifyR2Action(name),"r2_class_b");
 assert.equal(classifyR2Action("DeleteObject"),"r2_free_operations");
 assert.throws(()=>classifyR2Action("SomeNewBillableOperation"),
  /CLOUDFLARE_R2_KV_PROOF_R2_ACTION_CLASS_UNRECOGNIZED/);
});
test("grouped account totals retain 30pct reserve input but never fabricate monthly provider billing proof",()=>{
 const result=assessR2KVAccountAnalytics(valid(),{now:NOW,accountId:ACCOUNT});
 assert.equal(result.schema,"geomacro.cloudflare-r2-kv-account-observation.v1");
 assert.equal(result.metrics.r2_class_a.month,100);
 assert.equal(result.metrics.r2_class_a.day,0);
 assert.equal(result.metrics.r2_class_b.month,35);
 assert.equal(result.metrics.r2_class_b.day,35);
 assert.equal(result.metrics.kv_writes.month,25);
 assert.equal(result.metrics.kv_reads.month,120);
 assert.equal(result.metrics.kv_reads.day,120);
 assert.equal(result.supplemental_not_in_six_resource_policy.kv_deletes.month,6);
 assert.equal(result.supplemental_not_in_six_resource_policy.kv_lists.month,5);
 assert.equal(result.supplemental_not_in_six_resource_policy.r2_free_operations.month,10);
 assert.equal(result.metrics.r2_class_a.hour,null);
 assert.equal(result.provider_verified,false);
 assert.equal(result.full_six_resource_snapshot,false);
 assert.equal(result.production_release_authorized,false);
});
test("unknown or duplicate operation categories, accounts, truncation and absent datasets refuse proof",()=>{
 const corrupt=[
  {change:o=>o.data.viewer.accounts[0].r2OperationsAdaptiveGroups[0].dimensions.actionType="UnrecognizedCharge"},
  {change:o=>o.data.viewer.accounts[0].kvOperationsAdaptiveGroups[0].dimensions.actionType="bulk"},
  {change:o=>o.data.viewer.accounts[0].r2OperationsAdaptiveGroups.push(row("2026-11-05","PutObject",10))},
  {change:o=>{delete o.data.viewer.accounts[0].kvOperationsAdaptiveGroups}},
  {change:o=>o.data.viewer.accounts=[]},
  {change:o=>o.data.viewer.accounts[0].kvOperationsAdaptiveGroups[0].sum.requests=-1},
  {change:o=>o.data.viewer.accounts[0].r2OperationsAdaptiveGroups[0].dimensions.date="2026-10-01"},
  {change:o=>o.data.viewer.accounts[0].r2OperationsAdaptiveGroups[0].sum.requests=Number.MAX_SAFE_INTEGER,
    after:o=>o.data.viewer.accounts[0].r2OperationsAdaptiveGroups.push(row("2026-11-07","PutObject",1))},
 ];
 for(const {change,after} of corrupt){
  const fixture=valid();change(fixture);after?.(fixture);
  assert.throws(()=>assessR2KVAccountAnalytics(fixture,{now:NOW,accountId:ACCOUNT}),
   /CLOUDFLARE_R2_KV_PROOF_/,JSON.stringify(fixture).slice(0,150));
 }
 assert.throws(()=>assessR2KVAccountAnalytics({...valid(),errors:[{message:"bad"}]},
  {now:NOW,accountId:ACCOUNT}),/GRAPHQL_ACCOUNT_OR_ERRORS_UNVERIFIED/);
});
test("partial R2 dataset is retained; missing KV operation groups are UNKNOWN, never zero",()=>{
 const fixture=valid();
 fixture.data.viewer.accounts[0].kvOperationsAdaptiveGroups=[];
 const r=assessR2KVAccountAnalytics(fixture,{now:NOW,accountId:ACCOUNT});
 assert.equal(r.status,"PARTIAL_ACCOUNT_OBSERVATION_HOLD");
 assert.equal(r.partial_account_telemetry,true);
 assert.deepEqual(r.incomplete_resources,["kv_writes","kv_reads"]);
 assert.equal(r.metrics.r2_class_a.month,100);
 assert.equal(r.metrics.r2_class_b.day,35);
 assert.equal(r.metrics.kv_writes.month,null);
 assert.equal(r.metrics.kv_reads.day,null);
 assert.equal(r.supplemental_not_in_six_resource_policy.kv_deletes.month,null);
 assert.equal(r.full_six_resource_snapshot,false);
 assert.equal(r.provider_verified,false);
 assert.equal(r.production_release_authorized,false);
 assert.equal(r.merchant_funds_authorized,false);
});
test("missing R2 dataset cannot be interpreted as zero while KV remains visible",()=>{
 const fixture=valid();
 fixture.data.viewer.accounts[0].r2OperationsAdaptiveGroups=[];
 const r=assessR2KVAccountAnalytics(fixture,{now:NOW,accountId:ACCOUNT});
 assert.equal(r.status,"PARTIAL_ACCOUNT_OBSERVATION_HOLD");
 assert.deepEqual(r.incomplete_resources,["r2_class_a","r2_class_b"]);
 assert.equal(r.metrics.r2_class_a.month,null);
 assert.equal(r.metrics.r2_class_b.day,null);
 assert.equal(r.metrics.kv_reads.month,120);
 assert.equal(r.provider_verified,false);
});
test("missing current UTC day even with historic R2 groups stays unknown",()=>{
 const fixture=valid();
 fixture.data.viewer.accounts[0].r2OperationsAdaptiveGroups=
  fixture.data.viewer.accounts[0].r2OperationsAdaptiveGroups.filter(x=>x.dimensions.date!=="2026-11-09");
 const r=assessR2KVAccountAnalytics(fixture,{now:NOW,accountId:ACCOUNT});
 assert.equal(r.status,"PARTIAL_ACCOUNT_OBSERVATION_HOLD");
 assert.equal(r.metrics.r2_class_a.month,null);
 assert.equal(r.metrics.kv_reads.month,120);
});
test("no R2 and no KV datasets provides no fabricated partial telemetry",()=>{
 const fixture=valid();
 fixture.data.viewer.accounts[0].r2OperationsAdaptiveGroups=[];
 fixture.data.viewer.accounts[0].kvOperationsAdaptiveGroups=[];
 assert.throws(()=>assessR2KVAccountAnalytics(fixture,{now:NOW,accountId:ACCOUNT}),
  /CLOUDFLARE_R2_KV_PROOF_R2_AND_KV_DATASETS_BOTH_EMPTY/);
});
test("provider read-only invocation sends one query, account ID stays out of receipt",async()=>{
 let calls=0;
 const receipt=await readR2KVAccountAnalytics({
  now:NOW,env:{CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:"s".repeat(32)},
  fetchImpl:async(url,req)=>{
   calls++;
   assert.equal(url,"https://api.cloudflare.com/client/v4/graphql");
   assert.equal(req.method,"POST");
   const q=JSON.parse(req.body);
   assert.equal(q.variables.startDay,"2026-11-05");
   assert.equal(q.variables.endDay,"2026-11-09");
   return Response.json(valid());
  }
 });
 assert.equal(calls,1);
 assert.equal(receipt.status,"OBSERVATIONAL_ONLY_NOT_RELEASE_PROOF");
 assert.equal(JSON.stringify(receipt).includes(ACCOUNT),false);
});
test("missing secrets, forbidden provider responses or empty reports fail closed",async()=>{
 await assert.rejects(()=>readR2KVAccountAnalytics({now:NOW,env:{}}),
  /ACCOUNT_ANALYTICS_READ_PERMISSION_UNVERIFIED/);
 const env={CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:"s".repeat(32)};
 await assert.rejects(()=>readR2KVAccountAnalytics({
  now:NOW,env,fetchImpl:async()=>new Response("denied",{status:403})
 }),/GRAPHQL_HTTP_UNVERIFIED/);
 await assert.rejects(()=>readR2KVAccountAnalytics({
  now:NOW,env,fetchImpl:async()=>Response.json({data:{viewer:{accounts:[{
   r2OperationsAdaptiveGroups:[],kvOperationsAdaptiveGroups:[]}]}}})
 }),/R2_EMPTY_OR_TRUNCATED/);
});

test("CLI always emits sanitized machine-readable HOLD artifact with nonzero exit",async()=>{
 const {spawnSync}=await import("node:child_process");
 const processResult=spawnSync(process.execPath,
  ["scripts/ops/read-cloudflare-r2-kv-account-analytics.mjs"],
  {env:{},encoding:"utf8",timeout:12000});
 assert.equal(processResult.status,3);
 assert.equal(processResult.stderr,"");
 const receipt=JSON.parse(processResult.stdout);
 assert.equal(receipt.schema,"geomacro.cloudflare-r2-kv-account-observation.v1");
 assert.equal(receipt.status,"NOT_YET_VERIFIED");
 assert.equal(receipt.reason,"CLOUDFLARE_R2_KV_PROOF_ACCOUNT_ANALYTICS_READ_PERMISSION_UNVERIFIED");
 assert.equal(receipt.production_release_authorized,false);
 assert.equal(receipt.no_provider_mutations,true);
});

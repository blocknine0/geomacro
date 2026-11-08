import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditShadowMetadata,assertShadowAuditIdentity}
 from "../ops/audit-step3-shadow-provider-readonly.mjs";

const id="c4add153-229d-412a-b1bd-489526b7e02f";
const production="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const account="fddd57d28199bad07a768445e7237693";
const env=()=>({
 GITHUB_REF:"refs/heads/main",GITHUB_REPOSITORY:"blocknine0/geomacro",
 CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:"s".repeat(40),
 D1_DATABASE_ID:production,GEOMACRO_D1_SHADOW_DATABASE_ID:id,
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:"geomacro-step3-shadow.daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:"geomacro-step3-shadow-legacy.daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
 GEOMACRO_D1_RECOVERY_R2_BUCKET:"geomacro-d1-recovery-private"
});
const response=result=>({status:200,redirected:false,json:async()=>({success:true,result})});
const q=rows=>response([{success:true,results:rows,meta:{rows_read:rows.length+1,rows_written:0}}]);
function fakeProvider({schemaNames=[
 ["table","phase2h_private_raw_news"],
 ["index","idx_phase2h_retention_first_ingested"],
 ["table","phase2h_raw_object_refs_v1"],
 ["index","idx_phase2h_ref_ingest_clock_v1"]],
 dataRows=[{record_id:"a".repeat(64),b2_object_sha256:"b".repeat(64),b2_archived_at:"2026-11-09T00:00:00.000Z"}],
 pointerRows=[],rows_read,failAt
}={}){
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,method:opts.method,sql:opts.body?JSON.parse(opts.body).sql:null});
  if(failAt&&url.includes(failAt))return {status:403,redirected:false,json:async()=>({success:false})};
  if(url.includes("/d1/database/")){
   assert(!url.includes(production));
   assert.equal(opts.method,"POST");
   const sql=JSON.parse(opts.body).sql;
   assert(/^SELECT /u.test(sql));
   assert(!/INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|PRAGMA|;/iu.test(sql));
   const rr=rows_read??null;
   if(sql.includes("sqlite_schema")){
    const v=q(schemaNames.map(([type,name])=>({type,name})));
    if(rr!==null)v.json=async()=>({success:true,result:[{success:true,results:schemaNames.map(([type,name])=>({type,name})),meta:{rows_read:rr,rows_written:0}}]});
    return v;
   }
   if(sql.includes("phase2h_private_raw_news"))return q(dataRows);
   if(sql.includes("phase2h_raw_object_refs_v1"))return q(pointerRows);
   assert.fail("non-allowlisted D1 query");
  }
  if(url.includes("/workers/scripts/")){
   let modern=url.includes("/geomacro-step3-shadow/settings");
   return response({bindings:[{name:"DB",type:"d1",database_id:id},
    ...(modern?[{name:"PHASE2H_PRIVATE_R2",type:"r2_bucket",bucket_name:"geomacro-step3-shadow-private"}]:[])]});
  }
  if(url.includes("/r2/buckets/"))return response({name:url.split("/").at(-1)});
  assert.fail("unknown provider endpoint");
 };
 return {calls,fetchImpl};
}
test("only pinned shadow UUID permitted; no calls for wrong identity or missing auth",async()=>{
 const f=fakeProvider();
 for(const update of [{D1_DATABASE_ID:id},{GEOMACRO_D1_SHADOW_DATABASE_ID:production},
  {GITHUB_REF:"refs/heads/feature"},{CLOUDFLARE_API_TOKEN:""},
  {GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:"api.geomacro.live"}]){
  const r=await auditShadowMetadata({env:{...env(),...update},fetchImpl:f.fetchImpl});
  assert.equal(r.status,"HOLD");
  assert.equal(r.provider_calls,0);
 }
 assert.equal(f.calls.length,0);
 assert.equal(assertShadowAuditIdentity(env()),true);
});
test("real provider metadata inventory uses at most three bounded SELECTs, never copies originals",async()=>{
 const f=fakeProvider();
 const r=await auditShadowMetadata({env:env(),fetchImpl:f.fetchImpl,
  now:new Date("2026-11-09T01:00:00Z")});
 assert.equal(r.status,"INVENTORY_COMPLETE_NOT_STAGE1_PASS");
 assert.equal(r.code,"PHYSICAL_PROOFS_AND_AUTH_READBACK_PENDING");
 assert.equal(r.d1_query_calls,3);
 assert.equal(r.provider_calls,7);
 assert.equal(r.shadow_d1_rows_written,0);
 assert.equal(r.production_d1_queries,0);
 assert.equal(r.production_mutations,0);
 assert.equal(r.r2_puts,0);
 assert.equal(r.b2_requests,0);
 assert.equal(r.payments,0);
 assert.equal(r.stage1_physical_pass,false);
 assert.equal(r.real_b2_bytes_verified,false);
 assert.equal(r.recent_original_sample.b2_ack_in_bounded_sample,true);
 assert(!JSON.stringify(r).includes("a".repeat(64)));
 assert(!JSON.stringify(r).includes("b".repeat(64)));
 assert(!JSON.stringify(r).includes("s".repeat(40)));
 const d1=f.calls.filter(x=>x.url.includes("/d1/database/"));
 assert.equal(d1.length,3);
 assert(d1.every(x=>x.url.includes(id)));
 assert(d1.every(x=>x.method==="POST"));
 assert(d1.every(x=>x.sql.startsWith("SELECT ")));
});
test("empty shadow database yields schema bootstrap required and only one D1 read",async()=>{
 const f=fakeProvider({schemaNames:[]});
 const r=await auditShadowMetadata({env:env(),fetchImpl:f.fetchImpl});
 assert.equal(r.status,"INVENTORY_COMPLETE_NOT_STAGE1_PASS");
 assert.equal(r.code,"SHADOW_SCHEMA_BOOTSTRAP_REQUIRED");
 assert.equal(r.d1_query_calls,1);
 assert.equal(r.recent_original_sample.status,"NOT_CHECKED_MISSING_INDEX_OR_TABLE");
 assert.equal(r.pointer_sample.status,"NOT_CHECKED_MISSING_INDEX_OR_TABLE");
 assert.equal(r.stage1_physical_pass,false);
});
test("excess D1 billing and provider failures stay HOLD and do not leak auth",async()=>{
 const big=fakeProvider({rows_read:1001});
 const out=await auditShadowMetadata({env:env(),fetchImpl:big.fetchImpl});
 assert.equal(out.status,"HOLD");
 assert.equal(out.code,"STEP3_AUDIT_D1_NATIVE_BILLING_OR_ROW_BOUND_UNVERIFIED");
 assert.equal(out.d1_query_calls,1);
 assert(!JSON.stringify(out).includes("s".repeat(40)));
 const f=fakeProvider({failAt:"/workers/scripts/"});
 const r=await auditShadowMetadata({env:env(),fetchImpl:f.fetchImpl});
 assert.equal(r.status,"HOLD");
 assert.equal(r.code,"STEP3_AUDIT_PROVIDER_REQUEST_REJECTED");
 assert.equal(r.shadow_d1_mutations,0);
});
test("workflow is read-only and does not run on pull requests with provider credentials",()=>{
 const y=readFileSync(new URL("../../.github/workflows/step3-shadow-provider-readonly-inventory.yml",import.meta.url),"utf8");
 assert(y.includes("workflow_dispatch:"));
 assert(y.includes("push:"));
 assert(y.includes("branches: [main]"));
 assert(y.includes("if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'"));
 assert(y.includes("environment: production"));
 assert(!y.includes("--apply"));
 assert(!y.includes("wrangler deploy"));
 assert(!y.includes("GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED: 'YES'"));
 assert(!y.includes("continue-on-error: true"));
});

test("all protected GitHub expressions are valid, not literal unresolved env strings",()=>{
 const y=readFileSync(new URL("../../.github/workflows/step3-shadow-provider-readonly-inventory.yml",import.meta.url),"utf8");
 const expressions=[...y.matchAll(/\$\{\{[^\n]*?\}\}/gu)].map(m=>m[0]);
 assert.equal(expressions.length,11,"Expected exactly eleven protected GitHub expressions");
 assert.doesNotMatch(y,/\$\{(?!\{)/u,"Malformed single-brace GitHub expression");
 for(const name of [
  "CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_ID","GEOMACRO_D1_SHADOW_DATABASE_ID",
  "GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST",
  "GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST",
  "GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET",
  "GEOMACRO_D1_RECOVERY_R2_BUCKET"
 ]){
  const line=y.split("\n").find(x=>x.trimStart().startsWith(name+":"));
  assert.ok(line,"Missing required secret/variable: "+name);
  assert.match(line,/:\s+\$\{\{\s+(?:secrets|vars)\./u,name);
  assert.match(line,/\}\}\s*$/u,name);
 }
 assert.match(y,/ref:\s+\$\{\{ github\.sha \}\}/u);
 assert.match(y,/geomacro-step3-shadow-provider-inventory-\$\{\{ github\.run_id \}\}/u);
 assert.match(y,/geomacro-step3-shadow-provider-inventory-\$\{\{ github\.ref \}\}/u);
 assert.doesNotMatch(y,/continue-on-error:\s*true/u);
});

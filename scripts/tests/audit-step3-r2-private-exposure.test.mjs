import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditStep3PrivateR2Exposure,evaluateR2BucketExposure,
 validateR2AuditIdentity} from "../ops/audit-step3-r2-private-exposure.mjs";
const env=()=>({
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"z".repeat(40),
 GEOMACRO_D1_RECOVERY_R2_BUCKET:"geomacro-d1-recovery-private",
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private"
});
const response=obj=>({status:200,redirected:false,
 json:async()=>({success:true,result:obj})});
function provider({managedEnabled=false,customEnabled=false,deniedPath=null}={}){
 const calls=[];
 const fetchImpl=async (url,options)=>{
  calls.push({url,method:options.method,body:options.body});
  if(deniedPath&&url.includes(deniedPath))return {status:403,redirected:false};
  const name=url.includes("geomacro-d1-recovery-private")?
   "geomacro-d1-recovery-private":"geomacro-step3-shadow-private";
  if(url.endsWith("/domains/managed"))return response({enabled:managedEnabled,
   domain:"private-example.r2.dev"});
  if(url.endsWith("/domains/custom"))return response({domains:customEnabled?
   [{domain:"danger.example.org",enabled:true}]:[]});
  if(url.endsWith("/r2/buckets/"+name))return response({name});
  assert.fail("unauthorized Cloudflare endpoint");
 };
 return {calls,fetchImpl};
}
test("exact account, main and both pinned buckets required before provider access",async()=>{
 for(const change of [{GITHUB_REF:"refs/heads/branch"},
  {CLOUDFLARE_ACCOUNT_ID:"0".repeat(32)},
  {GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"different"},
  {CLOUDFLARE_API_TOKEN:""}]){
  const f=provider();
  const out=await auditStep3PrivateR2Exposure({env:{...env(),...change},
   fetchImpl:f.fetchImpl});
  assert.equal(out.status,"HOLD");
  assert.equal(out.provider_calls,0);
  assert.equal(f.calls.length,0);
 }
 assert.equal(validateR2AuditIdentity(env()),true);
});
test("disabled r2.dev and custom domains physically verified with six GETs only",async()=>{
 const f=provider();
 const result=await auditStep3PrivateR2Exposure({env:env(),fetchImpl:f.fetchImpl});
 assert.equal(result.status,"PRIVATE_R2_DOMAIN_EXPOSURE_VERIFIED_ONLY");
 assert.equal(result.buckets.length,2);
 assert(result.buckets.every(x=>x.private_access_verified===true));
 assert.equal(result.provider_calls,6);
 assert.equal(result.production_d1_queries,0);
 assert.equal(result.provider_mutations,0);
 assert.equal(result.r2_object_gets,0);
 assert.equal(result.r2_object_puts,0);
 assert.equal(result.b2_requests,0);
 assert.equal(result.stage1_physical_pass,false);
 assert.equal(result.encrypted_checkpoint_readback_verified,false);
 assert(f.calls.every(x=>x.method==="GET"&&x.body===undefined));
 assert(f.calls.every(x=>x.url.startsWith("https://api.cloudflare.com/client/v4/accounts/fddd57d28199bad07a768445e7237693/r2/buckets/")));
 assert(!JSON.stringify(result).includes("z".repeat(40)));
});
test("enabled managed or custom exposure prevents recovery approval",async()=>{
 for(const flags of [{managedEnabled:true},{customEnabled:true}]){
  const f=provider(flags);
  const r=await auditStep3PrivateR2Exposure({env:env(),fetchImpl:f.fetchImpl});
  assert.equal(r.status,"HOLD");
  assert.equal(r.code,"STEP3_R2_EXPOSURE_PUBLIC_BUCKET_EXPOSURE_DETECTED");
  assert.equal(r.buckets[0].private_access_verified,false);
  assert.equal(r.stage1_physical_pass,false);
 }
});
test("missing API access and incomplete or duplicate domain responses HOLD",async()=>{
 const denied=provider({deniedPath:"/domains/custom"});
 const a=await auditStep3PrivateR2Exposure({env:env(),fetchImpl:denied.fetchImpl});
 assert.equal(a.status,"HOLD");
 assert.equal(a.code,"STEP3_R2_EXPOSURE_CLOUDFLARE_GET_NON_200_OR_REDIRECT");
 assert.throws(()=>evaluateR2BucketExposure({
  name:"geomacro-d1-recovery-private",
  metadata:{name:"geomacro-d1-recovery-private"},
  managed:{enabled:false},custom:{domains:[{enabled:"false",domain:"invalid.tld"}]}
 }),/PROVIDER_DOMAIN_INVENTORY_INCOMPLETE/);
 assert.throws(()=>evaluateR2BucketExposure({
  name:"geomacro-d1-recovery-private",
  metadata:{name:"geomacro-d1-recovery-private"},
  managed:{enabled:false},custom:{domains:[
   {enabled:false,domain:"same.tld"},{enabled:false,domain:"same.tld"}]}
 }),/PROVIDER_DOMAIN_INVENTORY_INCOMPLETE/);
});
test("main-only provider job cannot run from PR or authorize D1, funds or canary",()=>{
 const y=readFileSync(new URL("../../.github/workflows/step3-r2-private-exposure.yml",import.meta.url),"utf8");
 assert.match(y,/if: github.event_name == 'pull_request'/u);
 assert.match(y,/if: >-/u);
 assert(y.includes("github.ref == 'refs/heads/main'"));
 assert(y.includes("environment: production"));
 assert(!y.includes("continue-on-error: true"));
 assert(!y.includes("--apply"));
 assert(!y.includes("wrangler d1"));
 assert(y.includes("$"+"{{ secrets.CLOUDFLARE_API_TOKEN }}"));
});

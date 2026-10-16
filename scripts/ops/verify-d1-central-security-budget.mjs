// Authenticated synthetic COUNTERS only. No source, B2, payment or product call.
import {createHash} from 'node:crypto';
const origin='https://geomacro-control-plane.daspallab202391.workers.dev';
const token=process.env.CONTROL_PLANE_TOKEN;
const sha=process.env.GITHUB_SHA;
if(!token||token.length<32||!/^[a-f0-9]{40}$/.test(sha??''))throw Error('SECURITY_ACCEPTANCE_CONFIGURATION_REQUIRED');
async function request(path,body,auth=true){
 const r=await fetch(origin+path,{method:body?'POST':'GET',redirect:'error',
  headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 const raw=await r.text();if(raw.length>8192)throw Error('SECURITY_ACCEPTANCE_RESPONSE_INVALID');
 return {status:r.status,data:JSON.parse(raw)};
}
const health=await request('/health');
if(health.status!==200||health.data.deployed_source_sha!==sha)throw Error('SECURITY_ACCEPTANCE_DEPLOY_SHA_MISMATCH');
const body={route_class:'internal',client_key:createHash('sha256').update('central-security-deploy-smoke:'+sha).digest('hex')};
const denied=await request('/v1/security/budget',body,false);
if(denied.status!==401)throw Error('SECURITY_ACCEPTANCE_AUTH_NOT_ENFORCED');
const invalid=await request('/v1/security/budget',{...body,global_limit:999999});
if(invalid.status!==400)throw Error('SECURITY_ACCEPTANCE_POLICY_OVERRIDE_NOT_REJECTED');
const accepted=await request('/v1/security/budget',body);
if(accepted.status!==200||accepted.data.ok!==true||accepted.data.allowed!==true||accepted.data.store!=='d1'||
 accepted.data.schema!=='geomacro.central-security-budget.v1'||accepted.data.route_class!=='internal')
 throw Error('SECURITY_ACCEPTANCE_D1_NOT_VERIFIED');
const quota=await request('/v1/b2-quota/status');
if(quota.status!==200||quota.data.ok!==true||quota.data.schema!=='geomacro.b2-account-quota-status.v1')
 throw Error('SECURITY_ACCEPTANCE_QUOTA_STATUS_UNAVAILABLE');
console.log(JSON.stringify({schema:'geomacro.central-security-d1-production-acceptance.v1',
 verified:true,deployed_source_sha:sha,unauthenticated_http_status:denied.status,
 caller_policy_override_http_status:invalid.status,authenticated_budget_http_status:accepted.status,
 distributed_store:'d1',supabase_requests:0,b2_requests:0,payments:0,current_products_promoted:false,
 shared_b2_quota:{day_utc:quota.data.day_utc,used:quota.data.used,limits:quota.data.limits}}));

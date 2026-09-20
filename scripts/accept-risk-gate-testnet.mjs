# acceptance-run: commercial production acceptance harness
#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const PROD = new Set(['geomacro.live','www.geomacro.live']);
const need = (n) => { const v = process.env[n]?.trim(); if (!v) throw new Error(n + ' is required'); return v; };
function baseUrl(raw) {
  let u; try { u = new URL(raw); } catch { throw new Error('RISK_GATE_STAGING_BASE_URL must be a valid URL'); }
  if (PROD.has(u.hostname.toLowerCase())) throw new Error('Production Geomacro host is blocked');
  const local = ['localhost','127.0.0.1','::1'].includes(u.hostname.toLowerCase());
  if (u.protocol !== 'https:' && !local) throw new Error('Staging target must use HTTPS unless localhost');
  if (u.username || u.password || u.search || u.hash) throw new Error('Base URL must not contain credentials, query or fragment');
  return u;
}
function secretPath(v, p='$') {
  if (Array.isArray(v)) { for (let i=0;i<v.length;i++) { const x=secretPath(v[i],p+'['+i+']'); if (x) return x; } return null; }
  if (!v || typeof v !== 'object') return null;
  for (const [k,c] of Object.entries(v)) {
    const n=k.toLowerCase().replace(/[-.]/g,'_');
    if (['authorization','api_key','api_secret','private_key','secret','service_role_key','supabase_service_role_key','payment_signature'].includes(n) || n.includes('service_role') || n.includes('private_key') || n.includes('api_secret')) return p+'.'+k;
    const x=secretPath(c,p+'.'+k); if (x) return x;
  }
  return null;
}
function executionFalse(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (v.execution_authorized === false) return true;
  return !!(v.risk_gate && typeof v.risk_gate === 'object' && !Array.isArray(v.risk_gate) && v.risk_gate.execution_authorized === false);
}
const policy={policy_id:'geomacro-testnet-acceptance',policy_version:'1.0.0',continue_max_score:35,reduce_limit_max_score:55,require_approval_max_score:75,minimum_confidence_for_auto_continue:0.8,require_commercial_verification_for_continue:true,max_positive_delta_for_auto_continue:10,hard_stop_driver_contributions:{sanctions:20}};
async function call(url, headers, body) {
  const r=await fetch(url,{method:'POST',redirect:'error',headers,body:JSON.stringify(body)});
  const raw=await r.text(); let json=null; try { json=JSON.parse(raw); } catch {}
  return {status:r.status,json,headers:r.headers,raw};
}
function assertSafe(result,label) {
  if (secretPath(result.json)) throw new Error(label+' exposed sensitive response fields');
  if (!executionFalse(result.json)) throw new Error(label+' did not preserve execution_authorized=false');
}
function countryBody(id) { return {request_id:id,subject:{type:'country',country_iso3:'USA'},action_context:{action_type:'testnet_acceptance',currency:'USDC',metadata:{synthetic:true,acceptance:true}},policy}; }
function corridorBody(id) { return {request_id:id,subject:{type:'corridor',origin_country_iso3:'USA',destination_country_iso3:'CHN'},action_context:{action_type:'testnet_acceptance_corridor',currency:'USDC',metadata:{synthetic:true,acceptance:true}},policy}; }

async function main() {
  if (need('RISK_GATE_LOAD_TEST_ACK') !== 'STAGING_ONLY') throw new Error('RISK_GATE_LOAD_TEST_ACK must equal STAGING_ONLY');
  const base=baseUrl(need('RISK_GATE_STAGING_BASE_URL'));
  const key=need('RISK_GATE_STAGING_API_KEY');
  if (key.length < 32 || key.length > 512) throw new Error('RISK_GATE_STAGING_API_KEY has invalid length');
  const readiness=await (async()=>{ const r=await fetch(new URL('/api/risk-gate-readiness',base),{redirect:'error'}); const raw=await r.text(); let json=null; try{json=JSON.parse(raw);}catch{} return {status:r.status,json}; })();
  if (readiness.status!==200 || !readiness.json) throw new Error('Readiness endpoint failed: HTTP '+readiness.status);
  const checks=readiness.json.checks || {};
  const required=['database','audit_store','verification_keys','fresh_country_risk_object','publisher_signing','source_network_100_complete','realtime_source_freshness'];
  const failed=required.filter((k)=>checks[k]!==true);
  if (readiness.json.status!=='ready' || failed.length) throw new Error('TESTNET_NOT_READY: '+(failed.join(',') || 'status is not ready'));
  const headers={authorization:'Bearer '+key,'content-type':'application/json','user-agent':'geomacro-testnet-acceptance/1.0'};
  const id='acceptance-country-'+randomUUID(); const body=countryBody(id);
  const first=await call(new URL('/api/risk-gate',base),headers,body);
  if(first.status!==200 || !first.json?.ok) throw new Error('Country request failed: HTTP '+first.status);
  assertSafe(first,'country response');
  if(typeof first.json.audit_id!=='string' || !first.json.audit_id) throw new Error('Country response missing audit_id');
  const replay=await call(new URL('/api/risk-gate',base),headers,body);
  if(replay.status!==200 || !replay.json?.ok) throw new Error('Exact replay failed: HTTP '+replay.status);
  assertSafe(replay,'country replay');
  if(replay.json.audit_id!==first.json.audit_id) throw new Error('Exact replay returned different audit_id');
  if(replay.headers.get('x-geomacro-idempotent-replay')!=='true') throw new Error('Exact replay did not advertise idempotent replay');
  const conflict=await call(new URL('/api/risk-gate',base),headers,{...body,action_context:{...body.action_context,metadata:{synthetic:true,acceptance:true,mutated:true}}});
  if(conflict.status!==409 || conflict.json?.error?.code!=='IDEMPOTENCY_CONFLICT') throw new Error('Idempotency conflict failed: HTTP '+conflict.status);
  assertSafe(conflict,'conflict response');
  const corridor=await call(new URL('/api/risk-gate',base),headers,corridorBody('acceptance-corridor-'+randomUUID()));
  if(corridor.status!==200 || !corridor.json?.ok) throw new Error('Corridor request failed: HTTP '+corridor.status);
  assertSafe(corridor,'corridor response');
  const evidence={suite:'risk-gate-testnet-acceptance-v1',generated_at:new Date().toISOString(),host:base.host,readiness:{status:readiness.json.status,checks},country:{status:first.status,audit_id:first.json.audit_id,replay_status:replay.status,conflict_status:conflict.status},corridor:{status:corridor.status},execution_authorized:false,response_secrets_exposed:false,production_target:false,pass:true};
  mkdirSync('artifacts',{recursive:true}); writeFileSync('artifacts/risk-gate-testnet-acceptance.json',JSON.stringify(evidence,null,2)+'\n'); console.log(JSON.stringify(evidence,null,2));
}
main().catch((e)=>{ console.error(e instanceof Error ? e.message : e); process.exit(1); });
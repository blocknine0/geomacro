#!/usr/bin/env bun
/** Protected read-only acceptance: no billing lookup, source fetch, write,
 * verdict, entitlement or funds. A healthy signer alone is not source proof. */
import {createHmac} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {readD1VerifiedHotCountryGro} from '../../src/lib/d1-country-gro-hot.server';
import {CATEGORIES,validatedSignedCategoryScores} from '../../workers/control-plane/src/unified-risk-categories.mjs';
import {RISK_GATE_HOT50} from '../../workers/control-plane/src/risk-gate-hot50-scope.mjs';
export async function verifyNonbillingReadiness({env=process.env,fetcher=fetch,
 readGro=readD1VerifiedHotCountryGro,now=new Date()}={}){
 const root=env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
 if(!root||root.length<32||!Number.isFinite(now.getTime()))throw Error('NONBILLING_PROTECTED_CONFIG_REQUIRED');
 const token=createHmac('sha256',root).update('geomacro-control-plane-v1').digest('hex');
 const read=async(path:string)=>{
  const response=await fetcher('https://api.geomacro.live'+path,{redirect:'error',
   headers:{Authorization:'Bearer '+token,Accept:'application/json','Cache-Control':'no-cache'},
   signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('NONBILLING_PROTECTED_READ_UNAVAILABLE');
  const raw=await response.text();
  if(Buffer.byteLength(raw)>64000)throw Error('NONBILLING_PROTECTED_READ_OVERSIZE');
  return JSON.parse(raw);
 };
 const health=await read('/v1/internal/risk-gate/signing-automation');
 const census=await read('/v1/internal/risk-gate/unified-census');
 const age=now.getTime()-Date.parse(health.last_cycle?.finished_at);
 const signerReady=health.schema==='geomacro.gro-auto-signing-health.v1'&&health.ok===true&&
  health.automation_active===true&&health.signer_pair_verified===true&&
  Number.isFinite(age)&&age>=-60000&&age<=40*60000;
 const parity=census.ok===true&&census.scope==='HOT50'&&census.expected?.total===50&&
  census.expected?.country===50&&census.expected?.corridor===0&&
  census.complete===true&&census.supabase_live_readback_verified===true&&
  census.remote_count===50&&census.remote_hash_matches===50;
 const receipts=[];
 // Each indexed hot read is bounded to one subject. No evaluation/audit writes.
 for(let offset=0;offset<RISK_GATE_HOT50.length;offset+=5){
  const batch=await Promise.all(RISK_GATE_HOT50.slice(offset,offset+5).map(async(iso3:string)=>{
   let reason='CURRENT_GRO_UNAVAILABLE',gro=null;
   try{gro=await readGro(iso3,now.toISOString(),(code:string)=>{reason=code})}catch{}
   const scores=validatedSignedCategoryScores(gro);
   const ready=!!gro&&CATEGORIES.every(key=>Number.isFinite(scores[key]));
   return {country_iso3:iso3,signed_three_category_gro_verified:ready,
    status:ready?'CURRENT_VERIFIED_THREE_CATEGORY_GRO':
     gro?'CURRENT_GRO_CATEGORIES_INCOMPLETE':reason};
  }));
  receipts.push(...batch);
 }
 const verified=receipts.filter(row=>row.signed_three_category_gro_verified).length;
 return {schema:'geomacro.risk-gate-nonbilling-readiness.v1',generated_at:now.toISOString(),
  scope:'HOT50',countries_checked:50,signer_automation_verified:signerReady,
  exact_d1_supabase_daily_parity_verified:parity,verified_three_category_country_gros:verified,
  missing_current_country_gros:50-verified,
  signed_source_handoff_ready:signerReady&&parity&&verified===50,
  tier_delivery_acceptance_verified:false,
  status:verified<50?'BLOCKED_MISSING_QUALIFIED_CURRENT_GRO':
   !signerReady?'BLOCKED_SIGNING_AUTOMATION':!parity?'BLOCKED_DAILY_PARITY':'READY_FOR_TIER_DELIVERY_ACCEPTANCE',
  no_funds:true,billing_checked:false,payment_performed:false,receipts};
}
if(import.meta.main){
 verifyNonbillingReadiness().then(report=>{
  mkdirSync('artifacts/risk-gate-nonbilling',{recursive:true});
  writeFileSync('artifacts/risk-gate-nonbilling/latest.json',JSON.stringify(report,null,2));
  const {receipts,...counts}=report;console.log(JSON.stringify(counts));
  if(!report.signed_source_handoff_ready)process.exitCode=1;
 }).catch(()=>{console.error('NONBILLING_RISK_GATE_READINESS_UNAVAILABLE');process.exitCode=1});
}

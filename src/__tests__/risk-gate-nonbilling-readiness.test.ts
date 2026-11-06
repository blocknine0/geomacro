import {describe,it,expect} from 'vitest';
import {verifyNonbillingReadiness} from '../../scripts/ops/verify-risk-gate-nonbilling-readiness';
const now=new Date('2026-11-06T12:00:00Z');
const env={GEOMACRO_COMMERCE_LEDGER_TOKEN:'test-only-root-secret-not-for-production'};
const health={schema:'geomacro.gro-auto-signing-health.v1',ok:true,automation_active:true,
 signer_pair_verified:true,last_cycle:{finished_at:now.toISOString()}};
const census={ok:true,scope:'HOT50',expected:{country:50,corridor:0,total:50},complete:true,
 supabase_live_readback_verified:true,remote_count:50,remote_hash_matches:50};
function deps(h=health,c=census){return {env,now,fetcher:async(url:any,options:any)=>{
 expect(options.redirect).toBe('error');expect(options.method).toBeUndefined();
 expect(url).not.toMatch(/billing|cloudflare|evaluate/);
 return Response.json(String(url).endsWith('signing-automation')?h:c);
 }};}
const gro={verification:{status:'VERIFIED'},commercial_eligibility:{status:'VERIFIED'},
 attribution:[{driver:'conflict',score_contribution:20},{driver:'monetary_policy',score_contribution:10},
 {driver:'critical_minerals',score_contribution:10}]};
describe('nonbilling source handoff acceptance',()=>{
 it('a healthy zero-input signing cycle and 50 metadata rows cannot substitute for real verified GROs',async()=>{
  const report=await verifyNonbillingReadiness({...deps(),readGro:async()=>null} as any);
  expect(report.signer_automation_verified).toBe(true);
  expect(report.signed_source_handoff_ready).toBe(false);
  expect(report.missing_current_country_gros).toBe(50);
  expect(report.tier_delivery_acceptance_verified).toBe(false);
  expect(report.status).toBe('BLOCKED_MISSING_QUALIFIED_CURRENT_GRO');
  expect(JSON.stringify(report)).not.toContain(env.GEOMACRO_COMMERCE_LEDGER_TOKEN);
 });
 it('all verified three-category inputs qualify only for the next delivery acceptance step',async()=>{
  const report=await verifyNonbillingReadiness({...deps(),readGro:async()=>gro} as any);
  expect(report.signed_source_handoff_ready).toBe(true);
  expect(report.verified_three_category_country_gros).toBe(50);
  expect(report.tier_delivery_acceptance_verified).toBe(false);
 });
 it('partial category coverage, stale signer health, and missing remote parity stay blocked',async()=>{
  const partial=await verifyNonbillingReadiness({...deps(),readGro:async()=>({...gro,attribution:gro.attribution.slice(0,2)})} as any);
  expect(partial.signed_source_handoff_ready).toBe(false);
  const stale=await verifyNonbillingReadiness({...deps({...health,last_cycle:{finished_at:'2026-11-06T10:00:00Z'}}),readGro:async()=>gro} as any);
  expect(stale.signer_automation_verified).toBe(false);
  const lost=await verifyNonbillingReadiness({...deps(health,{...census,remote_hash_matches:49}),readGro:async()=>gro} as any);
  expect(lost.exact_d1_supabase_daily_parity_verified).toBe(false);
 });
});

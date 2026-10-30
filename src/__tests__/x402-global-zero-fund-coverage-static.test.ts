import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {buildAgentQueryPlan} from '../lib/agent-query-plan';
import {resolveVerifiedPublishedPlanPrice} from '../lib/capability-pricing-verified-plan.server';
import {globalCoverageCases,verifyCoverageAvailability,verifyGlobalZeroFundCoverage} from '../../scripts/agentic/verify-live-x402-global-zero-fund-coverage.mjs';
const cases=globalCoverageCases();
function available(c:any){
 const plan=buildAgentQueryPlan(c.body);
 const p=resolveVerifiedPublishedPlanPrice(plan,{evidence_verified:true,rights_verified:true,signing_verified:true,
  deliverable:true,signed_object_lifecycle:'existing',change_attribution_verified:false});
 return {ok:true,chargeable:true,payment_required_now:false,execution_authorized:false,query_plan_hash:plan.query_plan_hash,
  exact_price:{...p,asset:'USDC'},availability:{deliverable:true,code:'AVAILABLE',query_plan_hash:plan.query_plan_hash,
   missing_modules:[],stale_modules:[],ineligible_source_count:0,subjects:plan.subjects.map(subject=>({subject,available_modules:plan.required_modules}))}};
}
describe('Supabase-free canonical global no-funds verification',()=>{
 it('covers all 585 exact country/category cells with signed module checks and no substitute territories',()=>{
  const countryCases=cases.filter(c=>c.category!=='corridor');
  expect(countryCases).toHaveLength(24);expect(cases).toHaveLength(32);
  for(const category of ['geopolitics','macro','rare_earth']){
   const codes=countryCases.filter(c=>c.category===category).flatMap(c=>c.subjects.map(s=>s.country_iso3));
   expect(new Set(codes).size).toBe(195);expect(codes).toContain('VAT');expect(codes).toContain('PSE');
   expect(codes).not.toContain('TWN');
  }
  for(const c of cases){expect(c.subjects.length).toBeLessThanOrEqual(25);expect(buildAgentQueryPlan(c.body).required_modules).toContain('signed_risk_object');}
 });
 it('uses exact locked capability prices and refuses mismatched plans/modules or execution authorization',()=>{
  const c=cases[0],good=available(c);expect(verifyCoverageAvailability(c,good,200).amount_usdc).toBe('0.05');
  for(const bad of [{...good,execution_authorized:true},{...good,exact_price:{...good.exact_price,amount_usdc:'0.15'}},
   {...good,query_plan_hash:'a'.repeat(64)},
   {...good,availability:{...good.availability,subjects:good.availability.subjects.map(s=>({...s,available_modules:[]}))}}])
    expect(()=>verifyCoverageAvailability(c,bad,200)).toThrow();
 });
 it('stops before provider/availability fanout when current paid health fails and preserves all untested cells',async()=>{
  const fetchImpl=vi.fn(async()=>Response.json({ok:false,public_production:{current_hot_product_ready:{intelligence:false,global_risk:false,risk_indices:false}}},{status:503}));
  const report=await verifyGlobalZeroFundCoverage({fetchImpl});
  expect(fetchImpl).toHaveBeenCalledTimes(1);expect(report.ok).toBe(false);
  expect(report.untested_country_category_cells).toBe(585);expect(report.supabase_requests).toBe(0);
  expect(report.all_195x3_current_evidence_verified).toBe(false);
 });
 it('full simulated availability is not relabeled signed customer delivery; denial stops without retries',async()=>{
  const fetchImpl=vi.fn(async(url:string,init:any)=>{
   if(url.includes('/health'))return Response.json({ok:true,public_production:{current_hot_product_ready:{intelligence:true,global_risk:true,risk_indices:true}}});
   const body=JSON.parse(init.body);const c=cases.find(x=>JSON.stringify(x.body)===JSON.stringify(body));
   return Response.json(available(c));
  });
  const pauseImpl=vi.fn(async()=>{});
  const report=await verifyGlobalZeroFundCoverage({fetchImpl,pauseImpl});
  expect(report.ok).toBe(true);expect(report.request_count).toBe(33);expect(pauseImpl).toHaveBeenCalledTimes(31);
  expect(report.verified_availability_country_category_cells).toBe(585);
  expect(report.all_195x3_current_evidence_verified).toBe(false);expect(report.actual_paid_customer_delivery_checked).toBe(false);
  fetchImpl.mockImplementation(async(url:string)=>url.includes('/health')?Response.json({ok:true,public_production:{current_hot_product_ready:{intelligence:true,global_risk:true,risk_indices:true}}}):Response.json({ok:false},{status:429}));
  fetchImpl.mockClear();const denied=await verifyGlobalZeroFundCoverage({fetchImpl,pauseImpl});
  expect(denied.ok).toBe(false);expect(fetchImpl).toHaveBeenCalledTimes(2);
 });
 it('scheduled verifier carries no frozen database credentials and retains failed proof artifacts',()=>{
  const workflow=readFileSync('.github/workflows/x402-global-zero-fund-coverage.yml','utf8');
  expect(workflow).not.toContain('SUPABASE_DB_URL');expect(workflow).not.toContain('direct_postgres');
  expect(workflow).toContain('if: always()');expect(workflow).toContain('bun scripts/agentic/verify-live-x402-global-zero-fund-coverage.mjs');
 });
});

import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('@tanstack/react-router',()=>({createFileRoute:()=>options=>({options})}));
const mocks=vi.hoisted(()=>({check:vi.fn(),config:vi.fn()}));
vi.mock('../lib/agent-query-deliverability.server',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('../lib/agent-query-deliverability.server')>();
 return {...actual,checkAgentQueryDeliverability:mocks.check};
});
vi.mock('../lib/agent-query-external-modules.server',()=>({checkAgentQueryExternalModule:vi.fn()}));
vi.mock('../lib/coinbase-x402.server',()=>({getCoinbaseX402Config:mocks.config}));
vi.mock('../lib/public-demo-rate-limit.server',()=>({allowPublicDemoRequest:()=>true}));
import {Route} from '../routes/api.x402.risk_.availability';
import {buildAgentQueryPlan} from '../lib/agent-query-plan';
const body={subjects:[{type:'country',country_iso3:'USA'}],topics:['critical_minerals'],
 delivery_tier:'structural_baseline',fulfillment_mode:'published_only',detail:'compact'};
const plan=buildAgentQueryPlan(body);
const good=()=>({deliverable:true,code:'AVAILABLE',query_plan_hash:plan.query_plan_hash,
 missing_modules:[],stale_modules:[],ineligible_source_ids:[],source_contracts:[{commercial_usage_status:'DERIVED_ONLY',attribution_required:false}],
 subjects:[{subject:plan.subjects[0],available_modules:plan.required_modules,latest_evidence_at:'2026-10-01T00:00:00Z'}]});
async function call(configure=true){if(configure)mocks.config.mockReturnValue({priceUsdc:'0.05',amountAtomic:'50000',asset:'0x'+'1'.repeat(40),network:'eip155:8453'});
 return (Route as any).options.server.handlers.POST({request:new Request('https://geomacro.live/api/x402/risk/availability',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});}
afterEach(()=>vi.clearAllMocks());
describe('legacy no-charge availability respects the canonical capability catalogue',()=>{
 it('uses verified structural digest price rather than the configured old flat price',async()=>{
  mocks.check.mockResolvedValue(good());const r=await call();const d=await r.json();
  expect(r.status).toBe(200);expect(d.exact_price.amount_usdc).toBe('0.02');expect(d.exact_price.amount_atomic).toBe('20000');
  expect(d.payment_required_now).toBe(false);expect(d.execution_authorized).toBe(false);
  expect(d.availability.source_contracts).toBeUndefined();
  expect(d.availability.ineligible_source_ids).toBeUndefined();
  expect(d.availability.ineligible_source_count).toBe(0);
 });
 it('reports genuine data status without selling or leaking details when mainnet Coinbase is locked',async()=>{
  mocks.check.mockResolvedValue(good());
  mocks.config.mockReturnValue(null);
  const response=await call(false);
  const result=await response.json();
  expect(response.status).toBe(503);
  expect(mocks.check).toHaveBeenCalledTimes(1);
  expect(result.data_deliverable_without_payment).toBe(true);
  expect(result.payment_rail_ready).toBe(false);
  expect(result.chargeable).toBe(false);
  expect(result.payment_required_now).toBe(false);
  expect(result.execution_authorized).toBe(false);
  expect(result.availability.deliverable).toBe(true);
  expect(result.availability.source_contracts).toBeUndefined();
  expect(result.error.code).toBe('COINBASE_X402_NOT_CONFIGURED');
 });
 it('does not advertise a price for unavailable or unbound evidence',async()=>{
  mocks.check.mockResolvedValue({...good(),deliverable:false,code:'INSUFFICIENT_COVERAGE'});
  const r=await call();expect(r.status).toBe(422);expect((await r.json()).exact_price).toBe(null);
  mocks.check.mockResolvedValue({...good(),query_plan_hash:'a'.repeat(64)});
  const rejected=await call();expect(rejected.status).toBe(422);expect((await rejected.json()).chargeable).toBe(false);
 });
});

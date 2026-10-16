import {afterEach,describe,expect,it,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {consumeCentralSecurityBudget,SECURITY_COUNTER_SQL,SECURITY_CLIENT_COUNTER_SQL} from '../../workers/control-plane/src/central-security-budget.mjs';
import {consumeD1CentralSecurityBudget,centralSecurityBudgetFailureCode} from '../lib/d1-central-security-budget.server';
import {enforceCentralRequestSecurity} from '../lib/central-security.server';
import worker from '../../workers/control-plane/src/index.mjs';
const initialRoot=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
const initialPepper=process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER;
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();
 if(initialRoot===undefined)delete process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;else process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN=initialRoot;
 if(initialPepper===undefined)delete process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER;else process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER=initialPepper;
});
function dbWithCounts(counts=[1,1]){return {
 prepare:(sql:string)=>({bind:(...params:unknown[])=>({sql,params})}),
 batch:vi.fn(async()=>counts.map(n=>({success:true,results:[{request_count:n}]}))),
};}
const input={route_class:'api_write',client_key:'a'.repeat(64)};
describe('Supabase-free distributed central security',()=>{
 it('reports fixed safe configuration/auth/route failures without reflecting secret-bearing messages',async()=>{
  for(const [status,code] of [[401,'CENTRAL_SECURITY_D1_AUTH_REJECTED'],[403,'CENTRAL_SECURITY_D1_AUTH_REJECTED'],[404,'CENTRAL_SECURITY_D1_ROUTE_NOT_READY'],[405,'CENTRAL_SECURITY_D1_ROUTE_NOT_READY']]){
   process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN='r'.repeat(64);
   try{await consumeD1CentralSecurityBudget('api_write',input.client_key,async()=>new Response('untrusted secret-bearing provider message',{status}));throw Error('EXPECTED_REJECTION');}
   catch(e){expect(centralSecurityBudgetFailureCode(e)).toBe(code);}
  }
  delete process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
  try{await consumeD1CentralSecurityBudget('api_write',input.client_key);throw Error('EXPECTED_REJECTION');}
  catch(e){expect(centralSecurityBudgetFailureCode(e)).toBe('CENTRAL_SECURITY_D1_CONFIGURATION_REQUIRED');}
  expect(centralSecurityBudgetFailureCode(Error('secret-value-leak'))).toBe('CENTRAL_SECURITY_UNAVAILABLE');
 });
 it('classifies network/timeout/upstream failures without retrying or leaking provider data',async()=>{
  process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN='r'.repeat(64);
  const network=vi.fn(async()=>{throw TypeError('secret-bearing upstream URL');});
  await expect(consumeD1CentralSecurityBudget('api_write',input.client_key,network)).rejects.toThrow('D1_SECURITY_BUDGET_TRANSPORT_FAILED');
  expect(network).toHaveBeenCalledTimes(1);
  expect(centralSecurityBudgetFailureCode(Error('D1_SECURITY_BUDGET_TRANSPORT_FAILED'))).toBe('CENTRAL_SECURITY_D1_TRANSPORT_FAILED');
  const controller=new AbortController();controller.abort();
  vi.spyOn(AbortSignal,'timeout').mockReturnValue(controller.signal);
  await expect(consumeD1CentralSecurityBudget('api_write',input.client_key,network)).rejects.toThrow('D1_SECURITY_BUDGET_TIMEOUT');
  expect(centralSecurityBudgetFailureCode(Error('D1_SECURITY_BUDGET_TIMEOUT'))).toBe('CENTRAL_SECURITY_D1_TIMEOUT');
  await expect(consumeD1CentralSecurityBudget('api_write',input.client_key,async()=>new Response('private',{status:503}))).rejects.toThrow('D1_SECURITY_BUDGET_UPSTREAM_REJECTED');
  expect(centralSecurityBudgetFailureCode(Error('D1_SECURITY_BUDGET_UPSTREAM_REJECTED'))).toBe('CENTRAL_SECURITY_D1_UPSTREAM_REJECTED');
 });
 it('bounds streamed bytes and rejects malformed or truncated receipts safely',async()=>{
  process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN='r'.repeat(64);
  let cancelled=false;
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(2049));},cancel(){cancelled=true;}});
  await expect(consumeD1CentralSecurityBudget('api_write',input.client_key,async()=>new Response(stream))).rejects.toThrow('D1_SECURITY_BUDGET_INVALID');
  expect(cancelled).toBe(true);
  for(const payload of ['not JSON',new Uint8Array([255])]){
   await expect(consumeD1CentralSecurityBudget('api_write',input.client_key,async()=>new Response(payload))).rejects.toThrow('D1_SECURITY_BUDGET_INVALID');
  }
  const broken=new ReadableStream({pull(c){c.error(Error('private transport details'));}});
  await expect(consumeD1CentralSecurityBudget('api_write',input.client_key,async()=>new Response(broken))).rejects.toThrow('D1_SECURITY_BUDGET_TRANSPORT_FAILED');
 });
 it('runs both counters in one transaction with server clocks, private slots and fixed limits',async()=>{
  const db=dbWithCounts();expect(await consumeCentralSecurityBudget(db,input,{now:60001})).toMatchObject({allowed:true,store:'d1',retry_after_seconds:60});
  const plans=db.batch.mock.calls[0][0];
  expect(plans.map(x=>x.params)).toEqual([
   ['api_write','global','all',60,1201],['api_write','client','aaaaaa','api_write',61],
  ]);
  const source=readFileSync('src/lib/central-security.server.ts','utf8');
  expect(source).not.toContain('requireRiskSupabase');
 });
 it('actual SQLite enforces client/global saturation, shared global counters and window rollover',()=>{
  const result=execFileSync('python3',['-c',`import json,sqlite3,sys
x=json.load(sys.stdin);db=sqlite3.connect(':memory:');db.executescript(x['migration'])
def reserve(key,start=60):
 with db:
  g=db.execute(x['sql'],['api_write','global','all',start,1201]).fetchone()[0]
  c=db.execute(x['client_sql'],['api_write','client',key,'api_write',61]).fetchone()[0]
 return g<=1200 and c<=60,g,c
a=[reserve('aaaaaa') for _ in range(65)]
b=[reserve(format(i,'06x')) for i in range(1200)]
c=reserve('aaaaaa',120)
late=reserve('aaaaaa',60)
current=reserve('aaaaaa',120)
late_new=reserve('bbbbbb',60)
current_new=reserve('bbbbbb',120)
print(json.dumps({'client':a,'global':b,'reset':c,'late':late,'current':current,'late_new':late_new,'current_new':current_new,'rows':db.execute('select count(*) from central_security_budget').fetchone()[0]}))`],{
    input:JSON.stringify({sql:SECURITY_COUNTER_SQL,client_sql:SECURITY_CLIENT_COUNTER_SQL,migration:readFileSync('workers/control-plane/migrations/0019_central_security_budget.sql','utf8')}),encoding:'utf8'});
  const d=JSON.parse(result);expect(d.client.slice(0,60).every(x=>x[0])).toBe(true);
  expect(d.client.slice(60).every(x=>!x[0]&&x[2]===61)).toBe(true);
  expect(d.global.filter(x=>x[0])).toHaveLength(1135);
  expect(d.global.at(-1)).toEqual([false,1201,1]);expect(d.reset).toEqual([true,1,1]);
  expect(d.late).toEqual([true,2,2]);expect(d.current).toEqual([true,3,3]);
  expect(d.late_new).toEqual([true,4,1]);expect(d.current_new).toEqual([true,5,2]);
 });
 it('denies either exhausted budget and rejects caller limits, invalid keys, or malformed DB results',async()=>{
  for(const counts of [[1,61],[1201,1]])expect((await consumeCentralSecurityBudget(dbWithCounts(counts),input)).allowed).toBe(false);
  for(const bad of [{...input,global_limit:99999},{...input,client_key:'raw-ip'},{...input,route_class:'__proto__'}])
   await expect(consumeCentralSecurityBudget(dbWithCounts(),bad)).rejects.toThrow('INVALID_SECURITY');
  await expect(consumeCentralSecurityBudget({...dbWithCounts(),batch:async()=>[]},input)).rejects.toThrow('UNAVAILABLE');
 });
 it('requires control-plane authentication before D1 access',async()=>{
  const db=dbWithCounts();const r=await worker.fetch(new Request('https://test/v1/security/budget',{method:'POST',body:JSON.stringify(input)}),{DB:db,CONTROL_PLANE_TOKEN:'p'.repeat(64)});
  expect(r.status).toBe(401);expect(db.batch).not.toHaveBeenCalled();
  const allowed=await worker.fetch(new Request('https://test/v1/security/budget',{method:'POST',headers:{Authorization:'Bearer '+'p'.repeat(64)},body:JSON.stringify(input)}),{DB:db,CONTROL_PLANE_TOKEN:'p'.repeat(64)});
  expect(allowed.status).toBe(200);expect((await allowed.json()).store).toBe('d1');
 });
 it('uses the pinned HTTPS endpoint and accepts only bound strict D1 receipts',async()=>{
  process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN='r'.repeat(64);
  const good={ok:true,schema:'geomacro.central-security-budget.v1',store:'d1',route_class:'api_write',allowed:true,retry_after_seconds:60};
  const fetchImpl=vi.fn(async()=>Response.json(good));
  await consumeD1CentralSecurityBudget('api_write',input.client_key,fetchImpl);
  expect(fetchImpl.mock.calls[0][0]).toBe('https://geomacro-control-plane.daspallab202391.workers.dev/v1/security/budget');
  expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');
  for(const bad of [{...good,store:'supabase'},{...good,route_class:'payment'},{...good,allowed:false},{...good,retry_after_seconds:Infinity}])
   await expect(consumeD1CentralSecurityBudget('api_write',input.client_key,async()=>Response.json(bad))).rejects.toThrow();
 });
 it('keeps free canonical Finds GET available under D1 outage while paid POST fails closed',async()=>{
  process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN='r'.repeat(64);
  process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER='s'.repeat(64);
  vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.stubGlobal('fetch',vi.fn(async()=>{throw TypeError('upstream network unavailable');}));
  const input={pathname:'/api/v1/intelligence/query',headers:new Headers({'cf-connecting-ip':'203.0.113.247'})};
  expect(await enforceCentralRequestSecurity({...input,method:'GET'})).toMatchObject({allowed:true,routeClass:'public_api',code:'CENTRAL_SECURITY_LOCAL_DEGRADED_PASS'});
  expect(await enforceCentralRequestSecurity({...input,method:'POST'})).toMatchObject({allowed:false,status:503,routeClass:'payment'});
 });
 it('keeps middleware distributed enforcement on POST and fails closed on D1 outage',async()=>{
  process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN='r'.repeat(64);
  process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER='s'.repeat(64);
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const fetchMock=vi.fn(async()=>Response.json({ok:true,schema:'geomacro.central-security-budget.v1',store:'d1',route_class:'api_write',allowed:true,retry_after_seconds:60}));
  vi.stubGlobal('fetch',fetchMock);
  const request={pathname:'/api/demo/preflight',method:'POST',headers:new Headers({'cf-connecting-ip':'203.0.113.249'})};
  expect(await enforceCentralRequestSecurity(request)).toMatchObject({allowed:true,code:'CENTRAL_SECURITY_DISTRIBUTED_PASS'});
  fetchMock.mockImplementation(async()=>{throw Error('outage')});
  expect(await enforceCentralRequestSecurity(request)).toMatchObject({allowed:false,status:503,code:'CENTRAL_SECURITY_D1_TRANSPORT_FAILED'});
 });
});

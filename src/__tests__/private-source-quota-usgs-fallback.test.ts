import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {checkPrivateScoringB2Headroom} from '../../scripts/ops/check-private-scoring-b2-headroom.mjs';
import {B2_DAILY_LIMITS} from '../../workers/control-plane/src/b2-account-quota.mjs';
import {PRODUCTION_FREE_UPDATE_SOURCES,USGS_MCS_OFFICIAL_LANDING_URL,
  probeProductionFreeUpdateSource} from '../../scripts/lib/free-source-production-updates.mjs';
const today=new Date('2026-10-17T01:30:00Z');
const status=(used:Record<string,number>)=>({
  ok:true,schema:'geomacro.b2-account-quota-status.v1',
  day_utc:'2026-10-17',limits:{...B2_DAILY_LIMITS},
  used:{total:0,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0,...used},
  account_wide_reporting_requires_all_clients_governed:true,
});
const mcs=PRODUCTION_FREE_UPDATE_SOURCES.find(x=>x.id==='usgs_mcs')!;
describe('private current-source recovery: free quota and official MCS fallback',()=>{
 it('admits read-only verified quota status and never claims event or commercial rights',async()=>{
   const governor={status:vi.fn(async()=>status({}))};
   const x=await checkPrivateScoringB2Headroom({governor,now:today});
   expect(governor.status).toHaveBeenCalledTimes(1);
   expect(x).toMatchObject({admitted:true,required_get_tickets:3,
     required_put_tickets:3,b2_requests:0,current_event_verified:false,
     commercial_eligible:false,guaranteed_future_b2_reservations:false});
 });
 it('quota exhaustion holds before classifier and cannot be passed off as readiness',async()=>{
   const x=await checkPrivateScoringB2Headroom({
     governor:{status:async()=>status({total:77,GET:23,PUT:54})},now:today});
   expect(x.admitted).toBe(false);
   expect(x.reason).toBe('QUOTA_HELD_NO_CLASSIFIER_CLAIM');
   await expect(checkPrivateScoringB2Headroom({
     governor:{status:async()=>({...status({}),day_utc:'2026-10-16'})},now:today,
   })).rejects.toThrow('GOVERNED_B2_HEADROOM_D1_STATUS_UNVERIFIED');
 });
 it('workflow gates ALL classifier, archive and GRI continuation behind shared headroom',()=>{
   const wf=readFileSync('.github/workflows/restricted-private-current-scoring.yml','utf8');
   const preflight=wf.indexOf('id: headroom');
   const claim=wf.indexOf('name: Score three bounded domains');
   expect(preflight).toBeGreaterThan(wf.indexOf('D1_DATABASE_ID=$DB_ID'));
   expect(claim).toBeGreaterThan(preflight);
   for(const name of [
     'Score three bounded domains','Publish privacy-safe stage rejection',
     'Prove genuine original-source','Verify one private B2 bundle',
     'Prepare source-bound canonical','Independently verify private GRI',
   ]){
     const start=wf.indexOf('      - name: '+name);
     const end=wf.indexOf('\n      - name: ',start+1);
     expect(start).toBeGreaterThan(preflight);
     expect(wf.slice(start,end<0?undefined:end)).toContain(
       "steps.headroom.outputs.admitted == 'true'");
   }
   expect(wf).not.toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.');
 });
 it('network-unavailable USGS annual baseline uses at most one exact same-publisher official landing, never current evidence',async()=>{
   const urls:string[]=[];
   const fetchImpl=vi.fn(async(url:string)=>{
     urls.push(url);
     if(url===mcs.url)throw Error('network timeout');
     expect(url).toBe(USGS_MCS_OFFICIAL_LANDING_URL);
     return new Response('<!doctype html><html><h1>National Minerals Information Center</h1><h2>Mineral Commodity Summaries 2026</h2></html>');
   });
   const x=await probeProductionFreeUpdateSource(mcs,fetchImpl,today);
   expect(urls).toEqual([mcs.url,USGS_MCS_OFFICIAL_LANDING_URL]);
   expect(x.result.state).toBe('TRANSPORT_READABLE');
   expect(x.official_fallback_used).toBe(true);
   expect(x.observed).toMatchObject({kind:'CONTEXT_ONLY_NO_UPDATE_RECORDS',
     sampled_records:0,latest_native_publication_at:null,
     independently_verified_event:false});
 });
 it('USGS denial never bypassed; wrong alternate contents never upgraded',async()=>{
   let calls=0;
   const denied=await probeProductionFreeUpdateSource(mcs,async()=>{calls++;return new Response('denied',{status:403});},today);
   expect(calls).toBe(1);expect(denied.result.state).toBe('DENIED_OR_RATE_LIMIT');
   const fake=await probeProductionFreeUpdateSource(mcs,async(url:string)=>
     url===mcs.url ? Promise.reject(Error('offline')) :
     Promise.resolve(new Response('<html><body>Other USGS page</body></html>')),today);
   expect(fake.official_fallback_used).toBe(false);
   expect(fake.result.state).toBe('NETWORK_UNAVAILABLE');
   expect(fake.observed).toBeNull();
 });
});

#!/usr/bin/env node
// Offline deployment/PR guard. Synthetic D1 only: no publisher, partner,
// credential service, Supabase, B2 or payment requests.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {predgeResearchDerivedNewsFeed,PREDGE_RESEARCH_PILOT_END_UTC}
 from '../../workers/control-plane/src/predge-research-derived-news.mjs';
import {CENTRAL_SECURITY_POLICIES} from '../../workers/control-plane/src/central-security-policies.mjs';
const expectedSchedules={
 'five-minute-original-news-fastlane.yml':['2-57/5 * * * *'],
 'website-derived-news-continuity.yml':['7 * * * *'],
 'website-derived-news-cadence-backstop.yml':['22,52 * * * *'],
 'predge-research-continuity.yml':['17 * * * *'],
};
const expectedPolicy={schema:'geomacro.predge-research-continuity-lock.v1',
 categories:['geopolitics','macro','rare_earth'],projection:'attributed_research',retention_hours:72,
 original_release_delay_minutes:0,daily_utc_request_hard_cap:500,maximum_source_check_age_minutes:90,
 pilot_end:'2027-01-17T00:00:00.000Z',source_attribution_required:true,raw_upstream_delivered:false,
 commercial_resale_authorized:false,execution_authorized:false,schedules:expectedSchedules};
const fail=code=>{throw Error('PREDGE_CONTINUITY_LOCK_'+code)};
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
 Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
export function readContinuityLock(){
 const policy=JSON.parse(readFileSync(new URL('../../config/predge-research-continuity-lock.v1.json',import.meta.url),'utf8'));
 const workflows=Object.fromEntries(Object.keys(expectedSchedules).map(name=>[name,
  readFileSync(new URL('../../.github/workflows/'+name,import.meta.url),'utf8')]));
 return {policy,workflows};
}
export function assertContinuityLock({policy,workflows}){
 // Every protected value must be explicit; JSON formatting and key order may vary.
 if(canonical(policy)!==canonical(expectedPolicy))fail('POLICY_DRIFT');
 if(PREDGE_RESEARCH_PILOT_END_UTC!==policy.pilot_end||
  CENTRAL_SECURITY_POLICIES.predge_research_news.perClient!==500||
  CENTRAL_SECURITY_POLICIES.predge_research_news.global!==500||
  CENTRAL_SECURITY_POLICIES.predge_research_news.failClosed!==true)fail('GOVERNOR_DRIFT');
 for(const [name,expected] of Object.entries(expectedSchedules)){
  const text=workflows[name]??'';
  const crons=[...text.matchAll(/^    - cron: ["']([^"']+)["']\s*$/gmu)].map(m=>m[1]);
  if(!/^  schedule:\s*$/mu.test(text)||JSON.stringify(crons)!==JSON.stringify(expected))fail('SCHEDULE_DRIFT');
  if(!/^  cancel-in-progress: false\s*$/mu.test(text))fail('CANCELLATION_DRIFT');
  if(/if:\s*(?:false|\$\{\{\s*false\s*\}\})\s*$/mu.test(text))fail('PRODUCER_DISABLED');
 }
 for(const [name,required] of Object.entries({
  'five-minute-original-news-fastlane.yml':['original-five-minute-derived-news:','bun scripts/ops/publish-original-news-five-minute-fastlane.ts'],
  'website-derived-news-continuity.yml':['refresh-derived-news:','bun scripts/ops/publish-website-derived-news.ts'],
  'website-derived-news-cadence-backstop.yml':['catch-up-derived-only:','node scripts/ops/check-website-derived-news-cadence.mjs'],
 }))if(required.some(token=>!workflows[name].includes(token)))fail('PRODUCER_DRIFT');
 const watch=workflows['predge-research-continuity.yml'];
 for(const required of ['workflows: ["Website Derived News Continuity"]','recover-missed-publication:',
  'node scripts/ops/check-website-derived-news-cadence.mjs','steps.decide.outputs.should_run == \'true\'',
  'workflow_run.head_repository.full_name == github.repository',
  'node scripts/ops/verify-predge-continuity-lock.mjs',
  'node scripts/ops/verify-predge-pilot-continuity.mjs'])
  if(!watch.includes(required))fail('WATCHDOG_DRIFT');
 if(/if:\s*(?:false|\$\{\{\s*false\s*\}\})\s*$/mu.test(watch))fail('WATCHDOG_DISABLED');
 return {policy_sha256:createHash('sha256').update(canonical(policy)).digest('hex')};
}
export async function verifyContinuityRuntime(){
 const now=Date.parse('2026-10-24T14:00:00Z'),token='a'.repeat(64);
 const categories=['geopolitics','macro','rare_earth'];
 const rows=categories.map((category,i)=>({id:category+'-12345678',category,
  title:'Geomacro finds an official policy development in the sector',
  what_changed:'An original official release concerns a policy development in the sector.',
  why_it_matters:'This official observation may inform context, while actual effects require separate verification.',
  topic:['foreign policy','monetary policy','critical-minerals policy'][i],development_type:'policy update',
  geography:null,published_at:'2026-10-24T13:00:00.000Z',date_precision:'exact',observed_release_count:1,
  sources_credited:[['Contains public sector information licensed under the Open Government Licence v3.0.',
   'Statistics Canada','Natural Resources Canada'][i]],
  status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null}));
 let quotaCalls=0;
 const env={PREDGE_RESEARCH_NEWS_TOKEN:token,DB:{batch:async()=>{quotaCalls++;
  return [{success:true,results:[{request_count:1}]},{success:true,results:[{request_count:1}]}];},
  prepare:sql=>({bind:(...args)=>({all:async()=>({results:sql.includes('pipeline_checkpoint')?[]:
   rows.slice(args[2]??0,(args[2]??0)+251).map(story=>({story_json:JSON.stringify(story)}))})})})}};
 const url='https://fixture.invalid/v1/partner/predge/derived-structural-72h';
 const anonymous=await predgeResearchDerivedNewsFeed(new Request(url),env,now);
 const response=await predgeResearchDerivedNewsFeed(new Request(url,{headers:{authorization:'Bearer '+token}}),env,now);
 const body=await response.json();
 if(anonymous.status!==401||response.status!==200||quotaCalls!==1||
    response.headers.get('cache-control')!=='private, no-store'||
    response.headers.has('access-control-allow-origin')||
    body.projection!=='attributed_research'||body.attribution_must_be_preserved!==true||
    body.retention_hours!==72||body.original_release_delay_minutes!==0||
    body.daily_utc_request_hard_cap!==500||body.chargeable!==false||
    body.raw_upstream_delivered!==false||body.execution_authorized!==false||
    body.partner_resale_or_commercial_redistribution_authorized!==false||
    body.items?.length!==3||categories.some(c=>body.counts?.[c]!==1)||
    body.items.some(item=>item.sources_credited?.length!==1||item.attribution_required!==true||
      !Array.isArray(item.attribution_notices)||item.original_published_at!=='2026-10-24T13:00:00.000Z'||
      item.qualifying_topic_release_verified!==true||item.payable!==false))fail('RUNTIME_REGRESSION');
 return {three_category_attributed_delivery_locked:true,anonymous_denied:true,quota_enforced:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const policy=assertContinuityLock(readContinuityLock());
  const runtime=await verifyContinuityRuntime();
  console.log(JSON.stringify({schema:'geomacro.predge-continuity-lock-receipt.v1',...policy,...runtime,
   synthetic_only:true,network_requests:0,payments:0}));
 }catch(e){const code=String(e?.message??'');
  console.error(code.startsWith('PREDGE_CONTINUITY_LOCK_')?code:'PREDGE_CONTINUITY_LOCK_UNVERIFIED');
  process.exitCode=1;
 }
}

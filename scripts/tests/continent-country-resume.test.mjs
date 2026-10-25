import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTINENT_COUNTRIES_195,planTwoHourContinentCountrySweep} from '../lib/continent-country-195-rotation.mjs';
import {parseCanonical195Codes} from '../lib/country-195-proof-rollup.mjs';
import {countryProbeArtifactName,previousScheduledCountry,restoreScheduledCountry} from '../lib/continent-country-resume.mjs';
const registryText=readFileSync('src/lib/canonical-country-registry-195.ts','utf8');
const known=parseCanonical195Codes(registryText),now=new Date('2026-10-24T12:00:00Z');
function checkpoint(iso='AGO',continent='africa'){
 return {schema:'geomacro.195-country-safe-readonly-batch.v2',
  probe_started_at:'2026-10-23T08:23:00Z',probe_finished_at:'2026-10-23T08:25:00Z',
  batch_start:known.indexOf(iso),batch_count:1,category_count:3,observed_cells:3,
  countries_actually_tested:1,requests_per_country_cap:12,original_pages_per_country_cap:4,
  total_country_baseline:195,total_category_cells:585,source_urls_logged:false,
  source_titles_logged:false,raw_data_persisted:false,supabase_requests:0,b2_requests:0,
  real_money_payments:0,commercial_rights_verified:0,signed_delivery_verified:0,
  continent_source_group:continent,scheduled_country_iso3:iso,
  cells:['geopolitics','macro','rare_earth'].map(category=>({iso3:iso,category,
   ROUTING_VERIFIED:true,SOURCE_ADAPTER_REGISTERED:true,
   LIVE_SOURCE_REACHABLE:false,COUNTRY_RELEVANCE_VERIFIED:false,
   ORIGINAL_EVIDENCE_VERIFIED:false,ORIGINAL_PAGE_VERIFIED:false,
   INDEPENDENT_FALLBACK_VERIFIED:false,RIGHTS_QUALIFIED:null,SIGNED_DELIVERY_VERIFIED:null,
   original_page_publication_utc:null,original_publisher_families_reached:0,
   original_country_relevant_candidates:0,original_pages_verified:0,
   independent_verified_publisher_families:0,restricted_publisher_attempts:0,
   rate_limited_publisher_attempts:0,NO_QUALIFYING_EVIDENCE_FOUND:false,
   BLOCKED:"PROVIDER_UNAVAILABLE",verdict:"SOURCE_BLOCKED"}))};
}
const run={id:123,run_attempt:1,event:'schedule',conclusion:'success',status:'completed',
 head_branch:'main',path:'.github/workflows/continent-country-africa-2h.yml'};
function restore({runs=[run],artifacts=[{name:countryProbeArtifactName(123,'africa'),expired:false}],report=checkpoint(),github,download}={}){
 return restoreScheduledCountry({continent:'africa',registryText,now,
  github:github??(async path=>path.includes('/workflows/')?{workflow_runs:runs}:{artifacts}),
  download:download??(async()=>report)});
}
test('delayed and dropped schedule slots never skip any of the 195 country positions',()=>{
 const visited=[];
 for(const [continent,members] of Object.entries(CONTINENT_COUNTRIES_195)){
  let previousCountryIso3='';
  for(let index=0;index<members.length;index++){
   const plan=planTwoHourContinentCountrySweep({continent,registryText,previousCountryIso3,
    now:new Date(now.getTime()+index*7*3600000)}); // repeated long scheduler delays
   assert.equal(plan.country_iso3,members[index]);
   assert.equal(plan.trigger,'RESUME_SUCCESSFUL_SCHEDULE');
   visited.push(plan.country_iso3);previousCountryIso3=plan.country_iso3;
  }
  assert.equal(planTwoHourContinentCountrySweep({continent,registryText,previousCountryIso3,now}).country_iso3,members[0]);
 }
 assert.equal(new Set(visited).size,195);
});
test('failed probe does not advance: the same previous success selects the same next country',()=>{
 const args={continent:'africa',registryText,previousCountryIso3:'AGO'};
 assert.equal(planTwoHourContinentCountrySweep({...args,now}).country_iso3,'BDI');
 assert.equal(planTwoHourContinentCountrySweep({...args,now:new Date('2026-10-26T18:00:00Z')}).country_iso3,'BDI');
 assert.throws(()=>planTwoHourContinentCountrySweep({...args,now,previousCountryIso3:'IND'}),/PREVIOUS_SCHEDULED_COUNTRY_INVALID/);
});
test('restores authentic successful schedule checkpoint even when no current original was found',async()=>{
 assert.equal(await restore(),'AGO');
 assert.equal(await restore({artifacts:[{name:'live-country-195-resume-123',expired:false}]}),'AGO');
});
test('only genuinely empty successful-schedule history initializes first country',async()=>{
 assert.equal(await restore({runs:[],download:()=>assert.fail('unexpected download')}),'');
 for(const bad of [{event:'workflow_dispatch'},{head_branch:'other'},{conclusion:'failure'},{path:'other.yml'}]){
  await assert.rejects(restore({runs:[{...run,...bad}]}),/HISTORY_INVALID/);
 }
});
test('missing, expired and wrong-continent artifacts fail instead of resetting rotation',async()=>{
 for(const artifacts of [[],[{name:countryProbeArtifactName(123,'africa'),expired:true}],
  [{name:countryProbeArtifactName(123,'asia'),expired:false}]]){
  await assert.rejects(restore({artifacts}),/CHECKPOINT_UNAVAILABLE/);
 }
 await assert.rejects(restore({github:async()=>{throw Error('API unavailable')}}),/API unavailable/);
 await assert.rejects(restore({download:async()=>{throw Error('download failed')}}),/download failed/);
});
test('checkpoint must bind canonical country index, continent, all three cells and non-commercial proof',()=>{
 assert.equal(previousScheduledCountry(checkpoint(),'africa',registryText,now),'AGO');
 for(const mutation of [r=>r.scheduled_country_iso3='BDI',r=>r.continent_source_group='asia',
  r=>r.batch_start++,r=>r.cells[0].SIGNED_DELIVERY_VERIFIED=true,r=>r.cells.pop()]){
  const report=checkpoint();mutation(report);
  assert.throws(()=>previousScheduledCountry(report,'africa',registryText,now));
 }
});
test('newest run ID wins over older reruns and attempt-specific artifacts remain separate',async()=>{
 let requested;
 assert.equal(await restore({runs:[{...run,id:122,run_attempt:9},run],
  github:async path=>{
   if(path.includes('/workflows/'))return {workflow_runs:[{...run,id:122,run_attempt:9},run]};
   requested=path;return {artifacts:[{name:countryProbeArtifactName(123,'africa'),expired:false}]};
  }}),'AGO');
 assert.match(requested,/runs\/123\/artifacts/);
 const names=Object.keys(CONTINENT_COUNTRIES_195).flatMap(c=>[1,2].map(a=>countryProbeArtifactName(123,c,a)));
 assert.equal(new Set(names).size,12);
});
test('wrapper permissions permit checkpoint reads; reusable keeps canary and manual events out of cursor writes',()=>{
 for(const continent of Object.keys(CONTINENT_COUNTRIES_195)){
  assert.match(readFileSync(`.github/workflows/continent-country-${continent}-2h.yml`,'utf8'),/actions: read/);
 }
 const shared=readFileSync('.github/workflows/continent-country-original-probe-reusable.yml','utf8');
 assert.match(shared,/GEOMACRO_CONTINENT_CANARY_ONLY/);
 assert.ok(shared.includes('name: live-country-195-resume-${{ github.run_id }}-${{ inputs.continent }}-${{ github.run_attempt }}'));
 const audit=readFileSync('scripts/ops/aggregate-country-195-proofs.mjs','utf8');
 assert.ok(audit.includes('run._continent'));
});

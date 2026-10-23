import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTINENT_COUNTRIES_195} from '../lib/continent-country-195-rotation.mjs';
import {parseCanonical195Codes,rollupCountry195Proofs} from '../lib/country-195-proof-rollup.mjs';
import {planFullContinentSweep,runFullContinentSweep,fullSweepCountryReports} from '../lib/continent-country-full-sweep.mjs';
const registryText=readFileSync('src/lib/canonical-country-registry-195.ts','utf8');
const codes=parseCanonical195Codes(registryText),now=new Date('2026-10-24T12:00:00Z');
function report(iso,continent){return {
 schema:'geomacro.195-country-safe-readonly-batch.v2',
 probe_started_at:'2026-10-24T11:00:00Z',probe_finished_at:'2026-10-24T11:01:00Z',
 batch_start:codes.indexOf(iso),batch_count:1,category_count:3,observed_cells:3,
 countries_actually_tested:1,requests_per_country_cap:12,original_pages_per_country_cap:4,
 total_country_baseline:195,total_category_cells:585,source_urls_logged:false,source_titles_logged:false,
 raw_data_persisted:false,supabase_requests:0,b2_requests:0,real_money_payments:0,
 commercial_rights_verified:0,signed_delivery_verified:0,scheduled_country_iso3:iso,
 continent_source_group:continent,cells:['geopolitics','macro','rare_earth'].map(category=>({
  iso3:iso,category,ROUTING_VERIFIED:true,LIVE_SOURCE_REACHABLE:false,COUNTRY_RELEVANCE_VERIFIED:false,
  ORIGINAL_EVIDENCE_VERIFIED:false,ORIGINAL_PAGE_VERIFIED:false,
  INDEPENDENT_FALLBACK_VERIFIED:false,RIGHTS_QUALIFIED:null,SIGNED_DELIVERY_VERIFIED:null}))};}
const plan=continent=>planFullContinentSweep({continent,registryText,eventName:'schedule'});
async function sweep(continent,runCountry=async iso=>report(iso,continent)){
 return runFullContinentSweep(plan(continent),{registryText,now:()=>now,runCountry});
}
test('each two-hour tick selects all 195 countries once across exactly three categories',async()=>{
 const reports=[],attempts=[];
 for(const [continent,members] of Object.entries(CONTINENT_COUNTRIES_195)){
  const p=plan(continent);
  assert.deepEqual(p.countries,members);
  assert.equal(p.provider_requests_cap,12*members.length);
  assert.equal(p.original_page_requests_cap,4*members.length);
  const receipt=await sweep(continent,async(iso,index)=>{
   assert.equal(codes[index],iso);attempts.push(iso);return report(iso,continent);
  });
  assert.equal(receipt.complete,true);
  assert.equal(receipt.completed_category_cells,members.length*3);
  reports.push(...fullSweepCountryReports(receipt,continent,registryText,now));
  assert.deepEqual(plan(continent).countries,members); // next tick repeats WHOLE continent
 }
 assert.equal(attempts.length,195);assert.equal(new Set(attempts).size,195);
 const out=rollupCountry195Proofs(reports,codes,{now});
 assert.equal(out.distinct_probed_countries,195);assert.equal(out.cells_probed,585);
 assert.equal(out.complete_195x3_current_live_original_coverage_verified,false);
});
test('two in-run workers share the country list without spawning one Actions job per country',async()=>{
 let active=0,peak=0;
 const receipt=await sweep('south_america',async iso=>{
  active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,2));active--;return report(iso,'south_america');
 });
 assert.equal(peak,2);assert.equal(receipt.countries_completed,12);
});
test('failed country does not cancel the other countries or claim complete coverage',async()=>{
 let attempts=0;
 const receipt=await sweep('oceania',async iso=>{
  attempts++;if(iso==='FJI')throw Error('timeout');return report(iso,'oceania');
 });
 assert.equal(attempts,14);assert.equal(receipt.complete,false);
 assert.equal(receipt.countries_completed,13);assert.equal(receipt.failures[0].country_iso3,'FJI');
 assert.throws(()=>fullSweepCountryReports(receipt,'oceania',registryText,now),/INCOMPLETE_OR_WRONG_SCOPE/);
});
test('scheduled runs cannot silently become pinned or one-country canaries',()=>{
 for(const args of [{requestedIso3:'IND'},{canaryOnly:true}])
  assert.throws(()=>planFullContinentSweep({continent:'asia',registryText,eventName:'schedule',...args}),/SCHEDULE_MUST_COVER_ALL/);
 const manual=planFullContinentSweep({continent:'asia',registryText,eventName:'workflow_dispatch',requestedIso3:'IND'});
 assert.deepEqual(manual.countries,['IND']);
 assert.throws(()=>planFullContinentSweep({continent:'asia',registryText,eventName:'workflow_dispatch',requestedIso3:'USA'}),/MANUAL_COUNTRY_INVALID/);
 const canary=planFullContinentSweep({continent:'asia',registryText,eventName:'push',canaryOnly:true});
 assert.deepEqual(canary.countries,['AFG']);
});
test('full checkpoint must include every expected country in correct scope, without duplicated or wrong-category proof',async()=>{
 const valid=await sweep('south_america');
 for(const mutate of [r=>r.reports.pop(),r=>r.reports[1]=r.reports[0],
  r=>r.expected_countries.reverse(),r=>r.scope='POST_MERGE_CANARY',
  r=>r.reports[0].cells[0].category='extra',r=>r.reports[0].continent_source_group='asia']){
  const changed=structuredClone(valid);mutate(changed);
  assert.throws(()=>fullSweepCountryReports(changed,'south_america',registryText,now));
 }
 assert.equal(fullSweepCountryReports(report('ARG','south_america'),'south_america',registryText,now).length,1);
});
test('all six cron starts stay 20 UTC minutes apart, repeat each two hours and default to a full continent',()=>{
 const offsets=[];
 for(const [continent,minute,odd] of [['africa',4,false],['asia',24,false],['europe',44,false],
  ['north_america',4,true],['south_america',24,true],['oceania',44,true]]){
  const y=readFileSync(`.github/workflows/continent-country-${continent}-2h.yml`,'utf8');
  assert.ok(y.includes(`cron: '${minute} ${odd?'1-23/2':'*/2'} * * *'`));
  assert.ok(!y.includes('canary_only: true'));offsets.push(minute+(odd?60:0));
 }
 assert.deepEqual(offsets,[4,24,44,64,84,104]);
 const shared=readFileSync('.github/workflows/continent-country-original-probe-reusable.yml','utf8');
 assert.match(shared,/default: false\s+type: boolean/);
 assert.match(shared,/run: bun scripts\/ops\/run-full-continent-country-sweep.mjs/);
 assert.doesNotMatch(shared,/restore-continent-country-cursor/);
});

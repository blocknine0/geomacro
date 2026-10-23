// Every scheduled tick covers the complete fixed continent, across three domains.
import {CONTINENT_COUNTRIES_195,assertContinentCanonical195} from './continent-country-195-rotation.mjs';
import {parseCanonical195Codes,rollupCountry195Proofs} from './country-195-proof-rollup.mjs';
const fail=code=>{throw Error('CONTINENT_FULL_SWEEP_'+code)};
export function planFullContinentSweep({continent,registryText,eventName,requestedIso3='',canaryOnly=false}){
 assertContinentCanonical195(registryText);
 if(!Object.hasOwn(CONTINENT_COUNTRIES_195,continent))fail('CONTINENT_INVALID');
 if(!['schedule','workflow_dispatch','push'].includes(eventName))fail('EVENT_INVALID');
 if(typeof canaryOnly!=='boolean'||typeof requestedIso3!=='string')fail('SCOPE_INVALID');
 if(eventName==='schedule'&&(canaryOnly||requestedIso3))fail('SCHEDULE_MUST_COVER_ALL_COUNTRIES');
 const members=CONTINENT_COUNTRIES_195[continent];
 if(requestedIso3&&(eventName!=='workflow_dispatch'||!members.includes(requestedIso3)))fail('MANUAL_COUNTRY_INVALID');
 const countries=requestedIso3?[requestedIso3]:canaryOnly?members.slice(0,1):[...members];
 const codes=parseCanonical195Codes(registryText);
 return {continent,countries,country_indexes:countries.map(iso=>codes.indexOf(iso)),
  scope:requestedIso3?'MANUAL_COUNTRY':canaryOnly?'POST_MERGE_CANARY':'FULL_CONTINENT',
  category_count:3,scheduled_interval_hours:2,max_parallel_countries:2,
  provider_requests_cap:12*countries.length,original_page_requests_cap:4*countries.length};
}
export function checkCountryProbe(report,iso,continent,registryText,now=new Date()){
 const codes=parseCanonical195Codes(registryText);
 rollupCountry195Proofs([report],codes,{now});
 if(report.batch_count!==1||report.scheduled_country_iso3!==iso||
    report.continent_source_group!==continent||codes[report.batch_start]!==iso||
    report.cells.some(c=>c.iso3!==iso)||!CONTINENT_COUNTRIES_195[continent]?.includes(iso))fail('COUNTRY_CHECKPOINT_INVALID');
 return report;
}
export async function runFullContinentSweep(plan,{runCountry,registryText,now=()=>new Date()}){
 const started=now().toISOString(),reports=new Array(plan.countries.length),failures=[];
 let cursor=0;
 async function worker(){
  while(cursor<plan.countries.length){
   const index=cursor++,iso=plan.countries[index];
   try{reports[index]=checkCountryProbe(await runCountry(iso,plan.country_indexes[index]),iso,plan.continent,registryText,now());}
   catch{failures.push({country_iso3:iso,reason:'COUNTRY_PROBE_OR_CHECKPOINT_FAILED'});}
  }
 }
 await Promise.all(Array.from({length:Math.min(2,plan.countries.length)},worker));
 const checked=reports.filter(Boolean);
 return {schema:'geomacro.continent-country-full-sweep.v1',continent:plan.continent,
  scope:plan.scope,probe_started_at:started,probe_finished_at:now().toISOString(),
  expected_countries:[...plan.countries],countries_attempted:plan.countries.length,
  countries_completed:checked.length,category_count:3,expected_category_cells:plan.countries.length*3,
  completed_category_cells:checked.length*3,scheduled_interval_hours:2,
  max_parallel_countries:2,complete:failures.length===0,failures,reports:checked,
  provider_requests_cap:plan.provider_requests_cap,original_page_requests_cap:plan.original_page_requests_cap,
  raw_data_persisted:false,payments:0,b2_requests:0,supabase_requests:0};
}
export function fullSweepCountryReports(receipt,continent,registryText,now=new Date()){
 // Retain read compatibility with pre-full-continent scheduled artifacts.
 if(receipt?.schema==='geomacro.195-country-safe-readonly-batch.v2')
  return [checkCountryProbe(receipt,receipt.scheduled_country_iso3,continent,registryText,now)];
 const expected=CONTINENT_COUNTRIES_195[continent];
 if(!expected||receipt?.schema!=='geomacro.continent-country-full-sweep.v1'||
    receipt.continent!==continent||receipt.scope!=='FULL_CONTINENT'||receipt.complete!==true||
    receipt.category_count!==3||receipt.countries_attempted!==expected.length||
    receipt.countries_completed!==expected.length||receipt.expected_category_cells!==expected.length*3||
    receipt.completed_category_cells!==expected.length*3||!Array.isArray(receipt.failures)||receipt.failures.length||
    JSON.stringify(receipt.expected_countries)!==JSON.stringify(expected)||
    !Array.isArray(receipt.reports)||receipt.reports.length!==expected.length||
    receipt.raw_data_persisted!==false||receipt.payments!==0||receipt.b2_requests!==0||receipt.supabase_requests!==0)
  fail('RECEIPT_INCOMPLETE_OR_WRONG_SCOPE');
 return receipt.reports.map((report,index)=>checkCountryProbe(report,expected[index],continent,registryText,now));
}

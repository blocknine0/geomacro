#!/usr/bin/env bun
// One canonical registry; no database census and no frozen Supabase connection.
import {COUNTRIES_195,CANONICAL_195_VERSION} from '../../src/lib/canonical-country-registry-195.ts';
import {buildAgentQueryPlan} from '../../src/lib/agent-query-plan.ts';
import {resolveVerifiedPublishedPlanPrice} from '../../src/lib/capability-pricing-verified-plan.server.ts';
import {commercialCorridorDescriptor} from '../../src/lib/commercial-corridor-registry.ts';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const DOMAINS=[['geopolitics',['conflict_geopolitics','risk_object']],
 ['macro',['macro_risk','fx_external_risk','risk_object']],
 ['rare_earth',['critical_minerals','risk_object']]];
const BATCH_SIZE=25;
function check(value,code){if(!value)throw Error(code);}
export function globalCoverageCases(){
 const iso3=COUNTRIES_195.map(c=>c.iso3).sort();
 check(iso3.length===195&&new Set(iso3).size===195&&iso3.includes('VAT')&&iso3.includes('PSE'),'CANONICAL_195_COUNTRY_BASELINE_INVALID');
 const cases=[];
 for(const [category,topics] of DOMAINS){
  for(let i=0;i<iso3.length;i+=BATCH_SIZE){
   cases.push({id:category+'-'+i,category,topics,subjects:iso3.slice(i,i+BATCH_SIZE).map(country_iso3=>({type:'country',country_iso3}))});
  }
 }
 const ring=iso3.map((origin_country_iso3,i)=>({type:'corridor',origin_country_iso3,destination_country_iso3:iso3[(i+1)%195]}));
 for(let i=0;i<ring.length;i+=BATCH_SIZE)cases.push({id:'corridor-'+i,category:'corridor',topics:['trade_corridor','risk_object'],subjects:ring.slice(i,i+BATCH_SIZE)});
 return cases.map(c=>({...c,body:{schema_version:'geomacro.agent-query.v1',subjects:c.subjects,
  topics:c.topics,intent:'comparison',fulfillment_mode:'published_only',delivery_tier:'signed_risk_intelligence',evidence:'required',detail:'compact'}}));
}
export function verifyCoverageAvailability(testCase,response,status){
 const plan=buildAgentQueryPlan(testCase.body);
 check(status===200&&response?.ok===true&&response.chargeable===true&&
  response.payment_required_now===false&&response.execution_authorized===false,'X402_AVAILABILITY_NOT_VERIFIED');
 const a=response.availability;
 check(a?.deliverable===true&&a.code==='AVAILABLE'&&a.query_plan_hash===plan.query_plan_hash&&
  response.query_plan_hash===plan.query_plan_hash&&a.subjects?.length===plan.subjects.length&&
  a.missing_modules?.length===0&&a.stale_modules?.length===0&&a.ineligible_source_ids?.length===0,
  'X402_AVAILABILITY_PLAN_NOT_BOUND');
 for(let i=0;i<plan.subjects.length;i++){
  check(JSON.stringify(a.subjects[i].subject)===JSON.stringify(plan.subjects[i])&&
   plan.required_modules.every(m=>a.subjects[i].available_modules?.includes(m)),
   'X402_AVAILABILITY_SUBJECT_PROOF_MISSING');
 }
 const price=resolveVerifiedPublishedPlanPrice(plan,{evidence_verified:true,rights_verified:true,
  signing_verified:true,deliverable:true,signed_object_lifecycle:'existing',change_attribution_verified:false});
 check(response.exact_price?.asset==='USDC'&&response.exact_price.amount_usdc===price.amount_usdc&&
  response.exact_price.amount_atomic===price.amount_atomic,'X402_APPROVED_CAPABILITY_PRICE_MISMATCH');
 return {id:testCase.id,category:testCase.category,subject_count:plan.subjects.length,
  query_plan_hash:plan.query_plan_hash,capability:price.capability,variant:price.variant,amount_usdc:price.amount_usdc};
}
export async function verifyGlobalZeroFundCoverage({fetchImpl=fetch,host='https://geomacro.live',now=new Date(),pauseImpl=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 check(host==='https://geomacro.live','X402_CENSUS_HOST_NOT_PINNED');
 const cases=globalCoverageCases();
 let requests=0;
 async function json(path,init={}){
  requests++;
  const r=await fetchImpl(host+path,{...init,redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{'content-type':'application/json','accept':'application/json','cache-control':'no-cache'}});
  const raw=await r.text();check(raw.length<=512000,'X402_CENSUS_RESPONSE_TOO_LARGE');
  return {status:r.status,data:JSON.parse(raw)};
 }
 const report={schema_version:'geomacro.x402-global-zero-fund-coverage.v2',checked_at:now.toISOString(),
  host,ok:false,country_registry_version:CANONICAL_195_VERSION,canonical_country_baseline_count:195,
  expected_country_category_cells:585,verified_availability_country_category_cells:0,
  untested_country_category_cells:585,all_195x3_current_evidence_verified:false,
  actual_paid_customer_delivery_checked:false,real_payment_performed:false,settlement_attempted:false,
  production_activation_changed:false,supabase_requests:0,b2_direct_requests:0,
  pricing_policy:'SERVER_VERIFIED_LOCKED_CAPABILITY_CATALOG',request_count:0,results:[],blockers:[]};
 try{
  const health=await json('/api/health?deep=1');
  const products=health.data?.public_production?.current_hot_product_ready;
  if(health.status!==200||health.data?.ok!==true||!products||
     !['intelligence','global_risk','risk_indices'].every(p=>products[p]===true)){
   report.blockers.push('CURRENT_SIGNED_PRODUCT_HEALTH_UNAVAILABLE');
   return {...report,request_count:requests};
  }
  // Stop on denial; do not repeat outage/429 requests across 585 cells.
  for(const testCase of cases){
   // Stay below the unchanged local burst and distributed per-client limits.
   // This is pacing of new cases, never retry of denied/ambiguous requests.
   if(report.results.length)await pauseImpl(1500);
   const r=await json('/api/x402/risk/availability',{method:'POST',body:JSON.stringify(testCase.body)});
   report.results.push(verifyCoverageAvailability(testCase,r.data,r.status));
   if(testCase.category!=='corridor')report.verified_availability_country_category_cells+=testCase.subjects.length;
  }
  const descriptor=commercialCorridorDescriptor({origin_country_iso3:'USA',destination_country_iso3:'IND'});
  return {...report,ok:true,request_count:requests,untested_country_category_cells:0,
   corridor_supported_directed_pair_count:195*194,corridor_contract:descriptor,
   corridor_live_probe_strategy:'all_baseline_countries_directional_ring_plus_static_registry_contract',
   // Availability advertisements are not a signed customer payload readback.
   all_195x3_current_evidence_verified:false};
 }catch{
  report.blockers.push('EXACT_PLAN_CAPABILITY_AVAILABILITY_NOT_VERIFIED');
  return {...report,request_count:requests,
   untested_country_category_cells:585-report.verified_availability_country_category_cells};
 }
}
async function main(){
 const proof=await verifyGlobalZeroFundCoverage();console.log(JSON.stringify(proof,null,2));
 if(!proof.ok)process.exitCode=3;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();

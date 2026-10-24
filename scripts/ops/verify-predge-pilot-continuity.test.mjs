import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPredgeContinuity} from './verify-predge-pilot-continuity.mjs';
import {buildDerivedNewsStructural} from '../../src/lib/derived-news-structural-bridge.ts';
const NOW=Date.parse('2026-10-24T14:00:00Z');
const categories=['geopolitics','macro','rare_earth'];
const gate={authority:'cloudflare-d1',scope:'predge-risk-gate-country-v1',
 execution_authorized:false,paid_launch_approved:false,status:'not_ready'};
function fixture(now=NOW,empty=false){
 const journal=empty?[]:categories.map((category,i)=>({
  id:category+'-12345678',category,title:'Geomacro finds an official policy release in the sector',
  what_changed:'An official original release concerns a policy development in the sector.',
  why_it_matters:'The observed policy release may matter for context; actual impacts require verification.',
  topic:['foreign policy','monetary policy','critical-minerals policy'][i],development_type:'policy update',
  geography:null,published_at:new Date(now-7200000).toISOString(),date_precision:'exact',observed_release_count:1,
  sources_credited:['Contains public sector information licensed under the Open Government Licence v3.0.'],
  status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null,
 }));
 const counts=Object.fromEntries(categories.map(c=>[c,empty?0:1]));
 const items=buildDerivedNewsStructural(journal,now,'attributed_research');
 const feed={ok:true,generated_at:new Date(now).toISOString(),items:[],
  counts:{geopolitics:0,macro:0,rare_earth:0}};
 const research={...feed,items,counts,projection:'attributed_research',
  attribution_must_be_preserved:true,attribution_is_not_a_grant_of_source_rights:true,
  retention_hours:72,original_release_delay_minutes:0,raw_upstream_delivered:false,
  partner_delivery_schema:'geomacro.predge.research-news-delivery.v1',authentication:'DEDICATED_BEARER_ONLY',
  execution_authorized:false,partner_resale_or_commercial_redistribution_authorized:false,
  chargeable:false,daily_utc_request_hard_cap:500,distributed_rate_governor:'ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED',
  maximum_pilot_scope_expires_at:'2027-01-17T00:00:00.000Z',
  availability_by_category:Object.fromEntries(categories.map(c=>[c,{latest_source_check:{
   current_source_check_verified:true,last_success_at:new Date(now-5*60000).toISOString(),sources_reachable:2,
   raw_upstream_stored:false,commercial_rights_verified:false,paid_delivery_authorized:false,
  }}])),
 };
 return {research,feed,journal};
}
const assess=(f,now=NOW,g=gate)=>assessPredgeContinuity(f.research,f.feed,g,now,f.journal);
test('attributed research remains available independently of paid Risk Gate readiness',()=>{
 const p=assess(fixture());
 assert.equal(p.authenticated_research_verified,true);assert.equal(p.signed_risk_gate_ready,false);
 assert.equal(p.attributed_research,true);assert.equal(p.execution_authorized,false);
 assert.deepEqual(p.category_delivery_ready,{geopolitics:true,macro:true,rare_earth:true});
 assert.equal(p.source_checks.macro.collector_fresh,true);
});
test('reject private-public divergence, dropped attribution and accidental commercial resale',()=>{
 for(const patch of [{items:[{id:'different'}]},{projection:'source_neutral'},
  {attribution_must_be_preserved:false},{retention_hours:24},{original_release_delay_minutes:15},
  {partner_resale_or_commercial_redistribution_authorized:true}]){
  const f=fixture();Object.assign(f.research,patch);
  assert.throws(()=>assess(f),/RESEARCH_CONTRACT_OR_PARITY/);
 }
 assert.throws(()=>assess(fixture(),NOW,{...gate,paid_launch_approved:true}),/RISK_GATE_BOUNDARY/);
 const f=fixture();assert.throws(()=>assessPredgeContinuity(f.research,f.feed,gate,NOW),/RESEARCH_CONTRACT_OR_PARITY/);
});
test('a responding endpoint cannot hide a stalled category collector',()=>{
 for(const category of categories){
  const f=fixture();f.research.availability_by_category[category].latest_source_check.last_success_at=
   new Date(NOW-91*60000).toISOString();
  assert.throws(()=>assess(f),/SOURCE_CHECK_STALE/);
 }
 const f=fixture();f.research.availability_by_category.macro.latest_source_check.last_success_at=
  new Date(NOW-90*60000).toISOString();assert.equal(assess(f).authenticated_research_verified,true);
});
test('missing, future, unhealthy and unverified source checks cannot appear green',()=>{
 for(const patch of [{last_success_at:null},{last_success_at:new Date(NOW+1000).toISOString()},
  {sources_reachable:0},{current_source_check_verified:false},{paid_delivery_authorized:true},{raw_upstream_stored:true}]){
  const f=fixture();Object.assign(f.research.availability_by_category.rare_earth.latest_source_check,patch);
  assert.throws(()=>assess(f),/SOURCE_CHECK_UNVERIFIED/);
 }
});
test('genuinely quiet official sources do not trigger fabricated replacement news',()=>{
 const p=assess(fixture(NOW,true));
 assert.deepEqual(p.category_counts,{geopolitics:0,macro:0,rare_earth:0});
 assert.equal(p.source_checks.rare_earth.collector_fresh,true);
 assert.equal(p.source_checks.rare_earth.release_state,'NO_QUALIFYING_RELEASE_IN_72H');
 assert.equal(p.category_delivery_ready.rare_earth,false);
 assert.equal(p.no_new_release_is_not_a_collector_outage,true);
});
test('pilot expiry and thirty-day renewal warning remain enforced',()=>{
 const end=Date.parse('2027-01-17T00:00:00Z');
 assert.throws(()=>assess(fixture(end),end),/PILOT_EXPIRED/);
 const jan=Date.parse('2027-01-01T00:00:00Z'),p=assess(fixture(jan),jan);
 assert.equal(p.renewal_action_required,true);assert.equal(p.days_until_pilot_end,16);
});

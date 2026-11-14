/** Sanitized source-wise runtime evidence for direct 20m and private 15m. No original URLs/articles. */
import {createHash} from 'node:crypto';

const CATEGORIES=new Set(['geopolitics','macro','rare_earth']);
const receiptKey=(id,url,category)=>createHash('sha256')
 .update([id,url,category].join('\n')).digest('hex');
const validDate=(value,now)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&
 Date.parse(value)<=now&&now-Date.parse(value)<=72*3600*1000;
const newer=(a,b)=>!a||b>a?b:a;

/**
 * Native publisher candidates are not automatically verified events.
 * D1 ACKs are counted only after an actual independent stage readback.
 * Durable B2 archiving is explicitly NOT inferred by this source-only lane.
 */
export function buildDirect20mSourceHealthProof({
 registry,checks,observedCandidates,retainedCandidates,
 d1ReadbackVerified=false,b2ReadbackVerified=false,now=Date.now(),
}){
 if(!Number.isFinite(now)||!Array.isArray(registry)||registry.length>512||
   !Array.isArray(checks)||checks.length>1536||
   !(observedCandidates===null||Array.isArray(observedCandidates)&&observedCandidates.length<=8000)||
   !(retainedCandidates===null||Array.isArray(retainedCandidates)&&retainedCandidates.length<=8000))
  throw Error('DIRECT20M_SOURCE_PROOF_INVALID');
 const checked=new Map(checks.map(row=>[row.source_ref,row.state]));
 const byUrlCategory=new Map();
 const grouped=(items,key)=>{
  for(const c of items){
   if(!CATEGORIES.has(c?.category)||typeof c.sourceUrl!=='string'||!validDate(c.publishedAt,now))continue;
   const address=JSON.stringify([c.sourceUrl,c.category]);
   const old=byUrlCategory.get(address)??{current_sweep:0,queued_72h:0,d1_acknowledged_72h:0,last_native_published_at:null};
   old[key]++;
   if(key==='queued_72h')old.last_native_published_at=newer(old.last_native_published_at,c.publishedAt);
   byUrlCategory.set(address,old);
  }
 };
 if(Array.isArray(observedCandidates))grouped(observedCandidates,'current_sweep');
 if(Array.isArray(retainedCandidates))grouped(retainedCandidates,'queued_72h');
 if(d1ReadbackVerified===true&&Array.isArray(retainedCandidates)){
  grouped(retainedCandidates.filter(c=>c.d1Acknowledged===true),'d1_acknowledged_72h');
 }
 const sources=[];
 for(const source of registry){
  if(typeof source?.id!=='string'||typeof source?.url!=='string'||!Array.isArray(source?.categories))
   throw Error('DIRECT20M_SOURCE_PROOF_REGISTRY_INVALID');
  for(const category of source.categories){
   if(!CATEGORIES.has(category))throw Error('DIRECT20M_SOURCE_PROOF_CATEGORY_INVALID');
   const x=byUrlCategory.get(JSON.stringify([source.url,category]));
   const state=checked.get(receiptKey(source.id,source.url,category))??'NOT_CHECKED';
   sources.push({
    source_id:source.id,category,transport_parser_state:state,
    candidates_observed_this_sweep:Array.isArray(observedCandidates)?x?.current_sweep??0:null,
    candidates_in_retained_72h_queue:Array.isArray(retainedCandidates)?x?.queued_72h??0:null,
    original_last_published_at_in_72h_queue:Array.isArray(retainedCandidates)?x?.last_native_published_at??null:null,
    d1_originals_acknowledged_in_retained_queue:d1ReadbackVerified===true
      ?x?.d1_acknowledged_72h??0:null,
    native_publication_is_not_event_verification:true,
   });
  }
 }
 const categoryHealth=summarizePrivateOsintThreeCategoryHealth(sources,{
  sourceEndpointsConfigured:registry.length,
  d1ReadbackVerified:d1ReadbackVerified===true&&Array.isArray(retainedCandidates),
  observedCandidatesMeasured:Array.isArray(observedCandidates),now,
 });
 return {
  schema:'geomacro.direct20m.sourcewise-health.v1',
  checked_at:new Date(now).toISOString(),
  source_endpoints_configured:registry.length,
  source_category_checks_expected:sources.length,
  category_checks_with_runtime_state:sources.filter(s=>s.transport_parser_state!=='NOT_CHECKED').length,
  d1_selected_batch_readback_verified:d1ReadbackVerified===true,
  b2_original_archive_readback_verified:b2ReadbackVerified===true,
  live_category_health:categoryHealth,
  producer_publication_success_not_inferred:true,
  current_sweep_native_candidate_attribution_measured:Array.isArray(observedCandidates),
  retained_72h_queue_attribution_measured:Array.isArray(retainedCandidates),
  original_article_urls_included:false,raw_article_content_included:false,
  sources,
 };
}

/** One summary of every actual source-category transport check. */
export function summarizePrivateOsintThreeCategoryHealth(sources,{
 sourceEndpointsConfigured,d1ReadbackVerified=false,
 observedCandidatesMeasured=false,now=Date.now(),
}={}){
 if(!Array.isArray(sources)||sources.length>1536||
    !Number.isSafeInteger(sourceEndpointsConfigured)||
    sourceEndpointsConfigured<1||sourceEndpointsConfigured>512||
    !Number.isFinite(now))throw Error('PRIVATE_OSINT_LIVE_HEALTH_INVALID');
 const domains=['geopolitics','macro','rare_earth'];
 const healthyStates=new Set(['OBSERVED','EMPTY_OR_OUTSIDE_WINDOW']);
 const perCategory=Object.create(null);
 for(const category of domains){
  const scoped=sources.filter(s=>s.category===category);
  const checked=scoped.filter(s=>s.transport_parser_state!=='NOT_CHECKED');
  const healthy=scoped.filter(s=>healthyStates.has(s.transport_parser_state));
  const native=observedCandidatesMeasured?
    scoped.reduce((sum,s)=>sum+(s.candidates_observed_this_sweep??0),0):null;
  const acknowledged=d1ReadbackVerified?
    scoped.reduce((sum,s)=>sum+(s.d1_originals_acknowledged_in_retained_queue??0),0):null;
  // Never turn provider-controlled parser states into object property names.
  // Enumerated rows prevent prototype-key injection from hostile feed metadata.
  const stateCounts=[...new Set(scoped.map(s=>s.transport_parser_state))]
   .sort().map(state=>({state,count:scoped.filter(s=>s.transport_parser_state===state).length}));
  perCategory[category]=Object.freeze({
   configured_source_category_checks:scoped.length,
   actual_source_category_checks:checked.length,
   transport_or_parsed_feed_healthy_checks:healthy.length,
   unavailable_or_denied_checks:scoped.length-healthy.length,
   source_state_counts:stateCounts,
   native_original_candidates_this_sweep:native,
   d1_acked_originals_in_72h_queue:acknowledged,
   live_status:checked.length!==scoped.length?'INCOMPLETE_SOURCE_CHECK':
    healthy.length===0?'NO_HEALTHY_FEED':
    native===null?'HEALTHY_TRANSPORT_NATIVE_NEWS_UNMEASURED':
    native>0?'HEALTHY_FEED_WITH_NATIVE_CANDIDATES':'HEALTHY_FEED_NO_NEW_NATIVE_CANDIDATES',
  });
 }
 const expected=sources.length;
 const observed=domains.reduce((sum,c)=>sum+perCategory[c].actual_source_category_checks,0);
 const healthy=domains.reduce((sum,c)=>sum+perCategory[c].transport_or_parsed_feed_healthy_checks,0);
 const allThree=domains.every(c=>perCategory[c].configured_source_category_checks>0&&
  perCategory[c].transport_or_parsed_feed_healthy_checks>0);
 return Object.freeze({
  schema:'geomacro.private-osint-three-category-health.v1',
  checked_at:new Date(now).toISOString(),
  scope:'ALREADY_POLLED_REGISTERED_SOURCE_FEEDS_ONLY',
  configured_source_endpoints:sourceEndpointsConfigured,
  source_category_checks_expected:expected,
  source_category_checks_observed:observed,
  source_category_checks_healthy:healthy,
  all_configured_source_category_checks_observed:observed===expected,
  all_three_categories_have_live_feed_transport:allThree,
  all_registered_source_transports_healthy:allThree&&healthy===expected&&observed===expected,
  // All sources LIVE requires genuine native candidate evidence for EVERY
  // source-category this very tick, not merely HTTP 200 or an empty RSS feed.
  all_registered_sources_live:allThree&&healthy===expected&&observed===expected&&
   observedCandidatesMeasured===true&&sources.every(row=>
    Number.isSafeInteger(row.candidates_observed_this_sweep)&&
    row.candidates_observed_this_sweep>0),
  all_three_categories_observed_native_candidates_this_tick:
   observedCandidatesMeasured===true&&domains.every(c=>
    perCategory[c].native_original_candidates_this_sweep>0),
  by_category:perCategory,
  country_195_routes_are_discovery_not_verified_event_coverage:true,
  root_only_references_counted_as_live_sources:false,
  telegram_unapproved_candidates_counted_as_live_sources:false,
  source_item_is_not_independent_verification:true,
  commercial_rights_verified:false,
  signed_risk_gate_authorized:false,paid_eligible:false,
  raw_news_content_logged:false,b2_dependency_required:false,payments:0,
 });
}

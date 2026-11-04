/** Sanitized, source-wise direct-20m runtime evidence. No raw URLs/articles. */
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
 return {
  schema:'geomacro.direct20m.sourcewise-health.v1',
  checked_at:new Date(now).toISOString(),
  source_endpoints_configured:registry.length,
  source_category_checks_expected:sources.length,
  category_checks_with_runtime_state:sources.filter(s=>s.transport_parser_state!=='NOT_CHECKED').length,
  d1_selected_batch_readback_verified:d1ReadbackVerified===true,
  b2_original_archive_readback_verified:b2ReadbackVerified===true,
  producer_publication_success_not_inferred:true,
  current_sweep_native_candidate_attribution_measured:Array.isArray(observedCandidates),
  retained_72h_queue_attribution_measured:Array.isArray(retainedCandidates),
  original_article_urls_included:false,raw_article_content_included:false,
  sources,
 };
}

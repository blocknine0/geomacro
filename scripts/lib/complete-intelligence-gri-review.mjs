/**
 * One source of truth: read the same 72-hour Geomacro D1 Intelligence
 * journal used by the public website and route ALL retained three-domain
 * observations through a lossless, bounded, unscored GRI materiality queue.
 *
 * Each bounded 25-row-per-category batch reuses the existing canonical
 * material-review & 195-country worklist rules. No new upstream scrape,
 * source licence, independent human signature or paid authority is inferred.
 */
import {buildMaterialGriReviewFromDerivedD1} from "./material-gri-news-review.mjs";
import {buildMaterialGriCountryEvidenceWorklist}
 from "./material-gri-country-evidence-worklist.mjs";
const DOMAINS=Object.freeze(["geopolitics","macro","rare_earth"]);
const MAX_RETAINED=600,CHUNK_SIZE=25;
const fail=()=>{throw Error("COMPLETE_INTELLIGENCE_GRI_REVIEW_INVALID")};

export function buildCompleteIntelligenceGriReview({
 signals,registrySource,now=Date.now()
}={}){
 if(!Array.isArray(signals)||signals.length>MAX_RETAINED||
    typeof registrySource!=="string"||!Number.isFinite(now))fail();
 const seen=new Set(),byCategory=Object.fromEntries(DOMAINS.map(c=>[c,[]]));
 for(const signal of signals){
  if(!signal||typeof signal!=="object"||Array.isArray(signal)||
     !DOMAINS.includes(signal.category)||typeof signal.id!=="string"||
     !new RegExp("^"+signal.category+"-[0-9a-f]{8}$","u").test(signal.id)||
     seen.has(signal.id))fail();
  seen.add(signal.id);
  byCategory[signal.category].push(signal);
 }
 for(const category of DOMAINS){
  byCategory[category].sort((a,b)=>
    String(b.published_at).localeCompare(String(a.published_at))||
    a.id.localeCompare(b.id));
 }
 const batchCount=Math.ceil(Math.max(0,...DOMAINS.map(c=>byCategory[c].length))/CHUNK_SIZE);
 const batches=[],candidateCount=Object.fromEntries(DOMAINS.map(c=>[c,0]));
 const forwardedIds=new Set();
 for(let index=0;index<batchCount;index++){
  const portion=DOMAINS.flatMap(category=>
    byCategory[category].slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE));
  for(const signal of portion){
   if(forwardedIds.has(signal.id))fail();
   forwardedIds.add(signal.id);
  }
  const queue=buildMaterialGriReviewFromDerivedD1({
   ok:true,schema:"geomacro.website-derived-news-feed.v1",
   delivery_scope:"free_website_only",
   retention_hours:72,retention_days:3,
   original_release_delay_minutes:0,
   signals:portion
  },now);
  const review=buildMaterialGriCountryEvidenceWorklist(queue,registrySource,now);
  const cats=review.categories.map(cat=>{
   candidateCount[cat.category]+=cat.review_targets.length;
   return cat;
  });
  batches.push(Object.freeze({
   batch_index:index,source_rows_examined:portion.length,
   categories:cats,
   source_queue_sha256:review.source_queue_sha256,
   publication_authorized:false,
   commercial_use_authorized_by_this_batch:false,
   numerical_gri_signed:false
  }));
 }
 if(forwardedIds.size!==signals.length)fail();
 return Object.freeze({
  schema:"geomacro.complete-intelligence-to-gri-review.v1",
  source:"SAME_72H_D1_DERIVED_JOURNAL_AS_INTELLIGENCE_PAGE",
  created_at:new Date(now).toISOString(),
  source_journal_rows_examined:signals.length,
  source_journal_rows_triaged:forwardedIds.size,
  review_batches:batches.length,
  category_journal_counts:Object.fromEntries(DOMAINS.map(c=>[c,byCategory[c].length])),
  category_material_review_counts:candidateCount,
  total_material_review_candidates:Object.values(candidateCount).reduce((a,b)=>a+b,0),
  category_nonmaterial_context_counts:Object.fromEntries(DOMAINS.map(c=>[
   c,byCategory[c].length-candidateCount[c]
  ])),
  original_source_reread_in_this_step:false,
  automatic_new_license_or_waiver_granted:false,
  source_specific_rights_requirements_preserved:true,
  current_original_page_verified_in_this_step:false,
  independent_numerical_gri_review_completed:false,
  country_certificates_issued:false,
  customer_chargeable:false,signed_hot_3_of_3_verified:false,
  raw_upstream_redistributed:false,
  no_funds:true,supabase_writes:0,b2_requests:0,d1_writes:0,payments:0,
  batches
 });
}

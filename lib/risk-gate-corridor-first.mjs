/**
 * Low-cost corridor-first tiering of already ingested original-link D1 evidence.
 * News index metadata is never an authenticated incident or a scoring input.
 */
export const RG_CORRIDOR_FIRST_VERSION="geomacro.risk-gate-corridor-first.v1";
export const TRACKED_CORRIDORS=Object.freeze([
  {id:"red-sea",native:"red_sea"},
  {id:"taiwan-strait",native:"taiwan_strait"},
  {id:"hormuz",native:"strait_of_hormuz"},
  {id:"suez",native:"suez_canal"},
  {id:"malacca",native:"strait_of_malacca"}
]);
export const CORROBORATION_WINDOW_MS=6*60*60*1000;
export const EVIDENCE_MAX_AGE_MS=72*60*60*1000;
const HASH=/^[a-f0-9]{64}$/u;
const CLOCK=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
export function chooseRiskGateProcessingTier({corridor_id,country_iso3}={}){
 if(typeof corridor_id==="string"){
  const found=TRACKED_CORRIDORS.find(x=>x.id===corridor_id);
  return found?{tier:"STRATEGIC_CONTINUOUS",corridor_id:found.id,
   original_route_id:found.native}:{tier:"JIT_REQUEST_ONLY",corridor_id};
 }
 if(typeof country_iso3==="string"&&/^[A-Z]{3}$/u.test(country_iso3))
  return {tier:"JIT_REQUEST_ONLY",country_iso3};
 throw Error("RG_TIER_SUBJECT_INVALID");
}
function clean(row,now){
 if(!row||typeof row!=="object"||!HASH.test(row.candidate_id)||
    !HASH.test(row.source_title_sha256)||typeof row.source_id!=="string"||
    !/^[a-z0-9_]{3,70}$/u.test(row.source_id)||
    !CLOCK.test(row.native_published_at))return null;
 const time=Date.parse(row.native_published_at);
 if(!Number.isFinite(time)||time>now||now-time>EVIDENCE_MAX_AGE_MS)return null;
 let u,refs;
 try{
  u=new URL(row.article_url);
  refs=JSON.parse(row.candidate_corridor_ids_json);
 }catch{return null}
 if(u.protocol!=="https:"||u.username||u.password||u.port||
    !Array.isArray(refs)||refs.length>12)return null;
 const host=u.hostname.toLowerCase().replace(/^www\./u,"");
 if(!/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(host))return null;
 return {id:row.candidate_id,source_id:row.source_id,
  published_at:row.native_published_at,source_title_sha256:row.source_title_sha256,
  publisher_host:host,candidate_corridor_ids:refs};
}
/**
 * Cross-publisher same-title/time clustering is *only* corroboration
 * potential. Reprints and common wire syndication may be non-independent.
 * It cannot certify a real-world event without direct original evidence.
 */
export function buildStrategicCorridorReadiness({
 corridor_id,rows,checked_at
}={}){
 const tier=chooseRiskGateProcessingTier({corridor_id});
 if(tier.tier!=="STRATEGIC_CONTINUOUS"||!Array.isArray(rows)||
   rows.length>60||!CLOCK.test(checked_at))throw Error("RG_CORRIDOR_INPUT_INVALID");
 const now=Date.parse(checked_at);
 if(!Number.isFinite(now))throw Error("RG_CORRIDOR_CLOCK_INVALID");
 const items=[],seen=new Set();
 for(const raw of rows){
  const parsed=clean(raw,now);
  if(!parsed||!parsed.candidate_corridor_ids.includes(tier.original_route_id)||
     seen.has(parsed.id))continue;
  seen.add(parsed.id);
  items.push(parsed);
 }
 items.sort((a,b)=>a.published_at.localeCompare(b.published_at));
 const pairs=[];
 for(let i=0;i<items.length;i++){
  for(let j=i+1;j<items.length;j++){
   const a=items[i],b=items[j],delta=Date.parse(b.published_at)-Date.parse(a.published_at);
   if(delta>CORROBORATION_WINDOW_MS)break;
   if(a.publisher_host===b.publisher_host||a.source_title_sha256!==b.source_title_sha256)
    continue;
   pairs.push({source_a_id:a.id,source_b_id:b.id,
    source_a_host:a.publisher_host,source_b_host:b.publisher_host,
    publication_gap_minutes:Math.floor(delta/60000),
    same_title_hash:true,different_host:true,
    independently_verified_event:false});
   if(pairs.length>=12)break;
  }
  if(pairs.length>=12)break;
 }
 const evidence=items.slice(-30).map(({id,source_id,published_at,source_title_sha256,publisher_host})=>({
  candidate_id:id,source_id,published_at,source_title_sha256,publisher_host
 }));
 return {
  schema:RG_CORRIDOR_FIRST_VERSION,checked_at,corridor_id,
  original_route_id:tier.original_route_id,tier:"STRATEGIC_CONTINUOUS",
  native_evidence_count:items.length,evidence_references:evidence,
  two_domain_six_hour_title_matches:pairs,
  potential_corroboration_pairs:pairs.length,
  verified_event_count:0,same_event_verification_status:"REQUIRES_ORIGINAL_EVIDENCE",
  what_happened:"GeoMacro identified "+items.length+" dated first-party-feed article reference(s) matching the "+corridor_id+
   " corridor index. Article headlines and publication times do not establish real-world events.",
  why_it_matters:"Sources within a six-hour window can be related; common publication and syndication cannot certify independent corroboration.",
  market_relevance:"No shipping interruption, sanctions effect, commodity exposure or numerical risk score is established by this metadata alone.",
  what_to_watch:"Verify source-original incident facts, location, event time, independent corroboration, impact methodology and source-use rights.",
  evidence_and_confidence:{
   evidence_type:"D1_FIRST_PARTY_FEED_REFERENCE_METADATA",
   source_titles_persisted:false,publication_time_is_not_event_time:true,
   independent_original_confirmation:false,confidence:"CANDIDATE_ONLY"
  },
  signed_gro:null,provisional_impact_score:null,risk_gate_decision:null,
  execution_authorized:false,commercial_eligible:false,paid_quote_enabled:false,
  customer_credit_debited:0,predge_writes:0,website_intelligence_writes:0
 };
}

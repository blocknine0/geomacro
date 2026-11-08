/**
 * Deterministic Hot50 projection from independently certified evidence.
 * Does NOT fetch feeds, assert news truth, fabricate missing scores or mint
 * source-qualification proofs. Only the protected, authenticated Evidence
 * Qualification Engine may supply verified input after publisher/rights/
 * signing and B2 byte-for-byte readback.
 */
import {RISK_GATE_HOT50} from './risk-gate-hot50-scope.mjs';
import {HOT50_CATEGORIES} from './hot50-commercial-read.mjs';
const HEX=/^[a-f0-9]{64}$/;
const PTR=/^b2:\/\/[a-z0-9_-]+\/[A-Za-z0-9_./-]{1,400}$/;
const SOURCES=new Set(RISK_GATE_HOT50);
const CATEGORIES=new Set(HOT50_CATEGORIES);
const TRADE_SUBDOMAINS=Object.freeze(['trade','critical_minerals','supply_chain']);
const round=n=>Math.round(n*100)/100;
function requireQualified(e,iso3,category,asOf){
 if(!e||e.country_iso3!==iso3||e.category!==category||
    e.qualification_status!=='QUALIFIED'||
    e.rights_approved!==true||e.b2_readback_verified!==true||
    e.ed25519_evidence_receipt_verified!==true||
    !Number.isInteger(e.independent_primary_publishers)||
    e.independent_primary_publishers<3||
    !Number.isInteger(e.impact_score)||e.impact_score<0||e.impact_score>100||
    !HEX.test(e.event_fingerprint??'')||!HEX.test(e.b2_sha256??'')||
    !HEX.test(e.proof_sha256??'')||!PTR.test(e.b2_pointer??''))
   throw Error('HOT50_EVIDENCE_NOT_CRYPTO_AND_RIGHTS_QUALIFIED');
 const eventTime=Date.parse(e.original_published_at);
 const age=asOf-eventTime;
 if(!Number.isFinite(eventTime)||eventTime>asOf+300000||age>72*3600000)
   throw Error('HOT50_ORIGINAL_EVENT_STALE_OR_FUTURE');
 return Math.max(1,4-Math.floor(Math.max(0,age)/(18*3600000)));
}
export function scoreQualifiedHot50Cell({iso3,category,evidence,asOf}){
 if(!SOURCES.has(iso3)||!CATEGORIES.has(category)||
    !Array.isArray(evidence)||evidence.length<1||evidence.length>50||
    !Number.isFinite(asOf))throw Error('HOT50_CELL_SCOPE_INVALID');
 const fingerprints=new Set(),subdomains=new Set();
 let sum=0,weights=0,weightedEvents=[];
 for(const e of evidence){
  const w=requireQualified(e,iso3,category,asOf);
  if(category==='trade_minerals_supplychain'){
   if(!TRADE_SUBDOMAINS.includes(e.source_subdomain))
    throw Error('HOT50_TRADE_SOURCE_CLASSIFICATION_REQUIRED');
   subdomains.add(e.source_subdomain);
  }
  if(fingerprints.has(e.event_fingerprint))
   throw Error('HOT50_EVENT_FINGERPRINT_DUPLICATE');
  fingerprints.add(e.event_fingerprint);
  sum+=e.impact_score*w;weights+=w;
  weightedEvents.push({e,w});
 }
 if(category==='trade_minerals_supplychain'&&TRADE_SUBDOMAINS.some(x=>!subdomains.has(x)))
  throw Error('HOT50_TRADE_MINERALS_SUPPLYCHAIN_MISSING_SUBDOMAIN');
 const score=round(sum/weights);
 const deviation=weightedEvents.reduce((n,x)=>n+x.w*Math.abs(x.e.impact_score-score),0)/weights;
 // A deterministic, non-probabilistic uncertainty envelope; NOT a
 // calibrated frequency-model confidence interval.
 const radius=Math.max(5,Math.ceil(deviation+20/Math.sqrt(evidence.length)));
 const lower=Math.max(0,round(score-radius));
 const upper=Math.min(100,round(score+radius));
 return {
  score,confidence_low:lower,confidence_high:upper,
  confidence:Math.max(0,round(1-Math.min(radius,100)/100)),
  uncertainty_method:'WEIGHTED_ABSOLUTE_DEVIATION_ENVELOPE_V1_NOT_CALIBRATED_CI',
  qualified_evidence_count:evidence.length,
  ...(category==='trade_minerals_supplychain'?{verified_subdomains:[...TRADE_SUBDOMAINS]}:{}),
  b2_evidence_pointer:evidence[0].b2_pointer,
  b2_evidence_sha256:evidence[0].b2_sha256,
  evidence_proof_sha256:evidence[0].proof_sha256,
 };
}
export function deriveQualifiedHot50Views({events,asOf,historyByCountry={}}){
 if(!Array.isArray(events)||events.length<150||events.length>7500)
   throw Error('HOT50_150_CERTIFIED_CELLS_REQUIRED');
 const now=Date.parse(asOf);
 if(!Number.isFinite(now))throw Error('HOT50_ASOF_INVALID');
 const matrix=new Map();
 for(const e of events){
  if(!SOURCES.has(e?.country_iso3)||!CATEGORIES.has(e?.category))
   throw Error('HOT50_EVIDENCE_COUNTRY_CATEGORY_INVALID');
  const key=e.country_iso3+':'+e.category;
  const list=matrix.get(key)??[];
  list.push(e);matrix.set(key,list);
 }
 if(matrix.size!==150)throw Error('HOT50_150_CERTIFIED_CELLS_REQUIRED');
 const countries=RISK_GATE_HOT50.map(iso3=>{
  const ratings={};
  for(const category of HOT50_CATEGORIES){
   const input=matrix.get(iso3+':'+category)??[];
   ratings[category]=scoreQualifiedHot50Cell({iso3,category,evidence:input,asOf:now});
  }
  return {iso3,ratings,composite_score:round(HOT50_CATEGORIES.reduce((s,c)=>s+ratings[c].score,0)/3)};
 });
 const categoryViews={};
 for(const category of HOT50_CATEGORIES){
  const ordered=[...countries].sort((a,b)=>
    b.ratings[category].score-a.ratings[category].score||a.iso3.localeCompare(b.iso3));
  categoryViews[category]=ordered.map((c,i)=>({
    iso3:c.iso3,rank:i+1,ratings:{[category]:c.ratings[category]}
  }));
 }
 const countryViews={};
 for(const row of countries){
  const history=historyByCountry[row.iso3]??null;
  // History is not estimated from today; it MUST come from independently
  // certified historical snapshots. Absence blocks deep-dive publication.
  if(!Array.isArray(history)||history.length<2)continue;
  const valid=history.every(point=>
    Number.isFinite(Date.parse(point.as_of))&&Date.parse(point.as_of)<=now&&
    HOT50_CATEGORIES.every(c=>Number.isFinite(point.scores?.[c])&&
       point.scores[c]>=0&&point.scores[c]<=100)&&
    HEX.test(point.signed_snapshot_sha256??''));
  if(valid)countryViews[row.iso3]={countries:[row],historical_trend:history};
 }
 return {schema:'geomacro.hot50-scored-projections.v1',as_of:asOf,
  countries,category_views:categoryViews,country_views:countryViews,
  total_certified_cells:matrix.size,all_150_present:true,
  historical_countries_certified:Object.keys(countryViews).length,
  score_method:'PRIMARY_EVENT_FRESHNESS_WEIGHTED_RISK_V1',
  score_is_certified_source_truth:false,
  missing_category_never_zero_risk:true,
  nonprobabilistic_uncertainty_bounds:true};
}

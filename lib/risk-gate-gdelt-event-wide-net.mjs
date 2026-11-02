/**
 * Bounded global GDELT 2.0 CAMEO event-index selection, cheap/no AI.
 * This is SOURCE METADATA, NOT an independently verified incident or a GRO.
 * Event CSV's DATEADDED is GDELT index time, not event or article publication.
 */
export const GDELT_RISK_EVENT_SCHEMA="geomacro.risk-gate-gdelt-event-candidates.v1";
export const GDELT_CAMEO_ROOTS=Object.freeze(["10","11","12","13","14","15","16","17","18","19","20"]);
const ROOTS=new Set(GDELT_CAMEO_ROOTS);
const routes=Object.freeze([
 ["hormuz",/\b(?:strait of hormuz|hormuz|gulf of oman)\b/iu],
 ["red-sea",/\b(?:red sea|bab[- ](?:el|al)[- ]mandeb|gulf of aden)\b/iu],
 ["suez",/\b(?:suez|suez canal)\b/iu],
 ["malacca",/\b(?:malacca|straits of malacca)\b/iu],
 ["taiwan-strait",/\b(?:taiwan strait|taiwan straits)\b/iu],
]);
const HEX=/^[a-f0-9]{64}$/u,ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const UTC=/^\d{14}$/u;
// Source wide-net stays bounded even during a global event surge.
export const GDELT_ARCHIVE_MAX_CAMEO_ROWS=30000;
function stamp(x){
 if(typeof x!=="string"||!UTC.test(x))return null;
 const iso=x.slice(0,4)+"-"+x.slice(4,6)+"-"+x.slice(6,8)+"T"+
 x.slice(8,10)+":"+x.slice(10,12)+":"+x.slice(12,14)+".000Z";
 return Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString()===iso?iso:null;
}
export function gdeltRouteHints(name){
 if(typeof name!=="string"||name.length>220)return [];
 return routes.filter(([,re])=>re.test(name)).map(([id])=>id);
}
export function summarizeGdeltRiskEvents(decoded,batchAt,now=Date.now()){
 if(typeof decoded!=="string"||decoded.length>64*1024*1024||
    typeof batchAt!=="string"||!ISO.test(batchAt)||
    !Number.isFinite(Date.parse(batchAt))||
    Date.parse(batchAt)>now||now-Date.parse(batchAt)>2*3600000)
  throw Error("RG_GDELT_BATCH_INVALID");
 let scanned=0,cameo=0,invalid=0,routeMatched=0;
 const riskIndex=[],ids=new Set(),countryCounts=new Map();
 let missing_original_url=0;
 for(const line of decoded.split(/\r?\n/u)){
  if(!line)continue;
  if(++scanned>100000)throw Error("RG_GDELT_SCAN_BOUND_EXCEEDED");
  const f=line.split("\t");
  if(f.length!==61||!/^\d{1,20}$/u.test(f[0])||
     !/^\d{8}$/u.test(f[1])||!/^\d{2}(?:\d{1,2})?$/u.test(f[26])||
     !ISO.test(stamp(f[59])??"")){invalid++;continue}
  const root=f[28];
  if(!ROOTS.has(root)||f[26].slice(0,2)!==root)continue;
  if(ids.has(f[0]))continue;ids.add(f[0]);cameo++;
  const region=gdeltRouteHints(f[52]);
  const fips=/^[A-Z]{2}$/u.test(f[53])?f[53]:null;
  if(fips)countryCounts.set(fips,(countryCounts.get(fips)??0)+1);
  let source;
  try{
   source=new URL(f[60]);
   if(source.protocol!=="https:"||source.port||source.username||
     source.password||source.href.length>2048||
     !/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(source.hostname))source=null;
  }catch{source=null}
  // Only event index facts, timestamp and a single source URL; no source
  // publication time, real-world event confirmation, or rights assertion.
  const candidate={
    gdelt_event_id:f[0],cameo_code:f[26],cameo_root:root,
    gdelt_index_at:stamp(f[59]),gdelt_batch_at:batchAt,
    action_geo_fips:fips,corridor_hints:region,
    source_url:source?.href??null
  };
  if(region.length)routeMatched++;
  if(!source)missing_original_url++;
  if(riskIndex.length>=GDELT_ARCHIVE_MAX_CAMEO_ROWS)
   throw Error("RG_GDELT_CAMEO_ARCHIVE_BOUND_EXCEEDED");
  riskIndex.push(candidate);
 }
 if(scanned===0||scanned===invalid)throw Error("RG_GDELT_NO_VALID_ROWS");
 // D1 is the bounded HOT sample, B2 holds the FULL qualified wide-net
 // event-reference index. Prioritize action-geography corridor hints, then
 // retain country-diverse risk leads. Not an impact score, not event truth.
 const eligible=riskIndex.filter(x=>x.source_url!==null);
 const prioritise=(a,b)=>Number(b.cameo_root)-Number(a.cameo_root)||
   a.gdelt_event_id.localeCompare(b.gdelt_event_id);
 const strategic=eligible.filter(x=>x.corridor_hints.length).sort(prioritise);
 const others=eligible.filter(x=>!x.corridor_hints.length).sort(prioritise);
 const sample=strategic.slice(0,24);
 const chosenIds=new Set(sample.map(x=>x.gdelt_event_id));
 const usedCountries=new Set(sample.map(x=>x.action_geo_fips).filter(Boolean));
 for(const x of others){
  if(sample.length>=40)break;
  if(x.action_geo_fips&&!usedCountries.has(x.action_geo_fips)){
   sample.push(x);chosenIds.add(x.gdelt_event_id);
   usedCountries.add(x.action_geo_fips);
  }
 }
 for(const x of [...strategic,...others]){
  if(sample.length>=40)break;
  if(!chosenIds.has(x.gdelt_event_id)){
   sample.push(x);chosenIds.add(x.gdelt_event_id);
  }
 }

 return {schema:GDELT_RISK_EVENT_SCHEMA,checked_at:new Date(now).toISOString(),
  batch_at:batchAt,rows_scanned:scanned,cameo_shortlisted:cameo,
  route_hint_count:routeMatched,malformed_rows:invalid,
  index_country_fips_counts:[...countryCounts].sort(([a],[b])=>a.localeCompare(b))
   .map(([fips_country_code,indexed_cameo_rows])=>({fips_country_code,indexed_cameo_rows})),
  candidates:sample,
  // All CAMEO event IDs, CAMEO classes, geography and URL references remain
  // available to the B2 writer (converted to SHA256 there, never raw persisted).
  archive_candidates:riskIndex,
  archive_candidate_count:riskIndex.length,
  valid_original_link_count:eligible.length,
  missing_original_link_count:missing_original_url,
  archive_truncated:false,
  d1_hot_sample_count:sample.length,
  publication_time_verified:false,original_event_verified:false,
  index_is_not_independent_corroboration:true,commercial_rights_verified:false,
  signed_gro_generated:false,chargeable:false,predge_writes:0};
}
export function validGdeltPrivateItem(x,now=Date.now()){
 return Boolean(x&&typeof x==="object"&&!Array.isArray(x)&&
  Object.keys(x).sort().join("|")===[
   "id","gdelt_event_id","cameo_code","cameo_root","gdelt_index_at","gdelt_batch_at",
   "action_geo_fips","corridor_hints","source_url_sha256","archive_sha256",
   "source_evidence_verified","event_verified","commercial_rights_verified",
   "signed_gro_generated","chargeable"
  ].sort().join("|")&&
  HEX.test(x.id)&&HEX.test(x.source_url_sha256)&&HEX.test(x.archive_sha256)&&
  typeof x.gdelt_event_id==="string"&&/^\d{1,20}$/u.test(x.gdelt_event_id)&&
  /^\d{2}(?:\d{1,2})?$/u.test(x.cameo_code)&&
  x.cameo_root===x.cameo_code.slice(0,2)&&ROOTS.has(x.cameo_root)&&
  ISO.test(x.gdelt_index_at)&&ISO.test(x.gdelt_batch_at)&&
  Date.parse(x.gdelt_index_at)<=now+5*60000&&
  now-Date.parse(x.gdelt_index_at)<=72*3600000&&
  Date.parse(x.gdelt_batch_at)<=now&&now-Date.parse(x.gdelt_batch_at)<=2*3600000&&
  (x.action_geo_fips===null||/^[A-Z]{2}$/u.test(x.action_geo_fips))&&
  Array.isArray(x.corridor_hints)&&x.corridor_hints.length<=5&&
  x.corridor_hints.every(r=>routes.some(([id])=>id===r))&&
  new Set(x.corridor_hints).size===x.corridor_hints.length&&
  x.source_evidence_verified===false&&x.event_verified===false&&
  x.commercial_rights_verified===false&&x.signed_gro_generated===false&&
  x.chargeable===false);
}

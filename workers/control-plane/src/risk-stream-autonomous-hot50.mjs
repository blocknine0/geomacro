/**
 * Continuously rotating Hot50 x 3-category research / corroboration census.
 * Reuses five existing non-commercial D1 lanes, real stream originals and
 * Google News global discovery index. An index is NEVER an original publisher,
 * a licence, a verified independent event or a paid/signed GRO.
 * The existing stream Queue and dual-attester pipeline alone sign original GROs.
 */
import {RISK_GATE_HOT50,hot50RiskGateEnabled} from "./risk-gate-hot50-scope.mjs";
import {phase2hCountry} from "../../../scripts/lib/phase2h-country-originals-195.mjs";
import {riskPublisherSearchPlan} from "./risk-gate-global-news-search.mjs";
import {parseGoogleRiskRss} from "./daily-risk-gate-generator.mjs";
import {verifyGeoMacroSevenDayHistory} from "./risk-stream-seven-day-chain.mjs";

export const HOT50_STREAM_CATEGORIES=Object.freeze([
 "GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const LEGACY=Object.freeze({geopolitics:"GEOPOLITICS",macro:"MACRO_FX",
 rare_earth:"CRITICAL_MINERALS"});
const ROLES=Object.freeze({GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]});
const WINDOW=48*3600000,MAX_ROWS=400;
const RETRYABLE_D1=/(?:\b503\b|\b429\b|SQLITE_BUSY|D1_ERROR|OVERLOADED|TIMEOUT|UNAVAILABLE)/iu;
async function retryD1(operation){
 for(let attempt=0;attempt<4;attempt++){
  try{return await operation()}catch(error){
   if(attempt===3||!RETRYABLE_D1.test(String(error?.message??"")))throw error;
   await new Promise(resolve=>setTimeout(resolve,100*2**attempt));
  }
 }
 fail("D1_RETRY_EXHAUSTED");
}
const encode=s=>new TextEncoder().encode(s);
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",encode(s)))]
 .map(b=>b.toString(16).padStart(2,"0")).join("");
const iso=n=>new Date(n).toISOString();
const HEX64=/^[a-f0-9]{64}$/u;
const decodeB64=s=>{
 if(typeof s!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/u.test(s))return null;
 try{
  const result=Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  return btoa(String.fromCharCode(...result))===s?result:null;
 }catch{return null}
};
/**
 * Independent projection readback: the existence of a D1 GRO row is not a
 * cryptographic signature proof. Never give a Standard-ready reference to a
 * tampered/mismatched/unpinned/expired GRO.
 */
export async function verifyHot50SignedGroReadbacks(rows,env,now=Date.now()){
 if(!Array.isArray(rows)||rows.length>MAX_ROWS||!Number.isFinite(now))
  fail("SIGNED_ROWS_INVALID");
 if(!rows.length)return [];
 const keyBytes=decodeB64(env?.RISK_STREAM_GRO_VERIFY_SPKI_B64);
 if(keyBytes?.length!==44)return [];
 let publicKey;
 try{
  publicKey=await crypto.subtle.importKey("spki",keyBytes,
    {name:"Ed25519"},false,["verify"]);
 }catch{return []}
 const results=[];
 for(const row of rows){
  if(!HEX64.test(row?.gro_id??"")||!HEX64.test(row?.payload_sha256??"")||
     !HEX64.test(row?.event_fingerprint??"")||
     typeof row?.payload_json!=="string"||row.payload_json.length>18000)
    continue;
  if(await hash(row.payload_json)!==row.payload_sha256)continue;
  let p;
  try{p=JSON.parse(row.payload_json)}catch{continue}
  const originalIds=p.source_originals;
  if(p.schema!=="geomacro.event-stream-gro.v1"||
     p.subject?.type!=="COUNTRY"||p.subject.id!==row.country_iso3||
     p.category!==row.category||p.event_fingerprint!==row.event_fingerprint||
     p.expires_at!==row.expires_at||
     !Array.isArray(originalIds)||originalIds.length!==2||
     originalIds.some(x=>!HEX64.test(x))||
     originalIds[0]>=originalIds[1]||
     await hash(JSON.stringify(originalIds))!==row.gro_id||
     p.customer_delivery_authorized!==false||p.charged!==false||
     p.execution_authorized!==false||p.certified_risk_index!==false||
     p.evidence_and_confidence?.corroborated_originals!==2||
     p.evidence_and_confidence?.independent_parent_entities!==2||
     p.evidence_and_confidence?.source_rights_and_origins!=="DUAL_MACHINE_ATTESTED"||
     p.evidence_and_confidence?.raw_sources_not_republished!==true||
     !Number.isFinite(Date.parse(p.generated_at))||
     Date.parse(p.generated_at)>now+60000||
     !Number.isFinite(Date.parse(p.expires_at))||Date.parse(p.expires_at)<=now)
    continue;
  const signature=decodeB64(row.signature_b64);
  if(signature?.length!==64)continue;
  let verified=false;
  try{verified=await crypto.subtle.verify("Ed25519",
    publicKey,signature,encode(row.payload_json))}catch{/* HOLD */}
  if(verified)results.push({...row,source_originals:originalIds,
    signature_verified:true});
 }
 return results;
}
const fail=code=>{throw Error("RISK_STREAM_HOT50_"+code)};
const key=x=>x.country_iso3+"|"+x.category;
const validRoot=h=>typeof h==="string"&&/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/u.test(h);
const recent=(v,now)=>Number.isFinite(Date.parse(v))&&
 Date.parse(v)<=now+60000&&now-Date.parse(v)<=WINDOW;
export const HOT50_STREAM_TARGETS=Object.freeze(RISK_GATE_HOT50.flatMap(country_iso3=>
 HOT50_STREAM_CATEGORIES.map(category=>Object.freeze({
  country_iso3,category,name:phase2hCountry(country_iso3)?.name
 }))));
if(HOT50_STREAM_TARGETS.length!==150||HOT50_STREAM_TARGETS.some(x=>!x.name))
 fail("COUNTRY_REGISTRY_DRIFT");

/** Consecutive cron-minute rotation: each slot visited within 75 minutes at
 * default 2 cells/min, with no long-running timer or manual dispatch. */
export function planHot50StreamCells(now=Date.now(),perTick=2){
 if(!Number.isFinite(now)||!Number.isInteger(perTick)||perTick<1||perTick>5)
  fail("SCAN_PACE_INVALID");
 const start=((Math.floor(now/60000)*perTick)%150+150)%150;
 return Array.from({length:perTick},(_,i)=>HOT50_STREAM_TARGETS[(start+i)%150]);
}
function sameEventOriginalPair(rows,category,now,signed=[]){
 const trusted=rows.filter(r=>r.category===category&&r.original_verified===1&&
   r.enabled===1&&r.commercial_rights_approved===1&&
   recent(r.published_at,now)&&
   (Number.isFinite(Date.parse(r.rights_expire_at))&&
    Date.parse(r.rights_expire_at)>now));
 trusted.sort((a,b)=>Date.parse(a.published_at)-Date.parse(b.published_at));
 let first=null;
 for(let i=0;i<trusted.length;i++)for(let j=i+1;j<trusted.length;j++){
  const a=trusted[i],b=trusted[j];
  if(Date.parse(b.published_at)-Date.parse(a.published_at)>WINDOW)break;
  if(a.event_fingerprint!==b.event_fingerprint||
     a.source_id===b.source_id||a.publisher_root_domain===b.publisher_root_domain||
     a.parent_media_entity===b.parent_media_entity||
     !validRoot(a.publisher_root_domain)||!validRoot(b.publisher_root_domain)||
     !ROLES[category].every(role=>[a.source_role,b.source_role].includes(role)))
    continue;
  const candidate={event_fingerprint:a.event_fingerprint,domains:2,
   observation_ids:[a.observation_id,b.observation_id].sort()};
  if(!first)first=candidate;
  // A cell may contain several valid events. Choose the pair for which an
  // independently verified signed GRO actually exists, rather than the
  // oldest pair that may not yet have completed the signing queue.
  if(signed.some(g=>g.signature_verified===true&&
    g.event_fingerprint===candidate.event_fingerprint&&
    JSON.stringify(g.source_originals)===JSON.stringify(candidate.observation_ids)))
   return candidate;
 }
 return first;
}
/** An unverified lead counts toward Basic research, NEVER paid Standard.
 * Search publisher domains are hints even if distinct; two search hits do
 * not satisfy independent same-event originals. */
export function projectHot50StreamCell(target,{
 discovery=[],evidence=[],search=[],signed=[]
}={},now=Date.now()){
 if(!RISK_GATE_HOT50.includes(target?.country_iso3)||
   !HOT50_STREAM_CATEGORIES.includes(target?.category))fail("CELL_SCOPE_INVALID");
 const match=r=>r.country_iso3===target.country_iso3&&
  (LEGACY[r.category]??r.category)===target.category;
 const d=discovery.filter(r=>match(r)&&recent(r.source_clock_at,now));
 const e=evidence.filter(r=>match(r)&&recent(r.published_at,now));
 const s=search.filter(r=>match(r)&&recent(r.published_at,now));
 const pool=new Set([
  ...d.map(x=>"discovery:"+x.signal_id),
  ...e.map(x=>"stream:"+x.observation_id),
  ...s.map(x=>"search:"+x.lead_id)
 ]);
 const pair=sameEventOriginalPair(e,target.category,now,signed.filter(match));
 const gro=signed.find(x=>match(x)&&pair&&x.signature_verified===true&&
  x.event_fingerprint===pair.event_fingerprint&&
  JSON.stringify(x.source_originals)===JSON.stringify(pair.observation_ids)&&
  Date.parse(x.expires_at)>now);
 const domains=new Set(e.filter(x=>x.original_verified===1&&
   x.enabled===1&&x.commercial_rights_approved===1&&recent(x.published_at,now)&&
   Number.isFinite(Date.parse(x.rights_expire_at))&&Date.parse(x.rights_expire_at)>now)
   .map(x=>x.publisher_root_domain)).size;
 const lanes=[...new Set([
  ...d.map(x=>x.lane),
  ...e.map(x=>x.original_verified===1?"verified_original":"unverified_stream"),
  ...s.map(()=>"global_search")
 ])].sort();
 return {
  signal_count:pool.size,original_domains:domains,original_same_event_pair:!!pair,
  source_lanes:lanes,
  basic_status:pool.size?"BASIC_RESEARCH_AUTOPUBLISHED":"NO_SIGNALS",
  standard_status:gro?"SIGNED_INTERNAL_GRO_AVAILABLE":"HOLD_SAME_EVENT_ATTESTED_ORIGINALS",
  complex_status:"HOLD_SEVEN_DAY_PROVIDER_PROOF",
  source_gro_id:gro?.gro_id??null,
  // Recheck signed GRO and source rights in the independent commercial issuer.
  qualified_for_automatic_commercial_release:false,
  needs_search:!pair,original_publisher_text_included:false
 };
}
async function boundedRead(db,sql,args){
 const response=await retryD1(()=>db.prepare(sql).bind(...args).all());
 if(!Array.isArray(response?.results)||response.results.length>MAX_ROWS)
  fail("PROVIDER_D1_READBACK_LIMIT");
 return response.results;
}
async function loadPulse(db,targets,now){
 const countries=JSON.stringify([...new Set(targets.map(x=>x.country_iso3))]);
 const cutoff=iso(now-WINDOW),until=iso(now);
 const [discovery,evidence,search,signed,snapshot]=await Promise.all([
  boundedRead(db,"SELECT signal_id,lane,category,country_iso3,source_clock_at "+
   "FROM derived_risk_gate_all_discovery_signals WHERE country_iso3 IN "+
   "(SELECT value FROM json_each(?)) AND source_clock_at>=? "+
   "AND source_clock_at<=? LIMIT 401",[countries,cutoff,until]),
  boundedRead(db,"SELECT e.observation_id,e.country_iso3,e.category,e.event_fingerprint,"+
   "e.source_id,e.publisher_root_domain,e.parent_media_entity,e.source_role,"+
   "e.original_verified,e.published_at,s.enabled,s.commercial_rights_approved,"+
   "s.rights_expire_at FROM risk_stream_evidence e "+
   "LEFT JOIN risk_stream_sources s ON e.source_id=s.source_id "+
   "WHERE e.country_iso3 IN (SELECT value FROM json_each(?)) "+
   "AND e.published_at>=? AND e.published_at<=? LIMIT 401",
   [countries,cutoff,until]),
  boundedRead(db,"SELECT lead_id,country_iso3,category,published_at,"+
   "publisher_root_domain FROM risk_stream_global_search_leads WHERE "+
   "country_iso3 IN (SELECT value FROM json_each(?)) "+
   "AND published_at>=? AND published_at<=? LIMIT 401",[countries,cutoff,until]),
  boundedRead(db,"SELECT gro_id,country_iso3,category,event_fingerprint,expires_at,"+
   "payload_json,payload_sha256,signature_b64 "+
   "FROM risk_stream_signed_gro WHERE country_iso3 IN "+
   "(SELECT value FROM json_each(?)) AND expires_at>? LIMIT 401",[countries,iso(now)]),
  boundedRead(db,"SELECT country_iso3,category,next_search_at "+
   "FROM risk_stream_hot50_cell_snapshots WHERE country_iso3 IN "+
   "(SELECT value FROM json_each(?)) LIMIT 151",[countries])
 ]);
 return {discovery,evidence,search,signed,prior:new Map(snapshot.map(r=>[key(r),r]))};
}
/** One restricted Google News metadata-only search. No automatic publisher
 * full-text fetch, no unlicensed text copying and no synthetic event claims. */
export async function probeHot50GlobalSearch(target,{now=Date.now(),fetcher=fetch}={}){
 const plan=riskPublisherSearchPlan({name:target.name,category:target.category},now);
 const url=new URL(plan.url);
 // Two-day discovery is the maximum event-corroboration window.
 url.searchParams.set("q",url.searchParams.get("q").replace(/when:24h$/u,"when:2d"));
 let response;
 try{
  response=await fetcher(url.href,{method:"GET",redirect:"manual",
   headers:{"Accept":"application/rss+xml,application/xml;q=0.9"},
   signal:AbortSignal.timeout(8000)});
 }catch{return {status:"SEARCH_NETWORK_UNAVAILABLE",leads:[]};}
 if(response?.status===429)return {status:"SEARCH_RATE_LIMITED",leads:[]};
 if(response?.status!==200||response.redirected||
   response.url&&new URL(response.url).hostname!=="news.google.com"||
   Number(response.headers?.get("content-length")??0)>250000)
  return {status:"SEARCH_PROVIDER_UNAVAILABLE",leads:[]};
 let text;try{text=await response.text()}catch{
  return {status:"SEARCH_NETWORK_UNAVAILABLE",leads:[]};
 }
 if(encode(text).length>250000)return {status:"SEARCH_RESPONSE_OVERSIZE",leads:[]};
 const rows=await parseGoogleRiskRss(text,now),leads=[],seen=new Set();
 for(const r of rows){
  const domain=r.publisher_host?.replace(/^www\./u,"");
  if(!validRoot(domain)||!recent(r.published_at,now)||
     !/^[0-9a-f]{64}$/u.test(r.title_hash??"")||seen.has(domain))continue;
  seen.add(domain);
  leads.push({lead_id:await hash("hot50-search\n"+target.country_iso3+"\n"+
    target.category+"\n"+r.id),country_iso3:target.country_iso3,
   category:target.category,publisher_root_domain:domain,
   index_record_sha256:r.id,index_link_sha256:await hash(r.url),
   title_sha256:r.title_hash,published_at:r.published_at});
  if(leads.length===10)break;
 }
 return {status:leads.length?"SEARCH_INDEX_LEADS_FOUND":"SEARCH_NO_INDEX_LEADS",
  leads,originals_verified:0,independent_same_event_verified:false,
  commercial_rights_verified:false};
}
async function persistCell(db,target,projection,probe,now){
 const stamp=iso(now),next=iso(now+(probe.status==="SEARCH_RATE_LIMITED"?3600000:
  probe.status==="SEARCH_NETWORK_UNAVAILABLE"||probe.status==="SEARCH_PROVIDER_UNAVAILABLE"?
   20*60000:15*60000));
 const statements=[];
 if(probe.leads.length){
  const placeholders=probe.leads.map(()=>
   "(?,?,?,?,?,?,?,?,?,0,0)").join(",");
  const bindings=probe.leads.flatMap(x=>[
   x.lead_id,x.country_iso3,x.category,x.publisher_root_domain,
   x.index_record_sha256,x.index_link_sha256,x.title_sha256,x.published_at,stamp
  ]);
  if(bindings.length>90)fail("D1_PARAMETER_CAP");
  statements.push(db.prepare("INSERT OR IGNORE INTO risk_stream_global_search_leads "+
   "(lead_id,country_iso3,category,publisher_root_domain,index_record_sha256,"+
   "index_link_sha256,title_sha256,published_at,first_seen_at,original_verified,"+
   "commercial_rights_approved) VALUES "+placeholders).bind(...bindings));
 }
 // Basic is an unverified research projection, not a customer licence.
 // Search leads become Basic only AFTER the atomic D1 commit/readback.
 const count=projection.signal_count+probe.leads.filter(x=>
  !projection.existing_search_ids?.includes(x.lead_id)).length;
 statements.push(db.prepare(
  "INSERT INTO risk_stream_hot50_cell_snapshots(country_iso3,category,refreshed_at,"+
  "signal_count,original_domains,original_same_event_pair,source_lanes_json,"+
  "basic_status,standard_status,complex_status,source_gro_id,last_search_status,"+
  "next_search_at,original_publisher_text_included,commercial_release_authorized) "+
  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0) "+
  "ON CONFLICT(country_iso3,category) DO UPDATE SET "+
  "refreshed_at=excluded.refreshed_at,signal_count=excluded.signal_count,"+
  "original_domains=excluded.original_domains,"+
  "original_same_event_pair=excluded.original_same_event_pair,"+
  "source_lanes_json=excluded.source_lanes_json,basic_status=excluded.basic_status,"+
  "standard_status=excluded.standard_status,complex_status=excluded.complex_status,"+
  "source_gro_id=excluded.source_gro_id,last_search_status=excluded.last_search_status,"+
  "next_search_at=excluded.next_search_at "+
  "WHERE excluded.refreshed_at>=risk_stream_hot50_cell_snapshots.refreshed_at"
 ).bind(target.country_iso3,target.category,stamp,count,projection.original_domains,
  projection.original_same_event_pair?1:0,
  JSON.stringify([...new Set([...projection.source_lanes,
   ...(probe.leads.length?["global_search"]:[])])].sort()),
  count?"BASIC_RESEARCH_AUTOPUBLISHED":"NO_SIGNALS",projection.standard_status,
  projection.complex_status,projection.source_gro_id,probe.status,next));
 const applied=await retryD1(()=>db.batch(statements));
 if(!Array.isArray(applied)||applied.length!==statements.length||
   applied.some(r=>r?.success!==true))fail("D1_ATOMIC_WRITE_UNVERIFIED");
 const saved=await retryD1(()=>db.prepare(
  "SELECT signal_count,last_search_status,basic_status,standard_status,"+
  "commercial_release_authorized,original_publisher_text_included "+
  "FROM risk_stream_hot50_cell_snapshots WHERE country_iso3=? AND category=?"
 ).bind(target.country_iso3,target.category).first());
 if(saved?.signal_count!==count||saved.last_search_status!==probe.status||
   saved.basic_status!==(count?"BASIC_RESEARCH_AUTOPUBLISHED":"NO_SIGNALS")||
   saved.standard_status!==projection.standard_status||
   saved.commercial_release_authorized!==0||
   saved.original_publisher_text_included!==0)
  fail("D1_CELL_READBACK_INVALID");
 return count;
}
/**
 * Complex status is granted only after the existing actual 7-day Ed25519 +
 * private R2 verifier passes. Cheap day census prevents seven R2 GETs on
 * cells that cannot possibly qualify.
 */
export async function verifyHot50ComplexCell(env,target,{currentGroId,now=Date.now()}={}){
 if(!currentGroId||env?.GEOMACRO_COMMERCIAL_STREAM_RELEASE!=="1"||
   env?.RISK_STREAM_CANARY_HOLD_CLEARED!=="1"||
   env?.RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED!=="1")
  return "HOLD_SEVEN_DAY_PROVIDER_PROOF";
 const day=iso(now-7*86400000),end=iso(now);
 const count=await retryD1(()=>env.DB.prepare(
  "SELECT COUNT(DISTINCT day_utc) AS days FROM risk_stream_commercial_risk_chain "+
  "WHERE country_iso3=? AND category=? AND observed_at>=? AND observed_at<=?"
 ).bind(target.country_iso3,target.category,day,end).first());
 if(!Number.isSafeInteger(Number(count?.days))||Number(count?.days)<7)
  return "HOLD_SEVEN_DAY_PROVIDER_PROOF";
 try{
  const proof=await verifyGeoMacroSevenDayHistory(env,{
   country_iso3:target.country_iso3,category:target.category,now});
  return proof.status==="PROVIDER_BACKED_SEVEN_DAY_SIGNED_CHAIN_PASS"&&
   proof.verified_days===7&&proof.private_r2_readback_verified===true?
   proof.status:"HOLD_SEVEN_DAY_PROVIDER_PROOF";
 }catch{return "HOLD_SEVEN_DAY_PROVIDER_PROOF"}
}
export async function runHot50AutonomousStreamTick(env,{
 now=Date.now(),fetcher=fetch,perTick=2
}={}){
 if(env?.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED!=="1"||
   env.RISK_STREAM_ACTIVE!=="1"||env.STREAM_INGESTION_ENABLED!=="true"||
   !hot50RiskGateEnabled(env)||!env.DB?.prepare||!env.DB?.batch)
  return {status:"HOLD_AUTONOMOUS_STREAM_DISABLED",cells_checked:0};
 const targets=planHot50StreamCells(now,perTick),pool=await loadPulse(env.DB,targets,now);
 const storedGroRows=pool.signed.length;
 pool.signed=await verifyHot50SignedGroReadbacks(pool.signed,env,now);
 let basic=0,internalStandard=0,searches=0,leads=0,held=0,complexReady=0;
 for(const target of targets){
  const projection=projectHot50StreamCell(target,pool,now);
  const earlier=pool.prior.get(key(target));
  const due=projection.needs_search&&
   (!earlier||Date.parse(earlier.next_search_at)<=now);
  const probe=due?await probeHot50GlobalSearch(target,{now,fetcher}):
   {status:projection.needs_search?"SEARCH_COOLDOWN":"ATTESTED_INTERNAL_GRO",leads:[]};
  searches+=Number(due);
  leads+=probe.leads.length;
  const complex=await verifyHot50ComplexCell(env,target,{
   currentGroId:projection.source_gro_id,now});
  const signalCount=await persistCell(env.DB,target,{
   ...projection,complex_status:complex,existing_search_ids:pool.search.map(x=>x.lead_id)
  },probe,now);
  complexReady+=Number(complex==="PROVIDER_BACKED_SEVEN_DAY_SIGNED_CHAIN_PASS");
  basic+=Number(signalCount>0);
  internalStandard+=Number(projection.source_gro_id!==null);
  held+=Number(projection.standard_status.startsWith("HOLD_"));
 }
 return {status:"HOT50_RESEARCH_TICK_D1_READBACK_PASS",
  cells_checked:targets.length,total_cells:150,categories:HOT50_STREAM_CATEGORIES,
  basic_research_cells:basic,internal_signed_standard_cells:internalStandard,
  standard_hold_cells:held,complex_verified_cells:complexReady,
  rejected_unsigned_or_tampered_gro_rows:storedGroRows-pool.signed.length,
  global_search_probes:searches,index_leads_saved:leads,
  licensed_deliveries_performed:0,commercial_release_unchanged:true,
  certification_from_index_hits:false,raw_publisher_text_stored:false};
}

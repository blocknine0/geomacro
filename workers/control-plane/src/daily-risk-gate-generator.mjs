/**
 * D1-first, no-paid-provider, daily corridor Risk Gate snapshots.
 * Same observation generates CORE / SIGNAL / POLICY records once per UTC day.
 * This scheduled lane never charges a customer or signs assertions of event truth.
 */
import {dedupeObservedPublications} from "./risk-gate-controlled-bypass.mjs";
import {verifyHotGRO} from "./predge-risk-gate-d1.mjs";
export const DAILY_RG_SCHEMA="geomacro.daily-tiered-risk-gates.v1";
export const DAILY_RG_CORRIDORS=Object.freeze([
 {id:"bab-el-mandeb",native:"bab_el_mandeb",keywords:'("Bab el Mandeb" OR "Red Sea") (ship OR missile OR attack OR Houthi)'},
 {id:"red-sea",native:"red_sea",keywords:'"Red Sea" (shipping OR vessel OR attacks)'},
 {id:"hormuz",native:"strait_of_hormuz",keywords:'"Strait of Hormuz" (oil OR tanker OR ship)'},
 {id:"suez",native:"suez_canal",keywords:'"Suez Canal" (shipping OR transit OR disruption)'},
 {id:"malacca",native:"strait_of_malacca",keywords:'"Strait of Malacca" (ship OR piracy OR traffic)'},
 {id:"taiwan-strait",native:"taiwan_strait",keywords:'"Taiwan Strait" (shipping OR blockade OR military)'},
 {id:"panama",native:"panama_canal",keywords:'"Panama Canal" (transit OR drought OR shipping)'},
 {id:"singapore-strait",native:"singapore_strait",keywords:'"Singapore Strait" (shipping OR piracy OR vessel)'},
 {id:"south-china-sea",native:"south_china_sea",keywords:'"South China Sea" (shipping OR maritime OR blockade)'},
 {id:"gulf-of-aden",native:"gulf_of_aden_somali_basin",keywords:'"Gulf of Aden" (vessel OR piracy OR maritime)'},
 {id:"gulf-of-guinea",native:"gulf_of_guinea",keywords:'"Gulf of Guinea" (ship OR piracy OR oil)'},
 {id:"black-sea-grain",native:"black_sea_grain_kerch",keywords:'"Black Sea" (grain OR shipping OR Kerch)'}
]);
const DAY=86400000,THREE=3*DAY,TEN=10*DAY,MAX_RSS_BYTES=600000;
const SHA=/^[0-9a-f]{64}$/;
const enc=new TextEncoder();
const iso=ms=>new Date(ms).toISOString();
const json=x=>JSON.stringify(x);
const hash=async v=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(v)))].map(b=>b.toString(16).padStart(2,"0")).join("");
const respond=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
function htmlDecode(s){
 return String(s??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>{
  if(v.startsWith("#")){const n=v[1].toLowerCase()==="x"?parseInt(v.slice(2),16):parseInt(v.slice(1),10);
   return n>=32&&n<=0x10ffff?String.fromCodePoint(n):"";}
  return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'"}[v.toLowerCase()]??"";
 });
}
const xmlTag=(body,tag)=>htmlDecode(body.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"))?.[1]??"").trim();
const hostname=url=>{try{const u=new URL(url);return u.protocol==="https:"?u.hostname.toLowerCase().replace(/^www\./,""):""}catch{return ""}};
const safeDate=(v,now)=>{const t=Date.parse(v);return Number.isFinite(t)&&t<=now+60000&&now-t<=DAY?iso(t):null};
/**
 * Parse bounded Google News RSS item metadata. <source url> is third-party
 * aggregation attribution, NOT independent verification or origin proof.
 */
export async function parseGoogleRiskRss(xml,now=Date.now()){
 if(typeof xml!=="string"||enc.encode(xml).length>MAX_RSS_BYTES)return [];
 const items=[],seen=new Set();
 const matches=xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi);
 for(const m of matches){
  if(items.length>=20)break;
  const body=m[1], title=xmlTag(body,"title").slice(0,300),
   link=xmlTag(body,"link"),published=safeDate(xmlTag(body,"pubDate"),now);
  const source=m[1].match(/<source\b[^>]*\burl\s*=\s*["']([^"']+)["'][^>]*>/i);
  const publisher=source?htmlDecode(source[1]):"";
  if(!title||title.length<10||!published||!hostname(link)||!hostname(publisher))continue;
  const fingerprint=await hash(title.normalize("NFKC").trim().toLowerCase());
  const id=await hash("google-news-rss\n"+link+"\n"+published);
  if(seen.has(id))continue;
  seen.add(id);
  items.push({id,source_id:"google_news_rss_aggregated",url:link,
   publisher_host:hostname(publisher),title_hash:fingerprint,published_at:published,
   source_published_at:published,attribution_kind:"THIRD_PARTY_AGGREGATOR",original_article_verified:false});
 }
 return items;
}
const registry=id=>DAILY_RG_CORRIDORS.find(c=>c.id===id);
async function rssFallback(c,{fetcher=fetch,now=Date.now()}={}){
 const url="https://news.google.com/rss/search?q="+encodeURIComponent(c.keywords+" when:24h")+"&hl=en-US&gl=US&ceid=US:en";
 const response=await fetcher(url,{redirect:"manual",signal:AbortSignal.timeout(7000),
  headers:{"Accept":"application/rss+xml, application/xml;q=0.9","User-Agent":"GeoMacro-Risk-Observation/1.0"}});
 if(response.status!==200||response.url&&new URL(response.url).hostname!=="news.google.com")
  throw Error("RG_GOOGLE_RSS_HTTP_INVALID");
 const length=Number(response.headers.get("content-length")||0);
 if(!Number.isFinite(length)||length>MAX_RSS_BYTES)throw Error("RG_GOOGLE_RSS_TOO_LARGE");
 const text=await response.text();
 return parseGoogleRiskRss(text,now);
}
async function d1Evidence(env,c,now){
 const since=iso(now-DAY),until=iso(now);
 const rows=(await env.DB.prepare("SELECT candidate_id,source_id,native_published_at,article_url,source_title_sha256,candidate_corridor_ids_json FROM corridor_native_news_candidates WHERE native_published_at>=? AND native_published_at<=? AND instr(candidate_corridor_ids_json,?)>0 ORDER BY native_published_at DESC LIMIT 40")
  .bind(since,until,'"'+c.native+'"').all())?.results??[];
 if(!Array.isArray(rows))throw Error("RG_NATIVE_D1_ROWS_MISSING");
 return rows.filter(r=>{try{return JSON.parse(r.candidate_corridor_ids_json).includes(c.native)}catch{return false}})
  .map(r=>({id:r.candidate_id,source_id:r.source_id,url:r.article_url,
   title_hash:r.source_title_sha256,published_at:r.native_published_at,
   attribution_kind:"DIRECT_NATIVE_REFERENCE",original_article_verified:false}));
}
async function gdeltIndexCount(env,c,now){
 try{
  const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT event_ref_id FROM risk_gate_gdelt_event_index WHERE gdelt_index_at>=? AND instr(corridor_hints_json,?)>0 LIMIT 50)")
   .bind(iso(now-DAY),'"'+c.native+'"').first();
  return Number.isInteger(r?.n)?Math.min(r.n,50):0;
 }catch{return 0}
}
async function signedGroForCorridor(env,c,now){
 try{
  const row=await env.DB.prepare("SELECT * FROM corridor_gro_verified_hot WHERE corridor_id=? AND generated_at<=? AND expires_at>? LIMIT 1")
   .bind(c.id,iso(now),iso(now)).first();
  return row?await verifyHotGRO(row,env,{type:"corridor",id:c.id},now):null;
 }catch{return null}
}
async function observationProof(snapshot,secret,now){
 if(typeof secret!=="string"||enc.encode(secret).length<32)throw Error("RG_OBSERVATION_HMAC_MISSING");
 const observation_hash=await hash(json(snapshot));
 const timestamp_utc=iso(now);
 const data=json({schema:DAILY_RG_SCHEMA,observation_hash,timestamp_utc});
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,enc.encode(data));
 return {observation_hash,timestamp_utc,integrity_signature:"hmac_sha256:"+
  [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join(""),
  signature_scope:"OBSERVATION_INTEGRITY_NOT_EVENT_TRUTH"};
}
export function deriveDailyRiskTiers({corridor_id,observation,gro=null}){
 const observed=observation.sources_observed;
 const preliminary=observed?Math.min(0.65,0.40+0.05*Math.min(observation.domains_observed,5)):null;
 const verified=gro?.verification?.status==="VERIFIED"&&gro?.commercial_eligibility?.status==="VERIFIED"&&
  gro?.decision_readiness?.status!=="UNREADY";
 const core={tier:"CORE",gate_decision:"GATE_INSUFFICIENT_EVIDENCE",
  evidence_state:verified?"SIGNED_GRO_AVAILABLE_POLICY_REQUIRED":"REQUIRES_VERIFIED_SIGNED_GRO",
  signed_gro_object_id:verified?gro.object_id:null,
  confidence_score:verified?gro.confidence:null,customer_policy_required:true,automatic_action:false};
 const signal={tier:"SIGNAL",gate_decision:"GATE_ADVISORY",
  confidence_score:preliminary,confidence_method:"PUBLICATION_HEURISTIC_NOT_EVENT_PROBABILITY",
  observed_publications:observed,source_domains:observation.domains_observed,
  evidence_state:observed?"OBSERVED_UNVERIFIED":"NO_FRESH_OBSERVATIONS",automatic_action:false};
 const policy={tier:"POLICY",strict_mode:{from_tier:"CORE",gate_decision:core.gate_decision},
  lenient_mode:{from_tier:"SIGNAL",gate_decision:"GATE_ADVISORY",
   requires_client_acknowledgement:true,allowed_recommendations:["OVERRIDE_PASS","OVERRIDE_HOLD"]},
  client_override_applied:false,execution_authorized:false};
 return {core,signal,policy};
}
async function existingSnapshot(env,c,day){
 return env.DB.prepare("SELECT corridor_id,day_utc,core_tier_json,signal_tier_json,policy_tier_json,observation_json,hmac_proof_json,content_sha256,generated_at,supabase_synced_at FROM daily_tiered_risk_gates WHERE corridor_id=? AND day_utc=?")
  .bind(c,day).first();
}
async function supabaseSettings(env){
 if(env?.RISK_GATE_SUPABASE_ACCEPTANCE!=="ACCEPTED_PRIVATE_RISK_GATE_DAILY")return null;
 const url=String(env?.RISK_GATE_SUPABASE_URL??"").replace(/\/$/,"");
 const key=String(env?.RISK_GATE_SUPABASE_SERVICE_ROLE_KEY??"");
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||key.length<32)return null;
 return {url,key};
}
async function remote(cfg,path,options={},fetcher=fetch){
 const res=await fetcher(cfg.url+path,{...options,redirect:"manual",
  headers:{apikey:cfg.key,Authorization:"Bearer "+cfg.key,Accept:"application/json",...options.headers},
  signal:AbortSignal.timeout(8000)});
 if(!res.ok||res.status>=300)throw Error("RG_SUPABASE_REQUEST_FAILED");
 return res;
}
export async function syncDailyRiskToSupabase(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=await supabaseSettings(env);
 if(!cfg)return {ok:false,enabled:false,error:"RG_SUPABASE_NOT_CONFIGURED"};
 try{
  const rows=(await env.DB.prepare("SELECT corridor_id,day_utc,core_tier_json,signal_tier_json,policy_tier_json,observation_json,hmac_proof_json,content_sha256,generated_at FROM daily_tiered_risk_gates WHERE supabase_synced_at IS NULL ORDER BY generated_at LIMIT 6").all())?.results??[];
  if(!rows.length)return {ok:true,enabled:true,synced:0};
  const payload=rows.map(r=>({corridor_id:r.corridor_id,day_utc:r.day_utc,
   core_tier:JSON.parse(r.core_tier_json),signal_tier:JSON.parse(r.signal_tier_json),
   policy_tier:JSON.parse(r.policy_tier_json),observation:JSON.parse(r.observation_json),
   audit_proof:JSON.parse(r.hmac_proof_json),content_sha256:r.content_sha256,
   generated_at:r.generated_at}));
  await remote(cfg,"/rest/v1/geomacro_daily_tiered_risk_gates?on_conflict=corridor_id,day_utc",
   {method:"POST",headers:{"Content-Type":"application/json",
    Prefer:"resolution=merge-duplicates,return=minimal"},body:json(payload)},fetcher);
  const terms=rows.map(r=>"and(corridor_id.eq."+encodeURIComponent(r.corridor_id)+",day_utc.eq."+r.day_utc+")").join(",");
  const response=await remote(cfg,"/rest/v1/geomacro_daily_tiered_risk_gates?select=corridor_id,day_utc,content_sha256&or=("+terms+")",{},fetcher);
  const read=await response.json();
  if(!Array.isArray(read)||read.length!==rows.length||
   rows.some(r=>!read.some(x=>x.corridor_id===r.corridor_id&&x.day_utc===r.day_utc&&x.content_sha256===r.content_sha256)))
    return {ok:false,enabled:true,error:"RG_SUPABASE_HASH_READBACK_MISMATCH"};
  for(const r of rows)await env.DB.prepare("UPDATE daily_tiered_risk_gates SET supabase_synced_at=? WHERE corridor_id=? AND day_utc=? AND content_sha256=? AND supabase_synced_at IS NULL")
   .bind(iso(now),r.corridor_id,r.day_utc,r.content_sha256).run();
  return {ok:true,enabled:true,synced:rows.length,hash_readback_verified:true};
 }catch{return {ok:false,enabled:true,error:"RG_SUPABASE_SYNC_UNAVAILABLE"}}
}
export async function cleanupDailyRiskSupabase(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=await supabaseSettings(env);
 if(!cfg)return {ok:false,enabled:false,error:"RG_SUPABASE_NOT_CONFIGURED"};
 try{
  const prior=await env.DB.prepare("SELECT next_cleanup_at FROM risk_gate_daily_housekeeping WHERE job_id='supabase_ten_day'").first();
  if(!prior){
   await env.DB.prepare("INSERT OR IGNORE INTO risk_gate_daily_housekeeping(job_id,next_cleanup_at) VALUES('supabase_ten_day',?)").bind(iso(now+TEN)).run();
   return {ok:true,initialized:true,deleted:0};
  }
  if(Date.parse(prior.next_cleanup_at)>now)return {ok:true,not_due:true};
  const cutoff=iso(now-THREE);
  // Delete only records at least 3 days old, once per 10-day cycle.
  await remote(cfg,"/rest/v1/geomacro_daily_tiered_risk_gates?generated_at=lt."+encodeURIComponent(cutoff),
   {method:"DELETE",headers:{Prefer:"return=minimal"}},fetcher);
  const check=await remote(cfg,"/rest/v1/geomacro_daily_tiered_risk_gates?select=corridor_id&generated_at=lt."+encodeURIComponent(cutoff)+"&limit=1",{},fetcher);
  const leftover=await check.json();
  if(!Array.isArray(leftover)||leftover.length)return {ok:false,error:"RG_SUPABASE_CLEANUP_READBACK_FAILED"};
  // D1 hot snapshots are not the customer billing audit. Prune only already-
  // replicated old rows after remote deletion/readback; unsynced data is preserved.
  await env.DB.prepare("DELETE FROM daily_tiered_risk_gates WHERE generated_at<? AND supabase_synced_at IS NOT NULL")
   .bind(cutoff).run();
  // Aligned to last successful cleanup; retries do not skip a failed cleanup.
  await env.DB.prepare("UPDATE risk_gate_daily_housekeeping SET next_cleanup_at=?,last_cleanup_at=? WHERE job_id='supabase_ten_day' AND next_cleanup_at<=?")
   .bind(iso(now+TEN),iso(now),iso(now)).run();
  return {ok:true,retained_minimum_days:3,interval_days:10,delete_before:cutoff,verified:true};
 }catch{return {ok:false,enabled:true,error:"RG_SUPABASE_CLEANUP_UNAVAILABLE"}}
}
export async function generateOneDailyRiskGate(env,c,{now=Date.now(),fetcher=fetch}={}){
 if(!env?.DB?.prepare)return {ok:false,error:"RG_D1_UNAVAILABLE"};
 const day=iso(now).slice(0,10),current=await existingSnapshot(env,c.id,day);
 if(current)return {ok:true,corridor_id:c.id,existing:true,day_utc:day};
 const native=await d1Evidence(env,c,now);
 let observations=native,gapFillStatus="D1_EXISTING";
 if(!native.length){
  gapFillStatus="GOOGLE_RSS_UNAVAILABLE";
  try{observations=await rssFallback(c,{fetcher,now});gapFillStatus="GOOGLE_RSS_METADATA"}catch{/* no invention */}
 }
 const cluster=dedupeObservedPublications(observations);
 const gdelt=await gdeltIndexCount(env,c,now),gro=await signedGroForCorridor(env,c,now);
 const observation={corridor_id:c.id,day_utc:day,observed_at:iso(now),
  source_lane:gapFillStatus,source_records:cluster.items,sources_observed:cluster.source_count,
  domains_observed:cluster.domains_observed,inferred_origin_groups:cluster.inferred_origin_groups,
  independent_origins_verified:gro?.evidence_summary?.independent_source_count??0,
  authoritative_first_party_publications:cluster.authoritative_first_party_publications,
  gdelt_index_candidates_only:gdelt,original_incident_verified:!!gro,
  google_news_is_aggregator:true,commercial_raw_redistribution_authorized:false};
 const tiers=deriveDailyRiskTiers({corridor_id:c.id,observation,gro});
 const canonical={schema:DAILY_RG_SCHEMA,corridor_id:c.id,day_utc:day,
  observation,core_tier:tiers.core,signal_tier:tiers.signal,policy_tier:tiers.policy};
 const proof=await observationProof(canonical,env.RISK_GATE_OBSERVATION_HMAC_KEY,now);
 const content_sha256=await hash(json(canonical));
 await env.DB.prepare("INSERT OR IGNORE INTO daily_tiered_risk_gates (corridor_id,day_utc,core_tier_json,signal_tier_json,policy_tier_json,observation_json,hmac_proof_json,content_sha256,generated_at) VALUES(?,?,?,?,?,?,?,?,?)")
  .bind(c.id,day,json(tiers.core),json(tiers.signal),json(tiers.policy),
   json(observation),json(proof),content_sha256,iso(now)).run();
 const saved=await existingSnapshot(env,c.id,day);
 if(!saved||!SHA.test(saved.content_sha256))return {ok:false,error:"RG_D1_READBACK_MISSING"};
 const reconstructed={schema:DAILY_RG_SCHEMA,corridor_id:c.id,day_utc:day,
  observation:JSON.parse(saved.observation_json),core_tier:JSON.parse(saved.core_tier_json),
  signal_tier:JSON.parse(saved.signal_tier_json),policy_tier:JSON.parse(saved.policy_tier_json)};
 if(await hash(json(reconstructed))!==saved.content_sha256)
  return {ok:false,error:"RG_D1_READBACK_HASH_MISMATCH"};
 return {ok:true,corridor_id:c.id,day_utc:day,evidence:cluster.source_count,
  source_lane:gapFillStatus,d1_readback_verified:true,gro_verified:!!gro,chargeable:false};
}
export async function runDailyRiskGates(env,opts={}){
 const now=opts.now??Date.now(),results=[];
 if(!env?.DB?.prepare)return {ok:false,error:"RG_D1_UNAVAILABLE"};
 const batch=Array.isArray(opts.corridors)?opts.corridors:DAILY_RG_CORRIDORS;
 if(!batch.length||batch.length>2||batch.some(c=>!registry(c.id)))
  return {ok:false,error:"RG_DAILY_BATCH_SIZE_INVALID"};
 for(const c of batch){
  try{results.push(await generateOneDailyRiskGate(env,c,{...opts,now}))}
  catch{results.push({ok:false,corridor_id:c.id,error:"RG_CORRIDOR_GENERATION_FAILED"})}
 }
 const sync=await syncDailyRiskToSupabase(env,{...opts,now});
 return {ok:results.every(x=>x.ok)&&sync.ok,canonical_d1_ok:results.every(x=>x.ok),schema:DAILY_RG_SCHEMA,day_utc:iso(now).slice(0,10),
  corridor_count:results.length,results,supabase_sync:sync,charged_calls:0};
}
async function verifyStoredDaily(row,env){
 const canonical={schema:DAILY_RG_SCHEMA,corridor_id:row.corridor_id,day_utc:row.day_utc,
  observation:JSON.parse(row.observation_json),core_tier:JSON.parse(row.core_tier_json),
  signal_tier:JSON.parse(row.signal_tier_json),policy_tier:JSON.parse(row.policy_tier_json)};
 if(await hash(json(canonical))!==row.content_sha256)return null;
 const proof=JSON.parse(row.hmac_proof_json);
 if(proof.observation_hash!==row.content_sha256||proof.signature_scope!=="OBSERVATION_INTEGRITY_NOT_EVENT_TRUTH")
  return null;
 const secret=String(env.RISK_GATE_OBSERVATION_HMAC_KEY??"");
 if(enc.encode(secret).length<32)return null;
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const mac=String(proof.integrity_signature??"");
 if(!/^hmac_sha256:[a-f0-9]{64}$/.test(mac))return null;
 const bytes=Uint8Array.from(mac.slice(12).match(/.{2}/g),x=>parseInt(x,16));
 const ok=await crypto.subtle.verify("HMAC",key,bytes,enc.encode(json({
  schema:DAILY_RG_SCHEMA,observation_hash:proof.observation_hash,timestamp_utc:proof.timestamp_utc
 })));
 return ok?{canonical,proof}:null;
}
/** Audited D1 projection shared by the daily GET and tiered POST. */
export async function readDailyRiskObservation(env,corridor_id,now=Date.now()){
 if(!registry(corridor_id)||!env?.DB?.prepare)return null;
 const row=await existingSnapshot(env,corridor_id,iso(now).slice(0,10));
 if(!row)return null;
 const trusted=await verifyStoredDaily(row,env);
 return trusted?{...trusted.canonical,audit_proof:trusted.proof,
  generated_at:row.generated_at,supabase_synced:!!row.supabase_synced_at}:null;
}

export async function getDailyRiskGate(env,url,request,now=Date.now()){
 const token=String(env?.RISK_GATE_TIERED_TOKEN??"");
 const given=request.headers.get("authorization")??"";
 if(!SHA.test(token)||given!=="Bearer "+token)return respond({ok:false,error:"RG_TIERED_UNAUTHORIZED"},401);
 const id=url.searchParams.get("corridor_id");
 if(!registry(id))return respond({ok:false,error:"UNKNOWN_CORRIDOR"},400);
 try{
  const verified=await readDailyRiskObservation(env,id,now);
  if(!verified)return respond({ok:false,error:"TODAY_SNAPSHOT_UNAVAILABLE_OR_INVALID",chargeable:false},404);
  return respond({ok:true,...verified,chargeable:false,execution_authorized:false});
 }catch{return respond({ok:false,error:"RG_DAILY_D1_UNAVAILABLE"},503)}
}

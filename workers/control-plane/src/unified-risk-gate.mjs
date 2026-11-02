/** GeoMacro 195x3 + 12 corridor D1-first unified Risk Gate.
 * Privacy: source metadata only, never articles/full headlines; no billing;
 * absence of signed GRO != safe or verified event.
 */
import {PHASE2H_COUNTRIES_195,phase2hCountry,phase2hHeadlineCountryCandidate}
 from "../../../scripts/lib/phase2h-country-originals-195.mjs";
import {DAILY_RG_CORRIDORS,parseGoogleRiskRss} from "./daily-risk-gate-generator.mjs";
import {verifyHotGRO} from "./predge-risk-gate-d1.mjs";
import {CATEGORIES,CATEGORY_SPECS,validatedSignedCategoryScores} from "./unified-risk-categories.mjs";
import {calculateUnifiedRisk,generateCommercialTiers,categoryView} from "./unified-risk-engine.mjs";
export const UNIFIED_SCHEMA="geomacro.unified-risk-gate.v1";
const enc=new TextEncoder(),DAY=86400000,THREE=3*DAY,TEN=10*DAY;
const iso=n=>new Date(n).toISOString();
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))),
 b=>b.toString(16).padStart(2,"0")).join("");
const hex=/^[a-f0-9]{64}$/;
const safeHost=s=>{try{const u=new URL(s);return u.protocol==="https:"?u.hostname.toLowerCase().replace(/^www\./,""):""}catch{return ""}};
const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store","Vary":"Authorization","X-Content-Type-Options":"nosniff"}});
function registry(type,id){
 if(type==="COUNTRY")return phase2hCountry(id);
 if(type==="CORRIDOR")return DAILY_RG_CORRIDORS.find(x=>x.id===id)??null;
 return null;
}
function authorized(request,env){
 const secret=String(env?.RISK_GATE_TIERED_TOKEN??"");
 const supplied=request.headers.get("authorization")??"";
 if(!hex.test(secret)||!supplied.startsWith("Bearer "))return false;
 const candidate=supplied.slice(7);
 if(!hex.test(candidate))return false;
 let d=0;for(let i=0;i<64;i++)d|=candidate.charCodeAt(i)^secret.charCodeAt(i);
 return d===0;
}
function parseTarget(x){
 if(!x||typeof x!=="object"||Array.isArray(x)||
   !["COUNTRY","CORRIDOR"].includes(x.target_type)||
   typeof x.target_id!=="string"||!registry(x.target_type,x.target_id))return null;
 return {type:x.target_type,id:x.target_id};
}
function basePolicy(x){
 if(x?.client_policy!==undefined&&!["STRICT","LENIENT"].includes(x.client_policy))return null;
 if(x?.override_acknowledged!==undefined&&x.override_acknowledged!==true)return null;
 if(x?.approved_thresholds!==undefined){
  const a=x.approved_thresholds;
  if(!a||typeof a!=="object"||Array.isArray(a)||
    !["block_at","pass_below","minimum_confidence"].every(k=>Number.isFinite(a[k]))||
    a.block_at<=a.pass_below||a.block_at>1||a.pass_below<0||
    a.minimum_confidence<0||a.minimum_confidence>1)return null;
 }
 return true;
}
async function signedGro(env,target,now){
 try{
  const isCountry=target.type==="COUNTRY";
  const sql=isCountry?
   "SELECT * FROM country_gro_verified_hot WHERE country_iso3=? AND generated_at<=? AND expires_at>? LIMIT 1":
   "SELECT * FROM corridor_gro_verified_hot WHERE corridor_id=? AND generated_at<=? AND expires_at>? LIMIT 1";
  const row=await env.DB.prepare(sql).bind(target.id,iso(now),iso(now)).first();
  if(!row)return null;
  return await verifyHotGRO(row,env,{type:isCountry?"country":"corridor",id:target.id},now);
 }catch{return null}
}
async function d1Observed(env,target,cat,now){
 const since=iso(now-DAY),until=iso(now),spec=CATEGORY_SPECS[cat];
 if(target.type==="CORRIDOR"){
  const rows=(await env.DB.prepare("SELECT candidate_id,source_id,native_published_at,article_url,source_title_sha256,candidate_corridor_ids_json,categories_json FROM corridor_native_news_candidates WHERE native_published_at>=? AND native_published_at<=? AND instr(candidate_corridor_ids_json,?)>0 ORDER BY native_published_at DESC LIMIT 40")
    .bind(since,until,'"' + target.native + '"').all())?.results??[];
  return rows.filter(x=>{
   try{
    const tags=JSON.parse(x.categories_json).map(y=>String(y).toLowerCase());
    return JSON.parse(x.candidate_corridor_ids_json).includes(target.native)&&
     tags.some(y=>y.includes(spec.raw_category)||cat==="CRITICAL_MINERALS"&&y.includes("mineral"));
   }catch{return false}
  }).map(x=>({id:x.candidate_id,source_id:x.source_id,url:x.article_url,
   title_hash:x.source_title_sha256,published_at:x.native_published_at,origin:"D1_NATIVE_METADATA"}));
 }
 const rows=(await env.DB.prepare("SELECT record_id,raw_sha256,raw_json,original_published_at FROM phase2h_private_raw_news WHERE category=? AND original_published_at>=? AND original_published_at<=? ORDER BY original_published_at DESC LIMIT 40")
  .bind(spec.raw_category,since,until).all())?.results??[];
 const out=[];
 for(const x of rows){
  try{
   const v=JSON.parse(x.raw_json),o=v.original;
   if(v.record_id!==x.record_id||v.raw_sha256!==x.raw_sha256||
     phase2hHeadlineCountryCandidate(o.original_title)!==target.id||
     o.original_published_at!==x.original_published_at||!safeHost(o.original_url))continue;
   out.push({id:x.record_id,source_id:o.original_source_id,url:o.original_url,
    title_hash:await hash(o.original_title.normalize("NFKC").trim().toLowerCase()),
    published_at:x.original_published_at,origin:"D1_ORIGINAL_METADATA"});
  }catch{/* malformed upstream candidate is discarded */}
 }
 return out;
}
async function googleObserved(target,cat,now,fetcher){
 const c=CATEGORY_SPECS[cat],name=target.type==="COUNTRY"?target.name:target.id.replace(/-/g," ");
 const q='"'+name+'" ('+c.keywords.map(x=>'"'+x+'"').join(" OR ")+') when:24h';
 const url="https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=en-US&gl=US&ceid=US:en";
 try{
  const res=await fetcher(url,{redirect:"manual",signal:AbortSignal.timeout(7000),
   headers:{Accept:"application/rss+xml, application/xml;q=0.9"}});
  if(res.status!==200||res.url&&new URL(res.url).hostname!=="news.google.com")return [];
  if(Number(res.headers.get("content-length")||0)>600000)return [];
  return (await parseGoogleRiskRss(await res.text(),now)).slice(0,20).map(x=>({
   id:x.id,source_id:x.source_id,url:x.url,title_hash:x.title_hash,
   published_at:x.published_at,publisher_host:x.publisher_host,origin:"GOOGLE_RSS_UNVERIFIED"}));
 }catch{return []}
}
function compactEvidence(items){
 const seen=new Set(),out=[];
 for(const v of items){
  const url=String(v.url??""),pub=String(v.published_at??"");
  const host=safeHost(url);
  if(!host||!Number.isFinite(Date.parse(pub))||!hex.test(String(v.title_hash??"")))continue;
  const id=String(v.id??"");
  if(!id||seen.has(v.title_hash))continue;
  seen.add(v.title_hash);
  out.push({id:id.slice(0,64),source_id:String(v.source_id??"").slice(0,70),
   url:url.slice(0,500),publisher_host:String(v.publisher_host??host).slice(0,120),
   title_hash:v.title_hash,published_at:pub,origin:v.origin});
  if(out.length>=20)break;
 }
 return out;
}
async function signSnapshot(snapshot,env,now){
 const secret=String(env?.RISK_GATE_OBSERVATION_HMAC_KEY??"");
 if(enc.encode(secret).length<32)throw Error("UNIFIED_SIGNING_KEY_MISSING");
 const content_sha256=await hash(JSON.stringify(snapshot));
 const timestamp_utc=iso(now),input=JSON.stringify({schema:UNIFIED_SCHEMA,content_sha256,timestamp_utc});
 const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signed=await crypto.subtle.sign("HMAC",k,enc.encode(input));
 const signature="hmac_sha256:"+Array.from(new Uint8Array(signed),n=>n.toString(16).padStart(2,"0")).join("");
 return {content_sha256,proof:{content_sha256,timestamp_utc,signature,
  signature_scope:"SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION"}};
}
async function verifySnapshot(snapshot,proof,env){
 if(await hash(JSON.stringify(snapshot))!==proof.content_sha256)return false;
 if(proof.signature_scope!=="SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION"||
   !/^hmac_sha256:[a-f0-9]{64}$/.test(proof.signature))return false;
 const secret=String(env?.RISK_GATE_OBSERVATION_HMAC_KEY??"");
 if(enc.encode(secret).length<32)return false;
 const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const bytes=Uint8Array.from(proof.signature.slice(12).match(/.{2}/g),x=>parseInt(x,16));
 return crypto.subtle.verify("HMAC",k,bytes,enc.encode(JSON.stringify({
  schema:UNIFIED_SCHEMA,content_sha256:proof.content_sha256,timestamp_utc:proof.timestamp_utc
 })));
}
async function stored(env,target,day){
 return env.DB.prepare("SELECT snapshot_json,audit_proof_json,content_sha256,generated_at,supabase_synced_at FROM unified_risk_snapshots WHERE entity_type=? AND entity_id=? AND day_utc=?")
  .bind(target.type,target.id,day).first();
}
async function verifiedStored(env,target,day){
 const r=await stored(env,target,day);
 if(!r)return null;
 try{
  const snapshot=JSON.parse(r.snapshot_json),audit_proof=JSON.parse(r.audit_proof_json);
  if(r.content_sha256!==audit_proof.content_sha256||
    !await verifySnapshot(snapshot,audit_proof,env))return null;
  return {snapshot,audit_proof,supabase_synced:!!r.supabase_synced_at};
 }catch{return null}
}
/** One subject at a time, ≤3 D1 category scans, ≤3 parallel RSS gap fills. */
export async function generateUnifiedSnapshot(env,{type,id},{now=Date.now(),fetcher=fetch}={}){
 if(!env?.DB?.prepare)throw Error("UNIFIED_D1_UNAVAILABLE");
 const reg=registry(type,id);
 if(!reg)throw Error("UNIFIED_TARGET_INVALID");
 const target={type,id,...reg},day=iso(now).slice(0,10);
 const prior=await verifiedStored(env,target,day);
 if(prior)return {...prior,existing:true};
 const gro=await signedGro(env,target,now);
 const signedCategoryScores=validatedSignedCategoryScores(gro);
 const readings=await Promise.all(CATEGORIES.map(async category=>{
  const native=await d1Observed(env,target,category,now);
  const entries=native.length?native:await googleObserved(target,category,now,fetcher);
  return {category,entries:compactEvidence(entries),source_lane:native.length?"D1_FIRST":"GOOGLE_GAP_FILL_OR_EMPTY"};
 }));
 const categories={};
 for(const x of readings){
  const score=signedCategoryScores[x.category]??null;
  const v=categoryView(x.category,x.entries.length,score,gro);
  categories[x.category]={...v,source_lane:x.source_lane};
  const payload={schema:"geomacro.risk-observation.v1",sources:x.entries,
    provenance:"METADATA_ONLY_NO_ORIGINAL_ARTICLE_CONTENT",
    publisher_attribution_does_not_verify_incident:true};
  const idhash=await hash(type+"|"+id+"|"+x.category+"|"+day);
  await env.DB.prepare("INSERT OR IGNORE INTO risk_observations(id,entity_type,entity_id,category,day_utc,risk_score,confidence,evidence_payload,source_count,is_authoritative,evidence_status,gro_object_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(idhash,type,id,x.category,day,v.risk_score,v.confidence,JSON.stringify(payload),
    x.entries.length,0,v.status,v.signed_gro_object_id,iso(now)).run();
 }
 const scores=Object.fromEntries(CATEGORIES.map(k=>[k,categories[k].risk_score]));
 const score=calculateUnifiedRisk(scores);
 const tiers=generateCommercialTiers(score,{groVerified:!!gro,confidence:gro?.confidence??null});
 const snapshot={schema:UNIFIED_SCHEMA,target_type:type,target_id:id,day_utc:day,generated_at:iso(now),
  categories,unified_risk_score:score.unifiedScore,dominant_risk:score.dominantFactor,
  assessment_status:score.assessment_status,missing_categories:score.missing_categories,
  corridor_spillover_multiplier:1,spillover_status:"NO_VERIFIED_TARGET_EXPOSURE_MAPPING",
  signed_gro_object_id:gro?.object_id??null,tiers,
  chargeable:false,execution_authorized:false,customer_paid:false};
 const {content_sha256,proof}=await signSnapshot(snapshot,env,now);
 await env.DB.prepare("INSERT OR IGNORE INTO unified_risk_snapshots(entity_type,entity_id,day_utc,snapshot_json,audit_proof_json,content_sha256,generated_at) VALUES(?,?,?,?,?,?,?)")
  .bind(type,id,day,JSON.stringify(snapshot),JSON.stringify(proof),content_sha256,iso(now)).run();
 const checked=await verifiedStored(env,target,day);
 if(!checked)throw Error("UNIFIED_D1_HASH_OR_HMAC_READBACK_FAILED");
 return {...checked,existing:false};
}
function supabaseCfg(env){
 if(env?.RISK_GATE_SUPABASE_ACCEPTANCE!=="ACCEPTED_PRIVATE_RISK_GATE_DAILY")return null;
 const url=String(env.RISK_GATE_SUPABASE_URL??"").replace(/\/$/,""),key=String(env.RISK_GATE_SUPABASE_SERVICE_ROLE_KEY??"");
 return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&key.length>=32?{url,key}:null;
}
async function remote(cfg,path,{method="GET",body,headers={}}={},fetcher=fetch){
 const r=await fetcher(cfg.url+path,{method,body,redirect:"manual",signal:AbortSignal.timeout(8000),
  headers:{apikey:cfg.key,Authorization:"Bearer "+cfg.key,Accept:"application/json",...headers}});
 if(!r.ok||r.status>=300)throw Error("UNIFIED_SUPABASE_HTTP_FAILED");
 return r;
}
export async function syncUnifiedRiskSupabase(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=supabaseCfg(env);
 if(!cfg)return {ok:false,error:"UNIFIED_SUPABASE_NOT_CONFIGURED"};
 try{
  const rows=(await env.DB.prepare("SELECT entity_type,entity_id,day_utc,snapshot_json,audit_proof_json,content_sha256,generated_at FROM unified_risk_snapshots WHERE supabase_synced_at IS NULL ORDER BY generated_at LIMIT 6").all())?.results??[];
  if(!rows.length)return {ok:true,synced:0};
  const payload=rows.map(x=>({entity_type:x.entity_type,entity_id:x.entity_id,day_utc:x.day_utc,
   snapshot:JSON.parse(x.snapshot_json),audit_proof:JSON.parse(x.audit_proof_json),
   content_sha256:x.content_sha256,generated_at:x.generated_at}));
  await remote(cfg,"/rest/v1/geomacro_unified_risk_daily?on_conflict=entity_type,entity_id,day_utc",{
   method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
   body:JSON.stringify(payload)},fetcher);
  const and=rows.map(x=>"and(entity_type.eq."+x.entity_type+",entity_id.eq."+
   encodeURIComponent(x.entity_id)+",day_utc.eq."+x.day_utc+")").join(",");
  const read=await (await remote(cfg,"/rest/v1/geomacro_unified_risk_daily?select=entity_type,entity_id,day_utc,content_sha256&or=("+and+")",{},fetcher)).json();
  if(!Array.isArray(read)||read.length!==rows.length||
   rows.some(x=>!read.some(y=>y.entity_type===x.entity_type&&y.entity_id===x.entity_id&&
    y.day_utc===x.day_utc&&y.content_sha256===x.content_sha256)))
   return {ok:false,error:"UNIFIED_SUPABASE_HASH_MISMATCH"};
  for(const row of rows)await env.DB.prepare("UPDATE unified_risk_snapshots SET supabase_synced_at=? WHERE entity_type=? AND entity_id=? AND day_utc=? AND content_sha256=? AND supabase_synced_at IS NULL")
    .bind(iso(now),row.entity_type,row.entity_id,row.day_utc,row.content_sha256).run();
  return {ok:true,synced:rows.length,hash_readback_verified:true};
 }catch{return {ok:false,error:"UNIFIED_SUPABASE_SYNC_FAILED"}}
}
export async function cleanupUnifiedRiskSupabase(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=supabaseCfg(env);
 if(!cfg)return {ok:false,error:"UNIFIED_SUPABASE_NOT_CONFIGURED"};
 try{
  const old=await env.DB.prepare("SELECT next_cleanup_at FROM risk_gate_daily_housekeeping WHERE job_id='unified_supabase_ten_day'").first();
  if(!old){
   await env.DB.prepare("INSERT OR IGNORE INTO risk_gate_daily_housekeeping(job_id,next_cleanup_at) VALUES('unified_supabase_ten_day',?)")
    .bind(iso(now+TEN)).run();
   return {ok:true,initialized:true};
  }
  if(Date.parse(old.next_cleanup_at)>now)return {ok:true,not_due:true};
  const cutoff=iso(now-THREE),encoded=encodeURIComponent(cutoff);
  await remote(cfg,"/rest/v1/geomacro_unified_risk_daily?generated_at=lt."+encoded,{method:"DELETE"},fetcher);
  const check=await (await remote(cfg,"/rest/v1/geomacro_unified_risk_daily?select=entity_id&generated_at=lt."+encoded+"&limit=1",{},fetcher)).json();
  if(!Array.isArray(check)||check.length)return {ok:false,error:"UNIFIED_CLEANUP_READBACK_FAILED"};
  await env.DB.prepare("DELETE FROM unified_risk_snapshots WHERE generated_at<? AND supabase_synced_at IS NOT NULL").bind(cutoff).run();
  await env.DB.prepare("DELETE FROM risk_observations WHERE created_at<?").bind(cutoff).run();
  await env.DB.prepare("UPDATE risk_gate_daily_housekeeping SET last_cleanup_at=?,next_cleanup_at=? WHERE job_id='unified_supabase_ten_day'")
   .bind(iso(now),iso(now+TEN)).run();
  return {ok:true,verified:true,minimum_retention_days:3,interval_days:10};
 }catch{return {ok:false,error:"UNIFIED_SUPABASE_CLEANUP_FAILED"}}
}
export async function unifiedRiskGateEvaluate(request,env,opts={}){
 if(request.method!=="POST")return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 if(!authorized(request,env))return reply({ok:false,error:"UNIFIED_UNAUTHORIZED"},401);
 let payload;
 try{
  if(Number(request.headers.get("content-length")||0)>4096)return reply({ok:false,error:"PAYLOAD_TOO_LARGE"},413);
  const raw=await request.text();
  if(enc.encode(raw).length>4096)return reply({ok:false,error:"PAYLOAD_TOO_LARGE"},413);
  payload=JSON.parse(raw);
 }catch{return reply({ok:false,error:"INVALID_JSON"},400)}
 if(!payload||Object.keys(payload).some(k=>!["target_type","target_id","client_policy","override_acknowledged","approved_thresholds"].includes(k))||
  !basePolicy(payload))return reply({ok:false,error:"UNIFIED_INVALID_REQUEST"},400);
 const target=parseTarget(payload);
 if(!target)return reply({ok:false,error:"UNKNOWN_COUNTRY_OR_CORRIDOR"},400);
 try{
  const x=await generateUnifiedSnapshot(env,target,opts);
  // Daily record is integrity-signed observation; no unsigned client threshold
  // can transform it into a paid verified hard verdict.
  const body={...x.snapshot,audit_proof:x.audit_proof,supabase_synced:x.supabase_synced,
   client_policy:payload.client_policy??"STRICT",
   requested_lenient_override:payload.client_policy==="LENIENT",
   override_acknowledged:payload.override_acknowledged===true,
   client_override_applied:false};
  return reply({ok:true,...body});
 }catch{return reply({ok:false,error:"UNIFIED_PRODUCTION_EVIDENCE_OR_STORAGE_UNAVAILABLE",chargeable:false},503)}
}
/** 195 countries once each UTC day; 12 corridors in separate minute slots. */
export async function scheduledUnifiedRisk(env,now=Date.now(),opts={}){
 const d=new Date(now),minute=d.getUTCHours()*60+d.getUTCMinutes(),countryIdx=minute-5*60;
 let target=null;
 if(countryIdx>=0&&countryIdx<PHASE2H_COUNTRIES_195.length){
  target={type:"COUNTRY",id:PHASE2H_COUNTRIES_195[countryIdx].iso3};
 }else if(d.getUTCHours()===8&&d.getUTCMinutes()>=20&&d.getUTCMinutes()<32){
  target={type:"CORRIDOR",id:DAILY_RG_CORRIDORS[d.getUTCMinutes()-20].id};
 }
 if(!target)return {ok:true,not_due:true};
 try{
  const r=await generateUnifiedSnapshot(env,target,{now,...opts});
  return {ok:true,target,generated:!r.existing,day_utc:r.snapshot.day_utc,
   category_count:CATEGORIES.length,verified_categories:CATEGORIES.filter(c=>r.snapshot.categories[c]?.status==="VERIFIED_SIGNED_GRO").length};
 }catch{return {ok:false,target,error:"UNIFIED_SCHEDULED_GENERATION_FAILED"}}
}

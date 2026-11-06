/** GeoMacro 195x3 + 12 corridor D1-first unified Risk Gate.
 * Privacy: source metadata only, never articles/full headlines; no billing;
 * absence of signed GRO != safe or verified event.
 */
import {PHASE2H_COUNTRIES_195,phase2hCountry,phase2hHeadlineCountryCandidate}
 from "../../../scripts/lib/phase2h-country-originals-195.mjs";
import {DAILY_RG_CORRIDORS,parseGoogleRiskRss} from "./daily-risk-gate-generator.mjs";
import {verifyHotGRO} from "./predge-risk-gate-d1.mjs";
import {persistRiskGateAuditReceipt} from "./risk-gate-audit-receipt.mjs";
import {readIntradayFlashOverride} from "./risk-gate-flash-override.mjs";
import {materializeRiskGateAssessments} from "./risk-gate-assessment-buffer.mjs";
import {CATEGORIES,CATEGORY_SPECS,validatedSignedCategoryScores} from "./unified-risk-categories.mjs";
import {calculateUnifiedRisk,generateCommercialTiers,categoryView} from "./unified-risk-engine.mjs";
import {countPrivateOsintCountryEvidence} from "./unified-risk-private-osint-bridge.mjs";
import {readIndexedRiskCountryOriginals} from "./phase2h-risk-country-index.mjs";
import {composeRiskGateThreeTierResponse,RISK_GATE_PRODUCT_TIERS}
 from "./risk-gate-three-tier-product.mjs";
import {RISK_GATE_CORRIDOR_MEMBERS,RISK_GATE_CORRIDOR_WEIGHTS}
 from "./risk-gate-corridor-members.mjs";
import {activeRiskTargets,hot50RiskGateEnabled,isHot50RiskCountry,HOT50_RISK_SQL}
 from "./risk-gate-hot50-scope.mjs";
export const UNIFIED_SCHEMA="geomacro.unified-risk-gate.v1";
export const UNIFIED_SNAPSHOT_EPOCH="v2";
const enc=new TextEncoder(),DAY=86400000,SEVEN=7*DAY;
const iso=n=>new Date(n).toISOString();
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))),
 b=>b.toString(16).padStart(2,"0")).join("");
const hex=/^[a-f0-9]{64}$/;
const safeHost=s=>{try{const u=new URL(s);return u.protocol==="https:"?u.hostname.toLowerCase().replace(/^www\./,""):""}catch{return ""}};
const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store","Vary":"Authorization","X-Content-Type-Options":"nosniff"}});
// Optional Taiwan on-demand target; canonical scheduled 195 remains unchanged.
const SUPPLEMENTARY_COUNTRY_TARGETS=Object.freeze({
 TWN:Object.freeze({iso3:"TWN",iso2:"TW",name:"Taiwan",aliases:["Taiwan"]})
});
function registry(type,id){
 if(type==="COUNTRY")return phase2hCountry(id)??SUPPLEMENTARY_COUNTRY_TARGETS[id]??null;
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
 if(x?.client_policy==="LENIENT"&&x.override_acknowledged!==true)return null;
 if(x?.client_policy!=="LENIENT"&&x?.override_acknowledged!==undefined)return null;
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
 // Canonical 195-country queries filter by the exact country index
 // BEFORE the per-country 40-original limit. A global latest-40 page was
 // silently dropping valid originals when busy other countries displaced it.
 const rows=target.id==="TWN"?
  (await env.DB.prepare("SELECT record_id,raw_sha256,raw_json,original_published_at FROM phase2h_private_raw_news WHERE category=? AND original_published_at>=? AND original_published_at<=? ORDER BY original_published_at DESC LIMIT 40")
   .bind(spec.raw_category,since,until).all())?.results??[]:
  await readIndexedRiskCountryOriginals(env,{
   countryId:target.id,category:spec.raw_category,since,until,
  });
 const out=[];
 for(const x of rows){
  try{
   const v=JSON.parse(x.raw_json),o=v.original;
   if(v.record_id!==x.record_id||v.raw_sha256!==x.raw_sha256||
     !(target.id==="TWN"?/\btaiwan\b/i.test(o.original_title):
       phase2hHeadlineCountryCandidate(o.original_title)===target.id)||
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
async function countGapObserved(env,target,cat,now){
 try{
  const rows=await env.DB.prepare("SELECT COUNT(DISTINCT source_host) AS source_count FROM unverified_observations WHERE entity_type=? AND entity_id=? AND category=? AND event_at>=? AND event_at<=? AND status IN ('OBSERVED','CORROBORATED')")
   .bind(target.type,target.id,cat,iso(now-DAY),iso(now)).first();
  return Math.max(0,Math.min(40,Number(rows?.source_count)||0));
 }catch{return 0}
}
async function corroboratedGapFacts(env,target,now){
 const output={};
 for(const category of CATEGORIES){
  try{
   const rows=(await env.DB.prepare("SELECT event_id,impact_factor,source_id,source_host,title_sha256,event_at FROM unverified_observations WHERE entity_type=? AND entity_id=? AND category=? AND event_at>=? AND event_at<=? AND status='CORROBORATED' AND independent_source_count>=2 AND fact_basis='ARTICLE_FULL_TEXT' AND original_page_fetched=1 AND impact_factor IS NOT NULL ORDER BY event_at DESC LIMIT 80")
    .bind(target.type,target.id,category,iso(now-DAY),iso(now)).all())?.results??[];
   const events=new Map();
   for(const row of rows){
    if(!hex.test(String(row.event_id))||!hex.test(String(row.title_sha256))||
       !Number.isFinite(Number(row.impact_factor))||Number(row.impact_factor)<0||Number(row.impact_factor)>100||
       !Number.isFinite(Date.parse(row.event_at))||!safeHost("https://"+String(row.source_host)))continue;
    const event=events.get(row.event_id)??{impact:Number(row.impact_factor),sources:[]};
    if(!event.sources.some(x=>x.source_host===row.source_host))event.sources.push({
     source_id:String(row.source_id??"").slice(0,100),source_host:String(row.source_host).slice(0,120),
     title_sha256:row.title_sha256,published_at:row.event_at,
    });
    event.impact=Math.max(event.impact,Number(row.impact_factor));events.set(row.event_id,event);
   }
   const qualified=[...events.entries()].filter(([,e])=>e.sources.length>=2).slice(0,12);
   if(qualified.length)output[category]={score_0_100:Number((qualified.reduce((n,[,e])=>n+e.impact,0)/qualified.length).toFixed(2)),
    event_count:qualified.length,source_count:qualified.reduce((n,[,e])=>n+e.sources.length,0),
    source_references:qualified.map(([event_id,e])=>({event_id,independent_source_count:e.sources.length,sources:e.sources}))};
  }catch{/* Missing migration or an unavailable D1 read is not evidence. */}
 }
 return output;
}
function compactEvidence(items){
 const seen=new Set(),out=[];
 for(const v of items){
  const url=String(v.url??""),pub=String(v.published_at??"");
  const host=safeHost(url);
  // Preserve a complete first-party URL or omit the unverified candidate.
  // Truncating URLs produced neither a functional link nor valid provenance.
  if(!host||url.length>250||!Number.isFinite(Date.parse(pub))||
     !hex.test(String(v.title_hash??"")))continue;
  const id=String(v.id??"");
  if(!id||seen.has(v.title_hash))continue;
  seen.add(v.title_hash);
  out.push({id:id.slice(0,64),source_id:String(v.source_id??"").slice(0,70),
   url,publisher_host:String(v.publisher_host??host).slice(0,120),
   title_hash:v.title_hash,published_at:pub,origin:v.origin});
  if(out.length>=20)break;
 }
 return out;
}
function observationHmacKeys(env){
 const keys=new Map(),active=String(env?.RISK_GATE_OBSERVATION_HMAC_KEY??"");
 const activeId=String(env?.RISK_GATE_OBSERVATION_HMAC_KEY_ID??"obs-hmac-v2");
 if(active.length>=32&&/^[A-Za-z0-9._:-]{1,96}$/.test(activeId))keys.set(activeId,active);
 const raw=String(env?.RISK_GATE_OBSERVATION_HMAC_KEYS_JSON??"").trim();
 if(raw){
  let parsed;try{parsed=JSON.parse(raw)}catch{throw Error("UNIFIED_HMAC_KEYRING_INVALID")}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("UNIFIED_HMAC_KEYRING_INVALID");
  for(const [id,value] of Object.entries(parsed)){
   const secret=typeof value==="string"?value:value?.secret;
   if(!/^[A-Za-z0-9._:-]{1,96}$/.test(id)||typeof secret!=="string"||enc.encode(secret).length<32)
    throw Error("UNIFIED_HMAC_KEYRING_INVALID");
   keys.set(id,secret);
  }
 }
 return {keys,activeId,active};
}
async function signSnapshot(snapshot,env,now){
 const {activeId,active}=observationHmacKeys(env);
 if(enc.encode(active).length<32)throw Error("UNIFIED_SIGNING_KEY_MISSING");
 snapshot.schema_epoch=UNIFIED_SNAPSHOT_EPOCH;
 const content_sha256=await hash(JSON.stringify(snapshot));
 const timestamp_utc=iso(now),schema_epoch=UNIFIED_SNAPSHOT_EPOCH,key_id=activeId;
 const input=JSON.stringify({schema:UNIFIED_SCHEMA,schema_epoch,key_id,content_sha256,timestamp_utc});
 const k=await crypto.subtle.importKey("raw",enc.encode(active),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signed=await crypto.subtle.sign("HMAC",k,enc.encode(input));
 const signature="hmac_sha256:"+Array.from(new Uint8Array(signed),n=>n.toString(16).padStart(2,"0")).join("");
 return {content_sha256,proof:{schema_epoch,key_id,content_sha256,timestamp_utc,signature,
  signature_scope:"SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION"}};
}
async function verifySnapshot(snapshot,proof,env){
 if(await hash(JSON.stringify(snapshot))!==proof.content_sha256)return false;
 if(proof.signature_scope!=="SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION"||
   !/^hmac_sha256:[a-f0-9]{64}$/.test(proof.signature))return false;
 const epoch=proof.schema_epoch??snapshot.schema_epoch??"v1";
 if(!["v1","v2"].includes(epoch)||proof.schema_epoch&&snapshot.schema_epoch!==proof.schema_epoch)return false;
 let config;try{config=observationHmacKeys(env)}catch{return false;}
 const legacy=!proof.schema_epoch&&!snapshot.schema_epoch;
 const keyId=proof.key_id;
 let candidates;
 if(legacy)candidates=[...config.keys.values()];
 else{
  if(epoch!=="v2"||typeof keyId!=="string"||!config.keys.has(keyId))return false;
  candidates=[config.keys.get(keyId)];
 }
 const bytes=Uint8Array.from(proof.signature.slice(12).match(/.{2}/g),x=>parseInt(x,16));
 for(const secret of candidates){
  if(enc.encode(secret).length<32)continue;
  try{
   const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
   const message=legacy?{schema:UNIFIED_SCHEMA,content_sha256:proof.content_sha256,timestamp_utc:proof.timestamp_utc}:
    {schema:UNIFIED_SCHEMA,schema_epoch:epoch,key_id:keyId,content_sha256:proof.content_sha256,timestamp_utc:proof.timestamp_utc};
   if(await crypto.subtle.verify("HMAC",k,bytes,enc.encode(JSON.stringify(message))))return true;
  }catch{return false;}
 }
 return false;
}
async function stored(env,target,day){
 return env.DB.prepare("SELECT snapshot_json,audit_proof_json,content_sha256,generated_at,supabase_synced_at FROM unified_risk_snapshots WHERE entity_type=? AND entity_id=? AND day_utc=?")
  .bind(target.type,target.id,day).first();
}
async function verifyStoredRecord(r,env,target,day){
 if(!r)return {valid:false,reason:"UNIFIED_D1_STORED_ROW_MISSING"};
 try{
  const snapshot=JSON.parse(r.snapshot_json),audit_proof=JSON.parse(r.audit_proof_json);
  if(snapshot?.target_type!==target.type||snapshot?.target_id!==target.id||
     snapshot?.day_utc!==day)
   return {valid:false,reason:"UNIFIED_D1_STORED_IDENTITY_MISMATCH"};
  if(r.content_sha256!==audit_proof?.content_sha256)
   return {valid:false,reason:"UNIFIED_D1_STORED_PROOF_HASH_MISMATCH"};
  if(await hash(JSON.stringify(snapshot))!==r.content_sha256)
   return {valid:false,reason:"UNIFIED_D1_STORED_CONTENT_HASH_MISMATCH"};
  if(!await verifySnapshot(snapshot,audit_proof,env))
   return {valid:false,reason:"UNIFIED_D1_STORED_HMAC_INVALID"};
  return {valid:true,value:{snapshot,audit_proof,supabase_synced:!!r.supabase_synced_at}};
 }catch{return {valid:false,reason:"UNIFIED_D1_STORED_ROW_UNPARSEABLE"}}
}
async function verifiedStored(env,target,day){
 const r=await stored(env,target,day);
 const checked=await verifyStoredRecord(r,env,target,day);
 return checked.valid?checked.value:null;
}
async function quarantineAndSupersedeSnapshot(env,target,day,oldRow,failureCode,
 snapshot,audit_proof,content_sha256,now){
 if(!env?.DB?.batch)throw Error("UNIFIED_D1_REPAIR_TRANSACTION_UNAVAILABLE");
 const repairedByRun=target.type==="COUNTRY"&&target.id==="CHN"&&day==="2026-11-05"
  ?"run_41992309131":"worker_quarantine_supersede";
 const repairId=await hash(["d1_snapshot_repair_v1",target.type,target.id,day,
  String(oldRow.content_sha256??""),content_sha256].join("\\0"));
 const audit=env.DB.prepare(
  "INSERT OR IGNORE INTO d1_snapshot_repair_log "+
  "(repair_id,target_table,entity_type,entity_id,day_utc,corrupted_payload,"+
  "corrupted_audit_proof_json,corrupted_content_sha256,failure_code,action_taken,"+
  "repaired_by_run,replacement_content_sha256,created_at) "+
  "SELECT ?, 'unified_risk_snapshots', entity_type,entity_id,day_utc,snapshot_json,"+
  "audit_proof_json,content_sha256,?,'QUARANTINED_AND_SUPERSEDED',?,?,? "+
  "FROM unified_risk_snapshots WHERE entity_type=? AND entity_id=? AND day_utc=? "+
  "AND content_sha256=?"
 ).bind(repairId,failureCode,repairedByRun,content_sha256,iso(now),
  target.type,target.id,day,oldRow.content_sha256);
 const replace=env.DB.prepare(
  "UPDATE unified_risk_snapshots SET snapshot_json=?,audit_proof_json=?,content_sha256=?,"+
  "generated_at=?,supabase_synced_at=NULL WHERE entity_type=? AND entity_id=? AND day_utc=? "+
  "AND content_sha256=?"
 ).bind(JSON.stringify(snapshot),JSON.stringify(audit_proof),content_sha256,
  iso(now),target.type,target.id,day,oldRow.content_sha256);
 const results=await env.DB.batch([audit,replace]);
 if(!Array.isArray(results)||results.length!==2)
  throw Error("UNIFIED_D1_REPAIR_TRANSACTION_INVALID");
 const changes=Number(results[1]?.meta?.changes??0);
 if(changes!==1){
  const concurrent=await verifiedStored(env,target,day);
  if(concurrent)return concurrent;
  throw Error("UNIFIED_D1_REPAIR_COMPARE_AND_SWAP_FAILED");
 }
 const logged=await env.DB.prepare(
  "SELECT repair_id,target_table,entity_type,entity_id,day_utc,corrupted_payload,"+
  "corrupted_audit_proof_json,corrupted_content_sha256,failure_code,action_taken,"+
  "repaired_by_run,replacement_content_sha256,created_at FROM d1_snapshot_repair_log "+
  "WHERE repair_id=?"
 ).bind(repairId).first();
 if(!logged||logged.target_table!=="unified_risk_snapshots"||
   logged.entity_type!==target.type||logged.entity_id!==target.id||logged.day_utc!==day||
   logged.corrupted_payload!==oldRow.snapshot_json||
   logged.corrupted_audit_proof_json!==oldRow.audit_proof_json||
   logged.corrupted_content_sha256!==oldRow.content_sha256||
   logged.failure_code!==failureCode||logged.action_taken!=="QUARANTINED_AND_SUPERSEDED"||
   logged.replacement_content_sha256!==content_sha256)
  throw Error("UNIFIED_D1_REPAIR_AUDIT_READBACK_FAILED");
 const checked=await verifiedStored(env,target,day);
 if(!checked)throw Error("UNIFIED_D1_REPAIR_SNAPSHOT_READBACK_FAILED");
 return checked;
}
/** One subject at a time, ≤3 D1 category scans, ≤3 parallel RSS gap fills. */
export async function generateUnifiedSnapshot(env,{type,id},{now=Date.now(),fetcher=fetch}={}){
 if(!env?.DB?.prepare)throw Error("UNIFIED_D1_UNAVAILABLE");
 const reg=registry(type,id);
 if(!reg)throw Error("UNIFIED_TARGET_INVALID");
 const target={type,id,...reg},day=iso(now).slice(0,10);
 const priorRow=await stored(env,target,day);
 const priorCheck=await verifyStoredRecord(priorRow,env,target,day);
 if(priorCheck.valid)return {...priorCheck.value,existing:true};
 const priorFailure=priorRow?priorCheck.reason:null;
 const gro=await signedGro(env,target,now);
 const signedCategoryScores=validatedSignedCategoryScores(gro);
 const readings=await Promise.all(CATEGORIES.map(async category=>{
  // Highest-fidelity existing canonical originals are first. A private OSINT
  // projection is used ONLY as a fallback, never counted beside a potentially
  // duplicate original, and can never independently verify a risk event.
  const native=compactEvidence(await d1Observed(env,target,category,now));
  if(native.length)return {category,entries:native,
   source_lane:"D1_FIRST",private_osint_observed_count:0};
  if(type==="COUNTRY"){
   const research=await countPrivateOsintCountryEvidence(env,{
    countryId:id,category,now
   });
   if(research.observed_count>0)return {category,entries:[],
    source_lane:research.source_lane,
    private_osint_observed_count:research.observed_count};
  }
  const gapCount=await countGapObserved(env,target,category,now);
  if(gapCount>0)return {category,entries:[],
   source_lane:"GAP_ENRICHMENT_UNVERIFIED",private_osint_observed_count:0,
   gap_observed_count:gapCount};
  // Countries without country-attributed private OSINT and all corridor
  // targets keep the existing bounded Google fallback. We cannot infer a
  // corridor from a country-level private OSINT title tag.
  return {category,entries:compactEvidence(await googleObserved(target,category,now,fetcher)),
   source_lane:"GOOGLE_GAP_FILL_OR_EMPTY",private_osint_observed_count:0};
 }));
 const corroboratedFacts=await corroboratedGapFacts(env,target,now);
 const categories={};
 for(const x of readings){
  const score=signedCategoryScores[x.category]??null;
  const sourceCount=x.entries.length||x.private_osint_observed_count||x.gap_observed_count||0;
  const v=categoryView(x.category,sourceCount,score,gro);
  categories[x.category]={...v,source_lane:x.source_lane,
   private_osint_research_only:x.private_osint_observed_count>0};
  // Only the *count* of anonymous research items may leave the private
  // OSINT ring. Never store their item IDs, original titles, raw projections,
  // article URLs, publishers or source names in risk observations/snapshots.
  const payload={schema:"geomacro.risk-observation.v1",sources:x.entries,
    private_osint_research_observation_count:x.private_osint_observed_count,
    gap_enrichment_observation_count:x.gap_observed_count??0,
    private_osint_original_page_verified:false,
    provenance:"METADATA_ONLY_NO_ORIGINAL_ARTICLE_CONTENT",
    publisher_attribution_does_not_verify_incident:true};
  const idhash=await hash(type+"|"+id+"|"+x.category+"|"+day);
  await env.DB.prepare("INSERT OR IGNORE INTO risk_observations(id,entity_type,entity_id,category,day_utc,risk_score,confidence,evidence_payload,source_count,is_authoritative,evidence_status,gro_object_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
   .bind(idhash,type,id,x.category,day,v.risk_score,v.confidence,JSON.stringify(payload),
    sourceCount,0,v.status,v.signed_gro_object_id,iso(now)).run();
 }
 const scores=Object.fromEntries(CATEGORIES.map(k=>[k,categories[k].risk_score]));
 const score=calculateUnifiedRisk(scores);
 // Basic / Focused uses the explicitly labelled observed baseline for empty
 // categories. It is not a verified category score and cannot unlock a gate.
 const basicCategoryScores=Object.fromEntries(CATEGORIES.map(category=>{
  const observed=Math.max(0,Number(categories[category].source_count??0));
  return [category,observed>0?Math.min(1,observed*0.25):0.5];
 }));
 const basicScore=calculateUnifiedRisk(basicCategoryScores);
 const hasObservedBaseline=CATEGORIES.some(category=>Number(categories[category].source_count??0)>0);
 const basicUnifiedScore=hasObservedBaseline?basicScore.unifiedScore:null;
 const tiers=generateCommercialTiers(score,{groVerified:!!gro,confidence:gro?.confidence??null});
 const snapshot={schema:UNIFIED_SCHEMA,schema_epoch:UNIFIED_SNAPSHOT_EPOCH,target_type:type,target_id:id,day_utc:day,generated_at:iso(now),
  categories,unified_risk_score:score.unifiedScore??basicUnifiedScore,
  verified_unified_risk_score:score.unifiedScore,
  signed_gro_payload_sha256:hex.test(String(gro?.integrity?.payload_hash??""))?
   gro.integrity.payload_hash:null,
  basic_focused:{unified_risk_score:basicUnifiedScore,
   category_scores:basicCategoryScores,confidence:"LOW",verification:"PROVISIONAL",
   score_kind:"OBSERVED_BASELINE_ACTIVITY_PROXY"},
  corroborated_risk_facts:corroboratedFacts,
  dominant_risk:score.dominantFactor??(hasObservedBaseline?basicScore.dominantFactor:null),
  assessment_status:score.unifiedScore===null?
   hasObservedBaseline?"PROVISIONAL_OBSERVED_BASELINE":"INSUFFICIENT_COVERAGE":"VERIFIED_FULL_COVERAGE",
  missing_categories:score.missing_categories,
  corridor_spillover_multiplier:1,spillover_status:"NO_VERIFIED_TARGET_EXPOSURE_MAPPING",
  signed_gro_object_id:gro?.object_id??null,tiers,
  chargeable:basicUnifiedScore!==null,execution_authorized:false,customer_paid:false};
 if(priorRow&&priorFailure){
  snapshot.provenance_override=target.type==="COUNTRY"&&target.id==="CHN"&&day==="2026-11-05"
   ?"REPAIR_SUPERSEDES_RUN_41992309131":"QUARANTINE_SUPERSEDES_INVALID_D1_SNAPSHOT";
 }
 const {content_sha256,proof}=await signSnapshot(snapshot,env,now);
 const checked=priorRow&&priorFailure?
  await quarantineAndSupersedeSnapshot(env,target,day,priorRow,priorFailure,
   snapshot,proof,content_sha256,now):
  (await env.DB.prepare("INSERT OR IGNORE INTO unified_risk_snapshots(entity_type,entity_id,day_utc,snapshot_json,audit_proof_json,content_sha256,generated_at) VALUES(?,?,?,?,?,?,?)")
   .bind(type,id,day,JSON.stringify(snapshot),JSON.stringify(proof),content_sha256,iso(now)).run(),
   await verifiedStored(env,target,day));
 if(!checked)throw Error("UNIFIED_D1_HASH_OR_HMAC_READBACK_FAILED");
 return {...checked,existing:false};
}
function supabaseCfg(env){
 if(env?.RISK_GATE_SUPABASE_ACCEPTANCE!=="ACCEPTED_PRIVATE_RISK_GATE_DAILY")return null;
 const url=String(env.RISK_GATE_SUPABASE_URL??"").replace(/\/$/,""),key=String(env.RISK_GATE_SUPABASE_SERVICE_ROLE_KEY??"");
 return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&key.length>=32?{url,key}:null;
}
async function remote(cfg,path,{method="GET",body,headers={}}={},fetcher=fetch){
 const requestHeaders={apikey:cfg.key,Accept:"application/json",...headers};
 // New Supabase sb_secret keys are opaque, not JWTs; sending them as Bearer
 // makes the gateway reject them as an invalid JWT. Legacy service_role keys
 // remain JWTs and keep the Authorization header for compatibility.
 if(!cfg.key.startsWith("sb_secret_"))
  requestHeaders.Authorization="Bearer "+cfg.key;
 const r=await fetcher(cfg.url+path,{method,body,redirect:"manual",signal:AbortSignal.timeout(8000),
  headers:requestHeaders});
 if(!r.ok||r.status>=300)throw Error("UNIFIED_SUPABASE_HTTP_FAILED");
 return r;
}
const COUNTRY_SIGNAL_DOMAIN=Object.freeze({GEOPOLITICS:"geopolitics",
 MACRO_FX:"macro_fx",CRITICAL_MINERALS:"critical_minerals"});
const finiteScore=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1;
function snapshotCategoryScore(snapshot,category){
 const verified=snapshot?.categories?.[category];
 if(finiteScore(verified?.risk_score)){
  const gro=hex.test(String(snapshot?.signed_gro_payload_sha256??""))?
   snapshot.signed_gro_payload_sha256:null;
  return {score:verified.risk_score,status:gro?"VERIFIED":"OBSERVED_UNVERIFIED",gro};
 }
 if(snapshot?.basic_focused?.unified_risk_score!==null&&
    finiteScore(snapshot?.basic_focused?.category_scores?.[category]))
  return {score:snapshot.basic_focused.category_scores[category],status:"OBSERVED_UNVERIFIED",gro:null};
 return null;
}
function summarizeSeries(values){
 const scores=values.map(x=>x.score).filter(Number.isFinite);
 if(!scores.length)return null;
 const average=scores.reduce((a,b)=>a+b,0)/scores.length;
 const volatility=Math.sqrt(scores.reduce((n,x)=>n+(x-average)**2,0)/scores.length);
 return {average:Number(average.toFixed(2)),volatility:Number(volatility.toFixed(2)),count:scores.length};
}
async function signedSnapshotRows(env,whereSql,binds,quarantined=null){
 const out=await env.DB.prepare("SELECT entity_type,entity_id,day_utc,snapshot_json,"+
  "audit_proof_json,content_sha256,generated_at FROM unified_risk_snapshots WHERE "+whereSql+
  " ORDER BY day_utc ASC,entity_id ASC").bind(...binds).all();
 if(!Array.isArray(out?.results))throw Error("RISK_GATE_7D_D1_ROWS_INVALID");
 const rows=[];
 for(const row of out.results){
  try{
  let snapshot,proof;try{snapshot=JSON.parse(row.snapshot_json);proof=JSON.parse(row.audit_proof_json)}catch{throw Error("RISK_GATE_7D_D1_JSON_INVALID")}
  if(snapshot?.target_type!==row.entity_type||snapshot?.target_id!==row.entity_id||
     snapshot?.day_utc!==row.day_utc||row.content_sha256!==proof?.content_sha256)
   throw Error("RISK_GATE_7D_D1_IDENTITY_OR_HASH_INVALID");
  if(!await verifySnapshot(snapshot,proof,env)){
   // Entity and date are safe, bounded diagnostic fields for the owner-only
   // backfill route; no snapshot payload or signing material is returned.
   const entityType=row.entity_type==="COUNTRY"?"COUNTRY":"OTHER";
   const entityId=/^[A-Z0-9-]{1,40}$/.test(String(row.entity_id))?row.entity_id:"UNKNOWN";
   const day=/^\d{4}-\d{2}-\d{2}$/.test(String(row.day_utc))?row.day_utc:"UNKNOWN";
   throw Error(["RISK_GATE_7D_D1_HMAC_INVALID",entityType,entityId,day].join("_"));
  }
  rows.push({...row,snapshot,proof});
  }catch(error){
   // Rollup repair may isolate a malformed historical row while processing
   // other independently verified rows. Strict callers still reject it.
   // Never re-sign, rewrite, score or forward the rejected snapshot.
   if(quarantined===null)throw error;
   quarantined.push(true);
  }
 }
 return rows;
}
async function projectCountryRiskSignal7d(env,latest,verifiedRows=null){
 if(latest.entity_type!=="COUNTRY")return [];
 const day=latest.day_utc,from=iso(Date.parse(day+"T00:00:00.000Z")-6*DAY).slice(0,10);
 const rows=verifiedRows?.filter(x=>x.entity_type==='COUNTRY'&&x.entity_id===latest.entity_id&&x.day_utc>=from&&x.day_utc<=day)??await signedSnapshotRows(env,"entity_type='COUNTRY' AND entity_id=? AND day_utc>=? AND day_utc<=?",
  [latest.entity_id,from,day]);
 const projected=[];
 for(const [category,domain] of Object.entries(COUNTRY_SIGNAL_DOMAIN)){
  const series=[];
  for(const row of rows){
   const x=snapshotCategoryScore(row.snapshot,category);
   if(x)series.push({day:row.day_utc,score:x.score*100,status:x.status,gro:x.gro,
    sha:row.content_sha256,generated_at:row.generated_at});
  }
  const current=series.findLast(x=>x.day===day),summary=summarizeSeries(series);
  if(!current||!summary)continue;
  const eventSha=await hash("risk_signal_7d|"+latest.entity_id+"|"+domain+"|"+day);
  projected.push({event_sha256:eventSha,
   verified_gro_sha256:current.status==="VERIFIED"?current.gro:null,
   country_iso3:latest.entity_id,domain,signal_kind:"daily_risk_rollup",
   intensity:Number(current.score.toFixed(2)),verification_status:current.status,
   original_at:current.generated_at,score_0_100:Number(current.score.toFixed(2)),
   rolling_7d_avg_0_100:summary.average,volatility_7d_0_100:summary.volatility,
   risk_delta_0_100:Number((current.score-summary.average).toFixed(2)),rollup_day:day,
   scored_days:summary.count,source_snapshot_sha256:current.sha});
 }
 return projected;
}
async function projectCorridorCandidate7d(env,day,now,verifiedRows=null){
 const corridors=Object.entries(RISK_GATE_CORRIDOR_MEMBERS);
 const members=[...new Set(corridors.flatMap(([,list])=>list))];
 const from=iso(Date.parse(day+"T00:00:00.000Z")-6*DAY).slice(0,10);
 const rows=verifiedRows?.filter(x=>members.includes(x.entity_id)&&x.day_utc>=from&&x.day_utc<=day)??(members.length?await signedSnapshotRows(env,
  "entity_type='COUNTRY' AND entity_id IN ("+members.map(()=>"?").join(",")+") AND day_utc>=? AND day_utc<=?",
  [...members,from,day]):[]);
 const byCountryDay=new Map();
 for(const row of rows){
  const verified=row.snapshot?.verified_unified_risk_score;
  const basic=row.snapshot?.basic_focused?.unified_risk_score;
  const score=finiteScore(verified)?verified:finiteScore(basic)?basic:null;
  if(score!==null)byCountryDay.set(row.entity_id+"|"+row.day_utc,{score,sha:row.content_sha256});
 }
 const output=[];
 for(const [corridorId,countries] of corridors){
  const daily=[];
  for(let age=6;age>=0;age--){
   const date=iso(Date.parse(day+"T00:00:00.000Z")-age*DAY).slice(0,10);
   const points=countries.map(c=>byCountryDay.get(c+"|"+date)).filter(Boolean);
   if(points.length)daily.push({day:date,score:points.reduce((n,x)=>n+x.score,0)/points.length,
    count:points.length,hashes:points.map(x=>x.sha)});
  }
  const current=daily.findLast(x=>x.day===day)??null;
  const series=summarizeSeries(daily.map(x=>({score:x.score*100})));
  const score=current?Number((current.score*100).toFixed(2)):null;
  const candidateSha=await hash("corridor_candidate_7d|"+corridorId+"|"+day);
  const complete=Boolean(current&&current.count===countries.length&&daily.length===7&&
   daily.every(x=>x.count===countries.length));
  output.push({candidate_sha256:candidateSha,
   origin_country_iso3:null,destination_country_iso3:null,evidence_gro_sha256:null,
   candidate_status:"CONDITIONAL_PASS",exposure_kind:"named_corridor_gate",
   corridor_id:corridorId,day_utc:day,friction_index_0_100:score,
   rolling_7d_avg_0_100:series?.average??null,volatility_7d_0_100:series?.volatility??null,
   risk_delta_0_100:score===null||!series?null:Number((score-series.average).toFixed(2)),
   constituent_countries:countries,weighting_method:countries.length?RISK_GATE_CORRIDOR_WEIGHTS:"NO_MEMBER_MAPPING",
   evidence_completeness:countries.length?(complete?"COMPLETE":"INCOMPLETE"):"NO_MEMBER_MAPPING",
   basic_tier_status:"CONDITIONAL_PASS",full_tier_status:"REQUIRES_SIGNED_GRO",
   source_snapshot_sha256:current?await hash(current.hashes.join("|")):null,
   ingested_at:iso(now),expires_at:iso(now+SEVEN)});
 }
 return output;
}
async function syncRiskGateSevenDayOutputs(env,cfg,latestRows,now,fetcher,verifiedRows=null){
 const countries=latestRows.filter(x=>x.entity_type==="COUNTRY");
 const rejectedHistory=[];
 if(countries.length&&verifiedRows===null){
  const ids=[...new Set([...countries.map(x=>x.entity_id),
   ...(hot50RiskGateEnabled(env)?[]:Object.values(RISK_GATE_CORRIDOR_MEMBERS).flat())])];
  const days=countries.map(x=>x.day_utc).sort(),last=days.at(-1);
  const from=iso(Date.parse(days[0]+"T00:00:00.000Z")-6*DAY).slice(0,10);
  verifiedRows=await signedSnapshotRows(env,
   "entity_type='COUNTRY' AND entity_id IN ("+ids.map(()=>"?").join(",")+") AND day_utc>=? AND day_utc<=?",
   [...ids,from,last],rejectedHistory);
 }
 const signals=(await Promise.all(countries.map(x=>projectCountryRiskSignal7d(env,x,verifiedRows)))).flat();
 // Keep both the upsert and exact hash-readback URL bounded. A whole
 // 195x3 day's IDs can exceed provider HTTP request-line limits.
 for(let offset=0;offset<signals.length;offset+=24){
  const chunk=signals.slice(offset,offset+24);
  await remote(cfg,"/rest/v1/geomacro_risk_signal_7d?on_conflict=event_sha256,country_iso3,domain",{
   method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
   body:JSON.stringify(chunk)},fetcher);
  const ids=chunk.map(x=>x.event_sha256);
  const read=await (await remote(cfg,"/rest/v1/geomacro_risk_signal_7d?select=event_sha256,country_iso3,domain,source_snapshot_sha256&event_sha256=in.("+ids.join(",")+")",{},fetcher)).json();
  if(!Array.isArray(read)||read.length!==chunk.length||chunk.some(x=>!read.some(y=>
   y.event_sha256===x.event_sha256&&y.country_iso3===x.country_iso3&&y.domain===x.domain&&
   y.source_snapshot_sha256===x.source_snapshot_sha256)))throw Error("RISK_SIGNAL_7D_READBACK_MISMATCH");
 }
 if(countries.length&&!hot50RiskGateEnabled(env)){
  const day=countries.map(x=>x.day_utc).sort().at(-1);
  const outputs=await projectCorridorCandidate7d(env,day,now,verifiedRows);
  if(outputs.length){
   await remote(cfg,"/rest/v1/geomacro_corridor_candidate_7d?on_conflict=corridor_id,day_utc",{
    method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify(outputs)},fetcher);
   const ids=outputs.map(x=>x.corridor_id);
   const read=await (await remote(cfg,"/rest/v1/geomacro_corridor_candidate_7d?select=corridor_id,day_utc,candidate_sha256,basic_tier_status,full_tier_status&corridor_id=in.("+
    ids.join(",")+")&day_utc=eq."+day,{},fetcher)).json();
   if(!Array.isArray(read)||read.length!==outputs.length||outputs.some(x=>!read.some(y=>
    y.corridor_id===x.corridor_id&&y.day_utc===x.day_utc&&y.candidate_sha256===x.candidate_sha256&&
    y.basic_tier_status==="CONDITIONAL_PASS"&&y.full_tier_status==="REQUIRES_SIGNED_GRO")))
    throw Error("CORRIDOR_CANDIDATE_7D_READBACK_MISMATCH");
  }
 }
 return {risk_signal_rows:signals.length,corridor_rows:countries.length&&!hot50RiskGateEnabled(env)?Object.keys(RISK_GATE_CORRIDOR_MEMBERS).length:0,
  quarantined_history_rows:rejectedHistory.length};
}
/** Daily seven-day rollup, separate from retention cleanup.
 * Every source row is HMAC-verified from D1 before any derived upsert.
 * BACKFILL writes each retained snapshot day; DAILY writes only the latest
 * available snapshot day. No assessment is fabricated when no signed GRO
 * hash is present in the verified snapshot.
 */
export async function runUnifiedRiskSevenDayRollup(env,{
 now=Date.now(),fetcher=fetch,mode="DAILY",
}={}){
 const cfg=supabaseCfg(env);
 if(!cfg)return {ok:false,error:"UNIFIED_SUPABASE_NOT_CONFIGURED"};
 if(!["DAILY","BACKFILL"].includes(mode))
  return {ok:false,error:"RISK_GATE_7D_ROLLUP_MODE_INVALID"};
 try{
  const today=iso(now).slice(0,10);
  const from=iso(Date.parse(today+"T00:00:00.000Z")-6*DAY).slice(0,10);
  const quarantined=[];
  const rows=await signedSnapshotRows(env,
   (hot50RiskGateEnabled(env)?HOT50_RISK_SQL:"entity_type='COUNTRY'")+" AND day_utc>=? AND day_utc<=?",[from,today],quarantined);
  const days=[...new Set(rows.map(x=>x.day_utc))].sort();
  if(!days.length&&quarantined.length)return {ok:false,
   error:"RISK_GATE_7D_ROLLUP_FAILED",diagnostic:"RISK_GATE_7D_NO_VALID_SNAPSHOTS",
   quarantined_snapshot_rows:quarantined.length};
  if(!days.length)return {ok:true,mode,from_day:from,to_day:null,
   snapshot_rows:0,rollup_days:0,risk_signal_rows:0,corridor_rows:0,
   assessment_rows:0,assessment_status:"BLOCKED_NO_SIGNED_GRO"};
  const rollupDays=mode==="BACKFILL"?days:[days.at(-1)];
  let signals=0,corridors=0;
  for(const day of rollupDays){
   const result=await syncRiskGateSevenDayOutputs(env,cfg,
    rows.filter(x=>x.day_utc===day),now,fetcher,rows);
   signals+=result.risk_signal_rows;
   corridors+=result.corridor_rows;
  }
  const assessments=await materializeRiskGateAssessments(env,rows,{
   now,remote:(path,options)=>remote(cfg,path,options,fetcher),
  });
  return {ok:true,mode,from_day:from,to_day:rollupDays.at(-1),
   snapshot_rows:rows.length,rollup_days:rollupDays.length,
   risk_signal_rows:signals,corridor_rows:corridors,...assessments,
   hmac_verified:true,quarantined_snapshot_rows:quarantined.length,
   degraded:quarantined.length>0};
 }catch(error){
  // Return only an allowlisted symbolic code to the owner-authenticated caller;
  // never expose provider response bodies, URLs, SQL, or secret material.
  const raw=String(error?.message??"");
  const diagnostic=/^[A-Z0-9_-]{1,100}$/.test(raw)?raw:"RISK_GATE_7D_ROLLUP_UNCLASSIFIED";
  return {ok:false,error:"RISK_GATE_7D_ROLLUP_FAILED",diagnostic};
 }
}
/** Bounded D1-to-Supabase immutable snapshot delivery.
 * BACKLOG is scheduled and strictly oldest-first (12 rows per run).
 * CANARY_EXACT is owner-only production acceptance: re-post EXACTLY its
 * 3 known current-day snapshots, independent of an unrelated 200-row
 * backlog, including already-synced rows (remote loss repair). Both
 * paths independently HMAC-verify stored bytes and exact remote hashes.
 */
export async function syncUnifiedRiskSupabase(env,{
 now=Date.now(),fetcher=fetch,scope="BACKLOG",page=null,
}={}){
 const cfg=supabaseCfg(env);
 if(!cfg)return {ok:false,error:"UNIFIED_SUPABASE_NOT_CONFIGURED"};
 if(!["BACKLOG","CANARY_EXACT","CANONICAL_PAGE"].includes(scope))
  return {ok:false,error:"UNIFIED_SUPABASE_SYNC_SCOPE_INVALID"};
 const canonicalPage=scope==="CANONICAL_PAGE";
 if(canonicalPage&&(!Number.isInteger(page)||page<0||page>17))
  return {ok:false,error:"UNIFIED_SUPABASE_CANONICAL_PAGE_INVALID"};
 if(!canonicalPage&&page!==null)
  return {ok:false,error:"UNIFIED_SUPABASE_PAGE_SCOPE_INVALID"};
 try{
  const canary=scope==="CANARY_EXACT",day=iso(now).slice(0,10);
  const ordered=canonicalPage?[...CANONICAL_UNIFIED_TARGETS].sort((x,y)=>
   x.type===y.type?(x.id<y.id?-1:x.id>y.id?1:0):
    x.type<y.type?-1:1):null;
  const pageTargets=canonicalPage?ordered.slice(page*12,page*12+12):null;
  const select="SELECT entity_type,entity_id,day_utc,snapshot_json,"+
   "audit_proof_json,content_sha256,generated_at FROM unified_risk_snapshots ";
  let rows=canary?
   (await env.DB.prepare(select+
    "WHERE day_utc=? AND ("+
    "(entity_type='COUNTRY' AND entity_id IN ('TWN','CHN')) OR "+
    "(entity_type='CORRIDOR' AND entity_id='bab-el-mandeb')) "+
    "ORDER BY entity_type,entity_id LIMIT 3").bind(day).all())?.results??[]:
   canonicalPage?
    (await env.DB.prepare(select+
     "WHERE day_utc=? AND (entity_type='CORRIDOR' OR "+
     "(entity_type='COUNTRY' AND entity_id<>'TWN')) "+
     "ORDER BY entity_type,entity_id LIMIT 12 OFFSET ?")
     .bind(day,page*12).all())?.results??[]:
    (await env.DB.prepare(select+
     "WHERE supabase_synced_at IS NULL "+(hot50RiskGateEnabled(env)?"AND "+HOT50_RISK_SQL+" ":"")+"ORDER BY generated_at LIMIT 12").all())?.results??[];
  if(canonicalPage&&(
   rows.length!==pageTargets.length||
   rows.some((r,i)=>r.entity_type!==pageTargets[i].type||
    r.entity_id!==pageTargets[i].id||r.day_utc!==day)))
   return {ok:false,error:"UNIFIED_CANONICAL_PAGE_D1_SET_INCOMPLETE"};
  if(canary&&(
   rows.length!==3||
   !["COUNTRY|TWN","COUNTRY|CHN","CORRIDOR|bab-el-mandeb"]
    .every(k=>rows.some(r=>r.entity_type+"|"+r.entity_id===k&&r.day_utc===day))))
   return {ok:false,error:"UNIFIED_CANARY_EXACT_D1_SET_INCOMPLETE"};
  if(!Array.isArray(rows)||rows.length>12)
   return {ok:false,error:"UNIFIED_SUPABASE_SYNC_SOURCE_INVALID"};
  if(!rows.length)return {ok:true,synced:0};
  const payload=[],verifiedRows=[],quarantined=[];
  for(const x of rows){
   try{
   const snapshot=JSON.parse(x.snapshot_json),audit_proof=JSON.parse(x.audit_proof_json);
   if(!hex.test(String(x.content_sha256??""))||
      audit_proof?.content_sha256!==x.content_sha256||
      snapshot?.target_type!==x.entity_type||
      snapshot?.target_id!==x.entity_id||
      snapshot?.day_utc!==x.day_utc||
      !await verifySnapshot(snapshot,audit_proof,env))
    throw Error("UNIFIED_SUPABASE_LOCAL_HMAC_OR_ID_INVALID");
   payload.push({entity_type:x.entity_type,entity_id:x.entity_id,
    day_utc:x.day_utc,snapshot,audit_proof,
    content_sha256:x.content_sha256,generated_at:x.generated_at});
   verifiedRows.push(x);
   }catch{
    if(scope!=="BACKLOG")return {ok:false,error:"UNIFIED_SUPABASE_LOCAL_HMAC_OR_ID_INVALID"};
    quarantined.push(true);
   }
  }
  if(!verifiedRows.length)return {ok:false,error:"UNIFIED_SUPABASE_LOCAL_HMAC_OR_ID_INVALID",
   quarantined_snapshot_rows:quarantined.length};
  rows=verifiedRows;
  const and=rows.map(x=>"and(entity_type.eq."+x.entity_type+",entity_id.eq."+
   encodeURIComponent(x.entity_id)+",day_utc.eq."+x.day_utc+")").join(",");
  const readPath="/rest/v1/geomacro_unified_risk_daily?select=entity_type,entity_id,day_utc,content_sha256&or=("+and+")";
  // Only the canonical-day repair first checks remote bytes. An already-
  // healthy page is read-only; missing/mismatched exact immutable rows alone
  // are re-upserted. This repairs even previously acknowledged missing rows.
  let firstRead=null,needsWrite=payload;
  if(canonicalPage){
   firstRead=await (await remote(cfg,readPath,{},fetcher)).json();
   if(!Array.isArray(firstRead)||firstRead.length>rows.length||
    new Set(firstRead.map(y=>y.entity_type+"|"+y.entity_id+"|"+y.day_utc)).size!==firstRead.length)
    return {ok:false,error:"UNIFIED_CANONICAL_PAGE_REMOTE_INVALID"};
   needsWrite=payload.filter(x=>!firstRead.some(y=>
    y.entity_type===x.entity_type&&y.entity_id===x.entity_id&&
    y.day_utc===x.day_utc&&y.content_sha256===x.content_sha256));
  }
  if(needsWrite.length)
   await remote(cfg,"/rest/v1/geomacro_unified_risk_daily?on_conflict=entity_type,entity_id,day_utc",{
    method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify(needsWrite)},fetcher);
  const read=canonicalPage&&!needsWrite.length?firstRead:
   await (await remote(cfg,readPath,{},fetcher)).json();
  if(!Array.isArray(read)||read.length!==rows.length||
   new Set(read.map(y=>y.entity_type+"|"+y.entity_id+"|"+y.day_utc)).size!==rows.length||
   rows.some(x=>!read.some(y=>y.entity_type===x.entity_type&&y.entity_id===x.entity_id&&
    y.day_utc===x.day_utc&&y.content_sha256===x.content_sha256)))
   return {ok:false,error:"UNIFIED_SUPABASE_HASH_MISMATCH"};
  // Reconciliation/canary scopes verify only the immutable daily census. The
  // regular production backlog lane owns downstream rollups so these exact
  // repair paths retain their bounded request and remote-read contract.
  const rollup=scope==="BACKLOG"?
   await syncRiskGateSevenDayOutputs(env,cfg,payload,now,fetcher):
   {skipped:true,reason:"EXACT_CENSUS_SCOPE"};
  for(const row of rows){
   const receipt=await env.DB.prepare("UPDATE unified_risk_snapshots SET supabase_synced_at=? WHERE entity_type=? AND entity_id=? AND day_utc=? AND content_sha256=? AND supabase_synced_at IS NULL")
    .bind(iso(now),row.entity_type,row.entity_id,row.day_utc,row.content_sha256).run();
   if(receipt?.success===false)return {ok:false,error:"UNIFIED_SUPABASE_D1_RECEIPT_FAILED"};
  }
  return {ok:true,synced:rows.length,hash_readback_verified:true,
   quarantined_snapshot_rows:quarantined.length,degraded:quarantined.length>0||Number(rollup.quarantined_history_rows??0)>0,
   seven_day_rollup:rollup,
   scope,exact_target_count:canary?3:null,
   canonical_page:canonicalPage?page:null,
   canonical_page_count:canonicalPage?rows.length:null,
   remote_rows_repaired:canonicalPage?needsWrite.length:null};
 }catch{return {ok:false,error:"UNIFIED_SUPABASE_SYNC_FAILED"}}
}
/** Queue-less 20m assessment refresh. An empty current-GRO probe costs one
 * indexed D1 read and cannot produce an assessment or a replacement score. */
export async function runUnifiedRiskAssessmentTick(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=supabaseCfg(env);
 if(!cfg)return {ok:false,error:"UNIFIED_SUPABASE_NOT_CONFIGURED"};
 try{
  const allowed=activeRiskTargets(env,CANONICAL_UNIFIED_TARGETS).filter(x=>x.type==="COUNTRY").map(x=>x.id);
  const ids=[];
  for(let offset=0;offset<allowed.length;offset+=50){
   const batch=allowed.slice(offset,offset+50);
   const out=await env.DB.prepare("SELECT country_iso3 FROM country_gro_verified_hot WHERE country_iso3 IN ("+
    batch.map(()=>"?").join(",")+") AND generated_at<=? AND expires_at>? LIMIT 51")
    .bind(...batch,iso(now),iso(now)).all();
   if(!Array.isArray(out?.results)||out.results.length>50)throw Error("RISK_ASSESSMENT_HOT_READ_INVALID");
   for(const row of out.results)if(batch.includes(row.country_iso3))ids.push(row.country_iso3);
  }
  if(!ids.length)return {ok:true,assessment_rows:0,assessment_status:"BLOCKED_NO_SIGNED_GRO"};
  if(new Set(ids).size!==ids.length)throw Error("RISK_ASSESSMENT_HOT_DUPLICATE");
  const rows=[],quarantined=[];
  for(let offset=0;offset<ids.length;offset+=50){
   const batch=ids.slice(offset,offset+50);
   rows.push(...await signedSnapshotRows(env,"entity_type='COUNTRY' AND entity_id IN ("+
    batch.map(()=>"?").join(",")+") AND day_utc>=? AND day_utc<=?",[
     ...batch,iso(now-6*DAY).slice(0,10),iso(now).slice(0,10)],quarantined));
  }
  return {ok:true,...await materializeRiskGateAssessments(env,rows,{
   now,countryIds:ids,remote:(path,options)=>remote(cfg,path,options,fetcher),
  }),quarantined_snapshot_rows:quarantined.length};
 }catch{return {ok:false,error:"RISK_ASSESSMENT_TICK_UNAVAILABLE"}}
}
/** One strictly bounded, fresh remote D1-to-Supabase daily hash census.
 * It is not enough that D1 remembers a previous successful write:
 * 18:30 UTC acceptance must prove the exact 207 canonical identities and
 * hashes still exist remotely. Optional TWN is supplementary and excluded.
 * This never fetches private articles, spends money or invents a risk score.
 */
export async function verifyUnifiedRiskDailyRemoteCensus(env,day,{fetcher=fetch}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day??"")))
   return {ok:false,error:"UNIFIED_CENSUS_DAY_INVALID"};
 const cfg=supabaseCfg(env);
 if(!cfg)return {ok:false,error:"UNIFIED_CENSUS_SUPABASE_NOT_CONFIGURED"};
 try{
  if(!env?.DB?.prepare)return {ok:false,error:"UNIFIED_CENSUS_D1_UNAVAILABLE"};
  const local=(await env.DB.prepare(
   "SELECT entity_type,entity_id,content_sha256,supabase_synced_at FROM unified_risk_snapshots "+
   "WHERE day_utc=? AND "+(hot50RiskGateEnabled(env)?HOT50_RISK_SQL:"(entity_type='CORRIDOR' OR entity_id<>'TWN')")+" LIMIT 210"
  ).bind(day).all())?.results??[];
  const expected=new Set(activeRiskTargets(env,CANONICAL_UNIFIED_TARGETS).map(identity));
  if(local.length!==expected.size ||
    local.some(r=>!expected.has(r.entity_type+"|"+r.entity_id)||
      !hex.test(String(r.content_sha256??""))||!r.supabase_synced_at))
    return {ok:false,error:"UNIFIED_CENSUS_LOCAL_INCOMPLETE"};
  const localMap=new Map(local.map(r=>[r.entity_type+"|"+r.entity_id,r.content_sha256]));
  if(localMap.size!==expected.size)return {ok:false,error:"UNIFIED_CENSUS_LOCAL_DUPLICATE"};
  const url="/rest/v1/geomacro_unified_risk_daily?select=entity_type,entity_id,content_sha256"+
    "&day_utc=eq."+encodeURIComponent(day)+(hot50RiskGateEnabled(env)?
     "&entity_type=eq.COUNTRY&entity_id=in.("+activeRiskTargets(env,CANONICAL_UNIFIED_TARGETS).map(x=>x.id).join(",")+")":"")+"&limit=210";
  const found=await (await remote(cfg,url,{},fetcher)).json();
  if(!Array.isArray(found)||found.length>210)return {ok:false,error:"UNIFIED_CENSUS_REMOTE_INVALID"};
  const canonical=hot50RiskGateEnabled(env)?found:found.filter(r=>!(r.entity_type==="COUNTRY"&&r.entity_id==="TWN"));
  if(canonical.length!==expected.size||
    canonical.some(r=>!expected.has(r.entity_type+"|"+r.entity_id)||
      !hex.test(String(r.content_sha256??""))||
      localMap.get(r.entity_type+"|"+r.entity_id)!==r.content_sha256))
    return {ok:false,error:"UNIFIED_CENSUS_REMOTE_HASH_MISMATCH"};
  if(new Set(canonical.map(r=>r.entity_type+"|"+r.entity_id)).size!==expected.size)
    return {ok:false,error:"UNIFIED_CENSUS_REMOTE_DUPLICATE"};
  return {ok:true,remote_count:expected.size,remote_hash_matches:expected.size,
    verified_at:iso(Date.now())};
 }catch{return {ok:false,error:"UNIFIED_CENSUS_REMOTE_READBACK_UNAVAILABLE"}}
}
/** Hourly bounded prune: preserve seven rolling days of verified snapshots.
 * Remote Supabase removal and empty-old-row readback precede any local D1
 * deletion. Unsynced D1 snapshots are never purged by this maintenance.
 */
export async function cleanupUnifiedRiskSupabase(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=supabaseCfg(env);
 if(!cfg)return {ok:false,error:"UNIFIED_SUPABASE_NOT_CONFIGURED"};
 try{
  const cutoff=iso(now-SEVEN),encoded=encodeURIComponent(cutoff);
  // The project RPC limits each indexed table delete to 1000 rows and skips
  // locked rows. A residual expired row remains a visible failed acceptance;
  // the next hourly run continues, without an unbounded retry loop.
  await remote(cfg,"/rest/v1/rpc/geomacro_purge_risk_buffer_7d",{
   method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
  },fetcher);
  for(const [table,column,key] of [
   ["geomacro_unified_risk_daily","generated_at","entity_id"],
   ["geomacro_risk_signal_7d","ingested_at","id"],
   ["geomacro_corridor_candidate_7d","ingested_at","id"],
   ["geomacro_risk_assessment_7d","ingested_at","assessment_sha256"],
   ["geomacro_daily_tiered_risk_gates","generated_at","corridor_id"],
  ]){
   const check=await (await remote(cfg,"/rest/v1/"+table+"?select="+key+"&"+column+"=lt."+encoded+"&limit=1",{},fetcher)).json();
   if(!Array.isArray(check)||check.length)return {ok:false,error:"UNIFIED_CLEANUP_READBACK_FAILED"};
  }
  await env.DB.prepare("DELETE FROM unified_risk_snapshots WHERE rowid IN (SELECT rowid FROM unified_risk_snapshots WHERE generated_at<? AND supabase_synced_at IS NOT NULL ORDER BY generated_at LIMIT 500)").bind(cutoff).run();
  await env.DB.prepare("DELETE FROM risk_observations WHERE rowid IN (SELECT rowid FROM risk_observations WHERE created_at<? ORDER BY created_at LIMIT 500)").bind(cutoff).run();
  await env.DB.prepare("DELETE FROM unified_risk_generation_attempts WHERE rowid IN (SELECT rowid FROM unified_risk_generation_attempts WHERE day_utc<? ORDER BY day_utc LIMIT 500)").bind(cutoff.slice(0,10)).run();
  await env.DB.prepare("INSERT INTO risk_gate_daily_housekeeping(job_id,last_cleanup_at,next_cleanup_at) VALUES('unified_supabase_seven_day',?,?) ON CONFLICT(job_id) DO UPDATE SET last_cleanup_at=excluded.last_cleanup_at,next_cleanup_at=excluded.next_cleanup_at")
   .bind(iso(now),iso(now+60*60000)).run();
  return {ok:true,verified:true,retention_days:7,interval_hours:1};
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
 if(payload?.product_tier!==undefined&&
  !Object.hasOwn(RISK_GATE_PRODUCT_TIERS,payload.product_tier))
  return reply({ok:false,error:"UNIFIED_PRODUCT_TIER_INVALID",chargeable:false},400);
 if(!payload||Object.keys(payload).some(k=>!["target_type","target_id","client_policy","override_acknowledged","approved_thresholds","product_tier"].includes(k))||
  !basePolicy(payload))return reply({ok:false,error:"UNIFIED_INVALID_REQUEST"},400);
 const target=parseTarget(payload);
 if(!target)return reply({ok:false,error:"UNKNOWN_COUNTRY_OR_CORRIDOR"},400);
 if(hot50RiskGateEnabled(env)&&(target.type!=="COUNTRY"||!isHot50RiskCountry(target.id)))
  return reply({ok:false,error:"RISK_GATE_OUTSIDE_HOT50_SCOPE",chargeable:false},400);
 try{
  const x=await generateUnifiedSnapshot(env,target,opts);
  // Daily record is integrity-signed observation; no unsigned client threshold
  // can transform it into a paid verified hard verdict.
  // Immutable daily snapshot is integrity-signed; customer-specific policy
  // must be evaluated against a freshly verified Ed25519 GRO, not RSS counts.
  // Client-specific result is never misrepresented as part of the daily HMAC.
  const now=opts.now??Date.now();
  // Always re-evaluate the CURRENT pinned, Ed25519-verified and
  // commercial-qualified GRO at query time. Never replace/re-sign an
  // immutable daily observation because a GRO arrives later that day.
  const gro=await signedGro(env,target,now);
  const trustedScores=validatedSignedCategoryScores(gro);
  const independentScore=calculateUnifiedRisk(Object.fromEntries(
   CATEGORIES.map(k=>[k,trustedScores[k]??null])));
  const signedLiveStatus=!gro?"CURRENT_SIGNED_GRO_UNAVAILABLE":
   independentScore.unifiedScore===null?
    "CURRENT_SIGNED_GRO_THREE_CATEGORY_INCOMPLETE":
    "CURRENT_ED25519_VERIFIED_THREE_CATEGORY_SCORE";
  // Explicit acceptance semantics: missing qualified GRO is a truthful
  // fail-closed neutral receipt, NEVER a verified score or paid decision.
  // Native unified score is normalized 0..1, equivalent to 0..100 percent.
  const scoreReady=gro!==null&&independentScore.unifiedScore!==null&&
   Number.isFinite(independentScore.unifiedScore)&&
   independentScore.unifiedScore>=0&&independentScore.unifiedScore<=1;
  const verifiedLiveScoring={
   status:signedLiveStatus,
   advisory_state:scoreReady?"VERIFIED_SCORE_READY":"NOT_READY",
   fail_closed:!scoreReady,
   verified_score_0_100:scoreReady?Number((independentScore.unifiedScore*100).toFixed(2)):null,
   unified_risk_score:independentScore.unifiedScore,
   category_scores:Object.fromEntries(CATEGORIES.map(k=>[k,trustedScores[k]??null])),
   missing_categories:independentScore.missing_categories,
   signed_gro_object_id:gro?.object_id??null,
   gro_generated_at:gro?.generated_at??null,
   gro_expires_at:gro?.expires_at??null,
   trusted_signed_gro_verified:gro!==null,
   included_in_daily_snapshot_hmac:false,
   commercial_action_authorized:false,
  };
  let customTiers=generateCommercialTiers(independentScore,{
   groVerified:!!gro,confidence:gro?.confidence??null,
   ...(payload.approved_thresholds?{policy:payload.approved_thresholds}:{})
  });
  const lenient=payload.client_policy==="LENIENT"&&payload.override_acknowledged===true;
  let clientPolicyDecision=lenient?
   customTiers.policy.lenient_mode_outcome:customTiers.core.gate_decision;
  const flash=gro?await readIntradayFlashOverride(env.DB,gro,{type:target.type,id:target.id},now):{available:true,active:false};
  const flashApplies=(flash.active||flash.available===false)&&["GATE_PASS","OVERRIDE_PASS"].includes(clientPolicyDecision);
  if(flashApplies){
   customTiers={...customTiers,core:{...customTiers.core,gate_decision:"GATE_HOLD",evidence_state:"INTRADAY_MATERIAL_FLASH_OVERRIDE"}};
   if(lenient)customTiers={...customTiers,policy:{...customTiers.policy,lenient_mode_outcome:"OVERRIDE_HOLD"}};
   clientPolicyDecision="GATE_HOLD";
  }
  let tiered_product=null;
  if(payload.product_tier!==undefined){
   const page=await env.DB.prepare(
    "SELECT category,source_count,evidence_payload FROM risk_observations "+
    "WHERE entity_type=? AND entity_id=? AND day_utc=? LIMIT 4"
   ).bind(target.type,target.id,x.snapshot.day_utc).all();
   const observations=page?.results;
   if(!Array.isArray(observations)||observations.length>3)
    throw Error("RISK_GATE_THREE_TIER_OBSERVATION_READ_UNVERIFIED");
   // Basic Fast SLA: re-read the actual last-24h D1 native originals on
   // every authorized query. Existing once/day HMAC snapshot is not current
   // news, so supplement older observations without rebuilding daily state.
   if(payload.product_tier==="basic_focused"){
    const liveTarget={...target,...registry(target.type,target.id)};
    const fresh=await Promise.all(CATEGORIES.map(async category=>{
     const entries=compactEvidence(
      await d1Observed(env,liveTarget,category,now));
     return {category,entries};
    }));
    for(const reading of fresh){
     if(!reading.entries.length)continue;
     const replacement={
      category:reading.category,source_count:reading.entries.length,
      evidence_payload:JSON.stringify({
       schema:"geomacro.risk-observation.v1",sources:reading.entries,
      }),
     };
     const position=observations.findIndex(x=>x.category===reading.category);
     if(position>=0)observations[position]=replacement;
     else observations.push(replacement);
    }
    const gapRows=await env.DB.prepare(
     "SELECT category,event_id,source_id,source_host,title_sha256,event_at,impact_factor "+
     "FROM unverified_observations WHERE entity_type=? AND entity_id=? "+
     "AND event_at>=? AND event_at<=? ORDER BY event_at DESC LIMIT 60"
    ).bind(target.type,target.id,iso(now-DAY),iso(now)).all();
    if(!Array.isArray(gapRows?.results)||gapRows.results.length>60)
     throw Error("RISK_GATE_GAP_OBSERVATION_READ_UNVERIFIED");
    for(const category of CATEGORIES){
     const matches=gapRows.results.filter(row=>row.category===category);
     if(!matches.length)continue;
     const replacement={category,source_count:Math.min(40,matches.length),
      evidence_payload:JSON.stringify({schema:"geomacro.risk-observation.v1",
       sources:matches.slice(0,6).map(row=>({id:row.event_id,
        origin:row.source_host,published_at:row.event_at,title_hash:row.title_sha256,
        impact_factor:row.impact_factor,status:"OBSERVED_UNVERIFIED"}))})};
     const position=observations.findIndex(x=>x.category===category);
     if(position>=0){
      try{
       const existing=JSON.parse(observations[position].evidence_payload);
       if(!Array.isArray(existing.sources)||existing.sources.length<matches.length)
        observations[position]=replacement;
      }catch{observations[position]=replacement;}
     }else observations.push(replacement);
    }
   }
   let archive_proof=null,history=[];
   if(payload.product_tier==="complex_full"){
    const lookup=target.type==="COUNTRY"?
     "SELECT object_id,archive_key,archive_sha256,archive_write_acknowledged,"+
      "archive_readback_verified FROM country_gro_verified_hot "+
      "WHERE country_iso3=? AND object_id=? LIMIT 1":
     "SELECT object_id,archive_key,archive_sha256,archive_write_acknowledged,"+
      "archive_readback_verified FROM corridor_gro_verified_hot "+
      "WHERE corridor_id=? AND object_id=? LIMIT 1";
    if(gro)archive_proof=await env.DB.prepare(lookup).bind(target.id,gro.object_id).first();
    const beginning=iso(now-6*DAY).slice(0,10);
    const scanned=await env.DB.prepare(
     "SELECT entity_type,entity_id,day_utc,snapshot_json,audit_proof_json,"+
     "content_sha256 FROM unified_risk_snapshots "+
     "WHERE entity_type=? AND entity_id=? AND day_utc>=? AND day_utc<=? "+
     "ORDER BY day_utc ASC LIMIT 8"
    ).bind(target.type,target.id,beginning,iso(now).slice(0,10)).all();
    if(!Array.isArray(scanned?.results)||scanned.results.length>7)
     throw Error("RISK_GATE_THREE_TIER_HISTORY_PAGE_UNVERIFIED");
    for(const r of scanned.results){
     const hist=JSON.parse(r.snapshot_json),proof=JSON.parse(r.audit_proof_json);
     if(r.entity_type!==target.type||r.entity_id!==target.id||
       r.day_utc!==hist.day_utc||r.content_sha256!==proof.content_sha256||
       !await verifySnapshot(hist,proof,env))
      throw Error("RISK_GATE_THREE_TIER_HISTORY_PROOF_MISMATCH");
     history.push({...r,snapshot:hist,proof_verified:true});
    }
   }
   // Standard must see today's newly corroborated events immediately,
   // rather than the facts frozen into the first immutable daily snapshot.
   // These query-time facts remain outside that snapshot's HMAC scope.
   const productSnapshot=payload.product_tier==="standard"?
    {...x.snapshot,corroborated_risk_facts:await corroboratedGapFacts(env,
      {...target,...registry(target.type,target.id)},now)}:x.snapshot;
   tiered_product=composeRiskGateThreeTierResponse({
    tier:payload.product_tier,snapshot:productSnapshot,observations,
    verified_gro:gro,archive_proof,history,now,
   });
   tiered_product.intraday_override=flash.active===true;
   tiered_product.flash_check_available=flash.available===true;
   if(flash.active)tiered_product.flash_details=flash;
  }
  const body={...x.snapshot,audit_proof:x.audit_proof,supabase_synced:x.supabase_synced,
   ...(tiered_product?{tiered_product}:{}),
   client_policy:payload.client_policy??"STRICT",
   tiers:customTiers,client_policy_decision:clientPolicyDecision,
   intraday_override:flash.active===true,flash_check_available:flash.available===true,
   ...(flash.active?{flash_details:flash}:{}),
   policy_evaluation_proof_scope:"NOT_INCLUDED_IN_DAILY_SNAPSHOT_HMAC",
   policy_evaluation_has_verified_gro:!!gro,
   verified_live_scoring:verifiedLiveScoring,
   policy_evaluation_has_complete_verified_score:
    gro!==null&&independentScore.unifiedScore!==null,
   requested_lenient_override:lenient,
   override_acknowledged:payload.override_acknowledged===true,
   client_override_applied:lenient,execution_authorized:false};
  const requestHash=await hash(JSON.stringify(payload));
  const receipt=await persistRiskGateAuditReceipt(env.DB,{
   // This endpoint evaluates current evidence on every call and accepts no
   // caller idempotency key. Identical bodies at different times are distinct
   // evaluations; a body-derived ID collides with the append-only old receipt.
   client_id:"unified-risk-gate-v1",request_id:"rg-"+crypto.randomUUID(),
   request_hash:requestHash,subject_type:target.type.toLowerCase(),subject_id:target.id,
   decision:clientPolicyDecision,policy_id:payload.approved_thresholds?"approved-thresholds":"default-policy",
   policy_version:payload.approved_thresholds?"caller-approved-v1":"unified-v1",
   evaluated_at:iso(now),response:body,env,
  });
  body.audit_receipt_hash=receipt.audit_receipt_hash;
  body.audit_receipt_response_hash=receipt.response_hash;
  body.audit_receipt_signature=receipt.audit_receipt_signature;
  body.audit_receipt_signature_key_id=receipt.signature_key_id;
  body.audit_receipt_signature_scheme=receipt.signature_scheme;
  body.audit_receipt_signature_scope=receipt.signature_scope;
  return reply({ok:true,...body});
 }catch{return reply({ok:false,error:"UNIFIED_PRODUCTION_EVIDENCE_OR_STORAGE_UNAVAILABLE",chargeable:false},503)}
}
/** 195 countries once each UTC day; 12 corridors in separate minute slots. */
// Exactly 195 canonical countries and 12 strategic corridors; TWN canary is
// intentionally supplementary and excluded from the canonical 207 census.
export const CANONICAL_UNIFIED_TARGETS=Object.freeze([
 ...PHASE2H_COUNTRIES_195.map(c=>Object.freeze({type:"COUNTRY",id:c.iso3})),
 ...DAILY_RG_CORRIDORS.map(c=>Object.freeze({type:"CORRIDOR",id:c.id}))
]);
const identity=x=>x.type+"|"+x.id;
export function selectUnifiedRecoveryTarget(completed,attempts,now,targets=CANONICAL_UNIFIED_TARGETS){
 const minute=new Date(now).getUTCHours()*60+new Date(now).getUTCMinutes();
 if(minute<512||minute>=1095)return null;
 const done=new Set(completed.map(x=>x.entity_type+"|"+x.entity_id));
 const byId=new Map(attempts.map(x=>[x.entity_type+"|"+x.entity_id,x]));
 const start=(minute-512)%targets.length;
 for(let i=0;i<targets.length;i++){
  const target=targets[(start+i)%targets.length];
  if(done.has(identity(target)))continue;
  const prev=byId.get(identity(target));
  if(prev&&(Number(prev.attempt_count)>=3||
      Date.parse(prev.next_retry_at)>now))continue;
  return target;
 }
 return null;
}
/** Primary minute slots plus one bounded catch-up target/minute until 18:15 UTC.
 * The D1 attempt ledger prevents a failing upstream feed from looping forever.
 */
export async function scheduledUnifiedRisk(env,now=Date.now(),opts={}){
 const d=new Date(now),minute=d.getUTCHours()*60+d.getUTCMinutes(),countryIdx=minute-300;
 const scoped=hot50RiskGateEnabled(env),targets=activeRiskTargets(env,CANONICAL_UNIFIED_TARGETS);
 let target=null;
 if(countryIdx>=0&&countryIdx<(scoped?50:PHASE2H_COUNTRIES_195.length))
  target=targets[countryIdx];
 else if(!scoped&&minute>=500&&minute<512)
  target=CANONICAL_UNIFIED_TARGETS[195+minute-500];
 else if(minute>=512&&minute<1095){
  // Fifty daily subjects need bounded catch-up, not 583 duplicate census scans.
  if(scoped&&minute%20!==0)return {ok:true,not_due:true};
  if(!env?.DB?.prepare)return {ok:false,error:"UNIFIED_RECOVERY_D1_UNAVAILABLE"};
  try{
   const day=iso(now).slice(0,10);
   const [completed,attempts]=await Promise.all([
    env.DB.prepare("SELECT entity_type,entity_id FROM unified_risk_snapshots WHERE day_utc=?").bind(day).all(),
    env.DB.prepare("SELECT entity_type,entity_id,attempt_count,next_retry_at FROM unified_risk_generation_attempts WHERE day_utc=?").bind(day).all()
   ]);
   target=selectUnifiedRecoveryTarget(completed?.results??[],attempts?.results??[],now,targets);
  }catch{return {ok:false,error:"UNIFIED_RECOVERY_CENSUS_UNAVAILABLE"}}
 }
 if(!target)return {ok:true,not_due:true};
 if(!env?.DB?.prepare)return {ok:false,target,error:"UNIFIED_D1_UNAVAILABLE"};
 try{
  const day=iso(now).slice(0,10),timestamp=iso(now),retryAt=iso(now+15*60000);
  const receipt=await env.DB.prepare(
   "INSERT INTO unified_risk_generation_attempts(day_utc,entity_type,entity_id,attempt_count,last_attempt_at,next_retry_at) "+
   "VALUES(?,?,?,1,?,?) ON CONFLICT(day_utc,entity_type,entity_id) DO UPDATE SET "+
   "attempt_count=attempt_count+1,last_attempt_at=excluded.last_attempt_at,"+
   "next_retry_at=excluded.next_retry_at "+
   "WHERE attempt_count<3 AND next_retry_at<=? RETURNING attempt_count"
  ).bind(day,target.type,target.id,timestamp,retryAt,timestamp).first();
  if(!receipt)return {ok:true,target,skipped_retry_budget:true};
  const result=await generateUnifiedSnapshot(env,target,{now,...opts});
  return {ok:true,target,generated:!result.existing,day_utc:result.snapshot.day_utc,
   category_count:CATEGORIES.length,
   verified_categories:CATEGORIES.filter(c=>result.snapshot.categories[c]?.status==="VERIFIED_SIGNED_GRO").length};
 }catch{return {ok:false,target,error:"UNIFIED_SCHEDULED_GENERATION_FAILED"}}
}

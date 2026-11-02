/**
 * Tiered Risk Gate observation/policy overlay. Independent paid products:
 * CORE ($.50), SIGNAL ($.02), POLICY (subscription/credits).
 * No Predge price, token, signed verdict, research or x402 mutation.
 */
import {verifyHotGRO} from "./predge-risk-gate-d1.mjs";
import {phase2hHeadlineCountryCandidate,phase2hCountry} from "../../../scripts/lib/phase2h-country-originals-195.mjs";

export const CONTROLLED_GATE_SCHEMA="geomacro.risk-gate-controlled-bypass.v1";
export const CONTROLLED_GATE_PRODUCTS=Object.freeze({
 CORE:Object.freeze({name:"Deterministic Hard Gate",price_usd:"0.50"}),
 SIGNAL:Object.freeze({name:"Early Warning / Advisory",price_usd:"0.02"}),
 POLICY:Object.freeze({name:"Client-Assumed Override",price_usd:null,pricing:"SUBSCRIPTION_PLUS_CREDITS"})
});
const ROUTES=Object.freeze({
 "red-sea":"red_sea","bab-el-mandeb":"bab_el_mandeb",
 "hormuz":"strait_of_hormuz","suez":"suez_canal",
 "panama":"panama_canal","malacca":"strait_of_malacca",
 "taiwan-strait":"taiwan_strait","singapore-strait":"singapore_strait"
});
const OFFICIAL_SOURCE_IDS=new Set([
 "federal_reserve","boe_news","boj_releases","bank_of_canada",
 "rbi_official_press_releases","wto_official_news",
 "usgs_official_minerals_news","doe_official_critical_materials_news",
 "ukmto_incidents","ukmto_advisories","suez_navigation","panama_canal"
]);
const HEX=/^[a-f0-9]{64}$/;
const MAX_AGE=72*3600000,DAY_LIMIT=100;
const hdr={"Cache-Control":"private, no-store","Vary":"Authorization","X-Content-Type-Options":"nosniff"};
const reply=(data,status=200)=>Response.json(data,{status,headers:hdr});
const fail=(error,status=503)=>reply({ok:false,error,chargeable:false,execution_authorized:false},status);
const rec=x=>x&&typeof x==="object"&&!Array.isArray(x);
const enc=new TextEncoder();
const compact=x=>JSON.stringify(x);
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(text)))].map(b=>b.toString(16).padStart(2,"0")).join("");
function validSubject(s){
 if(!rec(s)||Object.keys(s).sort().join("|")!=="id|type")return false;
 if(s.type==="country")return !!phase2hCountry(s.id);
 return s.type==="corridor"&&
  (Object.hasOwn(ROUTES,s.id)||/^[A-Z]{3}>[A-Z]{3}$/.test(s.id)&&s.id.slice(0,3)!==s.id.slice(4));
}
export function parseControlledGateRequest(r,now=Date.now()){
 if(!rec(r)||Object.keys(r).some(k=>!["request_id","subject","product_tier","policy_mode",
 "client_override","risk_policy","requested_at"].includes(k))||
  typeof r.request_id!=="string"||!/^[a-zA-Z0-9._:-]{3,128}$/.test(r.request_id)||
  !validSubject(r.subject)||!Object.hasOwn(CONTROLLED_GATE_PRODUCTS,r.product_tier)||
  (r.policy_mode!==undefined&&!["STRICT","LENIENT"].includes(r.policy_mode))||
  typeof r.requested_at!=="string"||!Number.isFinite(Date.parse(r.requested_at))||
  Math.abs(Date.parse(r.requested_at)-now)>5*60000)return null;
 const mode=r.policy_mode??"STRICT";
 if(mode==="STRICT"&&r.client_override!==undefined)return null;
 if(mode==="LENIENT"){
  const o=r.client_override;
  if(r.product_tier!=="POLICY"||!rec(o)||o.acknowledged!==true||
   !["PASS","HOLD"].includes(o.action)||
   Object.keys(o).sort().join("|")!=="acknowledged|action")return null;
 }else if(r.product_tier==="POLICY")return null;
 if(r.risk_policy!==undefined){
  const p=r.risk_policy;
  if(!rec(p)||typeof p.policy_id!=="string"||typeof p.policy_version!=="string"||
    ![p.continue_max_score,p.reduce_limit_max_score,p.require_approval_max_score,
      p.minimum_confidence_for_auto_continue].every(n=>typeof n==="number"&&Number.isFinite(n))||
    !(p.continue_max_score>=0&&p.continue_max_score<p.reduce_limit_max_score&&
      p.reduce_limit_max_score<p.require_approval_max_score&&p.require_approval_max_score<=100)||
    p.minimum_confidence_for_auto_continue<0||p.minimum_confidence_for_auto_continue>1||
    typeof p.require_commercial_verification_for_continue!=="boolean"||
    Object.keys(p).some(k=>!["policy_id","policy_version","continue_max_score",
      "reduce_limit_max_score","require_approval_max_score",
      "minimum_confidence_for_auto_continue","require_commercial_verification_for_continue",
      "max_positive_delta_for_auto_continue","hard_stop_driver_contributions"].includes(k)))return null;
 }
 return {...r,policy_mode:mode};
}
const host=url=>{try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"")}catch{return ""}};
/** Candidate metadata is not evidence of an event or commercial source rights. */
export function dedupeObservedPublications(observations){
 const chosen=[],seen=new Set(),origin=new Set(),domains=new Set(),titleOrigins=new Map();
 for(const o of observations){
  if(!rec(o)||typeof o.id!=="string"||!HEX.test(o.id)||
   !HEX.test(String(o.title_hash))||typeof o.source_id!=="string"||
   typeof o.url!=="string"||!o.source_id||seen.has(o.id))continue;
  const h=host(o.url);
  if(!h)continue;
  seen.add(o.id);
  // Same-title multi-publisher publication is one potential wire origin.
  const fingerprint=o.title_hash;
  const originKey=titleOrigins.get(fingerprint)??o.source_id;
  titleOrigins.set(fingerprint,originKey);
  origin.add(originKey);domains.add(h);
  chosen.push({id:o.id,source_id:o.source_id,title_hash:fingerprint,
   publisher_host:h,original_published_at:o.published_at,
   official_source_observed:OFFICIAL_SOURCE_IDS.has(o.source_id)});
 }
 return {items:chosen,source_count:chosen.length,domains_observed:domains.size,
  inferred_origin_groups:origin.size,independent_origins_verified:0,
  wire_syndication_not_independent_proof:true,
  authoritative_first_party_publications:chosen.filter(x=>x.official_source_observed).length};
}
async function observationsForSubject(db,subject,now){
 const since=new Date(now-MAX_AGE).toISOString(),until=new Date(now).toISOString();
 if(subject.type==="corridor"&&Object.hasOwn(ROUTES,subject.id)){
  const rows=(await db.prepare("SELECT candidate_id,source_id,native_published_at,article_url,source_title_sha256,candidate_corridor_ids_json FROM corridor_native_news_candidates WHERE native_published_at>=? AND native_published_at<=? AND instr(candidate_corridor_ids_json,?)>0 ORDER BY native_published_at DESC LIMIT 40")
   .bind(since,until,'"'+ROUTES[subject.id]+'"').all())?.results??[];
  return rows.filter(r=>{try{return JSON.parse(r.candidate_corridor_ids_json).includes(ROUTES[subject.id])}catch{return false}})
   .map(r=>({id:r.candidate_id,source_id:r.source_id,
     url:r.article_url,title_hash:r.source_title_sha256,published_at:r.native_published_at}));
 }
 if(subject.type!=="country")return [];
 const rows=[];
 for(const cat of ["geopolitics","macro","rare_earth"]){
  const chunk=(await db.prepare("SELECT record_id,raw_sha256,raw_json,original_published_at FROM phase2h_private_raw_news WHERE category=? AND original_published_at>=? AND original_published_at<=? ORDER BY original_published_at DESC LIMIT 40")
   .bind(cat,since,until).all())?.results??[];
  rows.push(...chunk);
 }
 const selected=[];
 for(const row of rows){
  try{
   if(!HEX.test(row.record_id)||!HEX.test(row.raw_sha256))continue;
   const data=JSON.parse(row.raw_json);
   if(data.record_id!==row.record_id||data.raw_sha256!==row.raw_sha256||
    data.original.original_published_at!==row.original_published_at||
    phase2hHeadlineCountryCandidate(data.original.original_title)!==subject.id)continue;
   selected.push({id:row.record_id,source_id:data.original.original_source_id,
     url:data.original.original_url,
     title_hash:await hash(data.original.original_title.normalize("NFKC").trim().toLowerCase()),
     published_at:row.original_published_at});
  }catch{/* discard malformed candidate */}
 }
 return selected.slice(0,40);
}
async function freshGRO(db,env,subject,now){
 if(subject.type==="corridor"&&Object.hasOwn(ROUTES,subject.id))return null;
 const iso=new Date(now).toISOString();
 const row=subject.type==="country"?
  await db.prepare("SELECT * FROM country_gro_verified_hot WHERE country_iso3=? AND generated_at<=? AND expires_at>? LIMIT 1")
   .bind(subject.id,iso,iso).first():
  await db.prepare("SELECT * FROM corridor_gro_verified_hot WHERE corridor_id=? AND generated_at<=? AND expires_at>? LIMIT 1")
   .bind(subject.id,iso,iso).first();
 return row?verifyHotGRO(row,env,subject,now):null;
}
export function determineControlledGate({request,observed,verified_decision=null,gro=null}){
 const verified=!!gro&&["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"].includes(verified_decision);
 const gate=verified?(verified_decision==="CONTINUE"?"GATE_PASS":
  verified_decision==="PAUSE"?"GATE_BLOCKED":"GATE_ADVISORY"):"GATE_ADVISORY";
 const override=request.policy_mode==="LENIENT";
 const official=observed.authoritative_first_party_publications>0;
 // An authenticated official observation waives the second-*publication*
 // requirement for the issuer's own statement, never confirms an incident.
 const status=verified?"VERIFIED_SIGNED_RISK_OBJECT":
  official?"AUTHORITATIVE_PUBLICATION_OBSERVED_EVENT_UNCONFIRMED":
  "UNCONFIRMED_SINGLE_ORIGIN";
 return {gate_decision:gate,verification_state:{
  status,is_authoritative_source:official,
  confidence_score:verified?gro.confidence:0.40,
  confidence_method:verified?"VERIFIED_GRO_METHODOLOGY":"PROVISIONAL_OBSERVATION_HEURISTIC_NOT_EVENT_PROBABILITY",
  sources_observed:observed.source_count,domains_observed:observed.domains_observed,
  independent_domains:observed.inferred_origin_groups,
  independent_origins_verified:verified?gro.evidence_summary.independent_source_count:0,
  event_truth_verified:verified,wire_syndication_not_independent_proof:true
 },client_override_applied:override,
  client_policy_decision:override?(request.client_override.action==="PASS"?"OVERRIDE_PASS":"OVERRIDE_HOLD"):null,
  decision_reason:override?"CLIENT_POLICY_OVERRIDE":verified?"VERIFIED_GRO_EVALUATION":"OBSERVATION_ONLY",
  execution_authorized:false,
  billing:{tier:request.product_tier,product_name:CONTROLLED_GATE_PRODUCTS[request.product_tier].name,
   quoted_price_usd:CONTROLLED_GATE_PRODUCTS[request.product_tier].price_usd,
   pricing_model:CONTROLLED_GATE_PRODUCTS[request.product_tier].pricing??"PER_CALL",
   credits_deducted:0,chargeable:false,customer_paid:false}
 };
}
const timingEqual=(a,b)=>{
 if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64)return false;
 let bits=0;for(let i=0;i<a.length;i++)bits|=a.charCodeAt(i)^b.charCodeAt(i);return bits===0;
};
async function signedObservation(env,request,result,observed,now){
 const secret=String(env.RISK_GATE_OBSERVATION_HMAC_KEY??"");
 if(enc.encode(secret).length<32)throw Error("HMAC_NOT_CONFIGURED");
 const observation_hash=await hash(compact({request_id:request.request_id,subject:request.subject,
  source_records:observed.items,gate_decision:result.gate_decision,
  verification_state:result.verification_state,client_policy_decision:result.client_policy_decision}));
 const timestamp_utc=new Date(now).toISOString();
 const message=compact({schema:CONTROLLED_GATE_SCHEMA,observation_hash,timestamp_utc});
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,enc.encode(message));
 return {observation_hash,timestamp_utc,integrity_signature:"hmac_sha256:"+
  [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join(""),
  signature_scope:"SNAPSHOT_INTEGRITY_AUTHENTICITY_NOT_EVENT_TRUTH"};
}
async function canonicalDecision(gro,request,now){
 if(!gro||!request.risk_policy)return null;
 const {evaluateRiskGate}=await import("../../../src/lib/risk-gate-engine.ts");
 const result=evaluateRiskGate({request_id:request.request_id,subject:request.subject,
  policy:request.risk_policy},gro,new Date(now));
 return result.decision;
}
export async function controlledRiskGateEvaluate(request,env,now=Date.now()){
 const expected=String(env?.RISK_GATE_TIERED_TOKEN??"");
 const token=request.headers.get("authorization")??"";
 if(!HEX.test(expected)||timingEqual(expected,String(env?.CONTROL_PLANE_TOKEN??""))||
  timingEqual(expected,String(env?.PREDGE_RISK_GATE_TOKEN??"")))
  return fail("RG_TIERED_AUTH_NOT_CONFIGURED");
 if(!/^Bearer [a-f0-9]{64}$/.test(token)||!timingEqual(token.slice(7),expected))
  return fail("RG_TIERED_UNAUTHORIZED",401);
 if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
 if((request.headers.get("content-type")??"").split(";")[0]!=="application/json")
  return fail("UNSUPPORTED_MEDIA_TYPE",415);
 if(!env?.DB?.prepare)return fail("RG_D1_UNAVAILABLE");
 let raw;
 try{
  raw=await request.text();
  if(enc.encode(raw).length>16384)return fail("BODY_TOO_LARGE",413);
 }catch{return fail("INVALID_REQUEST",400)}
 let payload;try{payload=JSON.parse(raw)}catch{return fail("INVALID_JSON",400)}
 const parsed=parseControlledGateRequest(payload,now);
 if(!parsed)return fail("RG_TIERED_REQUEST_INVALID",400);
 // GRO must be genuinely signed and current before any automatic hard decision.
 // Without policy thresholds the endpoint returns only an observation.
 try{
  const request_hash=await hash(compact(payload));
  const prior=await env.DB.prepare("SELECT request_hash,state,response_json FROM risk_gate_tiered_requests WHERE client_id=? AND request_id=? LIMIT 1")
   .bind("tiered-private-v1",parsed.request_id).first();
  if(prior){
   if(prior.request_hash!==request_hash)return fail("RG_TIERED_IDEMPOTENCY_CONFLICT",409);
   if(prior.state==="DONE"&&prior.response_json)return reply({...JSON.parse(prior.response_json),idempotent_replay:true});
   if(prior.state==="CLAIMED"){
    const stale=await env.DB.prepare("SELECT claimed_at FROM risk_gate_tiered_requests WHERE client_id=? AND request_id=?").bind("tiered-private-v1",parsed.request_id).first();
    if(!stale?.claimed_at||Date.parse(stale.claimed_at)>now-90000)return fail("RG_TIERED_REQUEST_IN_PROGRESS",409);
   }
  }
  const observations=dedupeObservedPublications(await observationsForSubject(env.DB,parsed.subject,now));
  const gro=await freshGRO(env.DB,env,parsed.subject,now);
  const verified_decision=await canonicalDecision(gro,parsed,now);
  const result=determineControlledGate({request:parsed,observed:observations,verified_decision,gro:verified_decision?gro:null});
  const audit_proof=await signedObservation(env,parsed,result,observations,now);
  const body={ok:true,schema:CONTROLLED_GATE_SCHEMA,request_id:parsed.request_id,
   subject:parsed.subject,product_tier:parsed.product_tier,policy_mode:parsed.policy_mode,
   ...result,audit_proof,chargeable:false};
  // D1 immutable replay and isolated per-day quota. No attempted customer debit.
  const ts=new Date(now).toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO risk_gate_tiered_requests (client_id,request_id,request_hash,state,created_at) VALUES (?,?,?,'PENDING',?)")
   .bind("tiered-private-v1",parsed.request_id,request_hash,ts).run();
  const claim=await env.DB.prepare("UPDATE risk_gate_tiered_requests SET state='CLAIMED',claimed_at=? WHERE client_id=? AND request_id=? AND request_hash=? AND (state='PENDING' OR (state='CLAIMED' AND claimed_at<?)) RETURNING request_id")
   .bind(ts,"tiered-private-v1",parsed.request_id,request_hash,new Date(now-90000).toISOString()).first();
  if(!claim)return fail("RG_TIERED_REQUEST_IN_PROGRESS",409);
  const budget=await env.DB.prepare("INSERT INTO risk_gate_d1_quota (client_id,usage_day,used) VALUES (?,?,1) ON CONFLICT(client_id,usage_day) DO UPDATE SET used=used+1 WHERE used<? RETURNING used")
   .bind("tiered-private-v1",ts.slice(0,10),DAY_LIMIT).first();
  if(!budget){
   await env.DB.prepare("UPDATE risk_gate_tiered_requests SET state='PENDING',claimed_at=NULL WHERE client_id=? AND request_id=? AND state='CLAIMED' AND claimed_at=?")
    .bind("tiered-private-v1",parsed.request_id,ts).run();
   return fail("RG_TIERED_DAILY_LIMIT",429);
  }
  const done=await env.DB.prepare("UPDATE risk_gate_tiered_requests SET state='DONE',response_json=?,finished_at=? WHERE client_id=? AND request_id=? AND request_hash=? AND state='CLAIMED' RETURNING request_id")
   .bind(compact(body),ts,"tiered-private-v1",parsed.request_id,request_hash).first();
  if(!done)return fail("RG_TIERED_AUDIT_UNAVAILABLE");
  return reply(body);
 }catch{return fail("RG_TIERED_PIPELINE_UNAVAILABLE")}
}

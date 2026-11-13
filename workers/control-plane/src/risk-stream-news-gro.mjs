/**
 * Immediate, factual-status-labelled GeoMacro-signed risk ANALYSIS from today's
 * incoming Hot50 news/OSINT. The signature authenticates GeoMacro authorship,
 * NOT the truth of an unverified observation. It never issues a commercial
 * licence or enters the paid/verified GRO outbox.
 */
import {isHot50RiskCountry} from "./risk-gate-hot50-scope.mjs";
import {canonicalProgressiveJson,progressiveSha,signProgressiveDecision}
 from "./progressive-risk-gate.mjs";

const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const TIER_PRICES=Object.freeze({basic_focused:15,standard:20,complex_full:30});
const TIER_ORDER=Object.freeze(Object.keys(TIER_PRICES));
const HEX=/^[0-9a-f]{64}$/u;
const DAY_MS=86400000;
const EVENT_KINDS=Object.freeze({
 WAR:88,SANCTIONS:75,EXPORT_CONTROL:73,BAN:70,DEBT:72,
 INFLATION:63,TRADE:52,POLICY:48
});
const MARKET=Object.freeze({
 GEOPOLITICS:"Monitor sovereign, sanctions, trade and cross-border exposure; market reaction is not asserted.",
 MACRO_FX:"Monitor official releases, policy expectations and currency exposure; price direction is unverified.",
 CRITICAL_MINERALS:"Monitor mineral supply, trade restrictions and critical-input exposure; no price move is asserted."
});
const WATCH=Object.freeze({
 GEOPOLITICS:"Look for a dated original government or independent event confirmation.",
 MACRO_FX:"Look for a dated primary monetary or statistical release and independent confirmation.",
 CRITICAL_MINERALS:"Look for a dated original trade, customs or minerals announcement."
});
/**
 * Three genuinely different levels of deterministic, event-driven analysis.
 * These are conditional hypotheses, never unsupported assertions of impact.
 * Complex remains non-billable without the separate reviewed product policy.
 */
const DEPTH=Object.freeze({
 GEOPOLITICS:{
  drivers:["sovereign policy transmission","security and border exposure","trade or sanctions restrictions"],
  exposure:["cross-border counterparties","sovereign and trade-sensitive operations"],
  scenarios:["further official escalation","independent confirmation without escalation","formal correction or withdrawal"],
  mitigation:["review affected jurisdictions","require human policy approval before action"]},
 MACRO_FX:{
  drivers:["policy expectation transmission","macro release sensitivity","currency or rate repricing risk"],
  exposure:["FX-denominated obligations","interest-rate-sensitive balances"],
  scenarios:["follow-up official tightening signal","neutral or unchanged policy confirmation","revision or contradictory release"],
  mitigation:["check relevant exposure limits","monitor the next dated primary release"]},
 CRITICAL_MINERALS:{
  drivers:["physical supply concentration","export or customs friction","critical-input substitution risk"],
  exposure:["mineral-dependent supply chains","import or processing bottlenecks"],
  scenarios:["verified export restriction","unaffected flow confirmation","restriction reversal or correction"],
  mitigation:["review critical input dependencies","require verified customs or ministry confirmation"] }
});
const depth=(tier,category,proof)=>{
 const d=DEPTH[category];
 if(tier==="basic_focused")return {
  analysis_depth:"FOCUSED_SIGNAL",event_observation_only:true,
  watch_channel:d.exposure[0]};
 if(tier==="standard")return {
  analysis_depth:"EVENT_CAUSAL_HYPOTHESES",
  potential_drivers:d.drivers,exposure_channels:d.exposure,
  qualified_for_verified_claim:proof==="CORROBORATED_INTERNAL_GRO",
  observed_market_reaction_verified:false};
 return {analysis_depth:"DEEP_CONDITIONAL_SCENARIOS",
  causal_hypotheses:d.drivers,
  scenarios:d.scenarios.map((hypothesis,i)=>({
   scenario_id:"S"+(i+1),hypothesis,occurrence_probability:null,
   status:"CONDITIONAL_NOT_OBSERVED"})),
  exposure_channels:d.exposure,mitigation_options:d.mitigation,
  seven_day_signed_history_verified:false,market_movement_asserted:false};
};
const fail=x=>{throw Error("HOT50_DAILY_GRO_"+x)};
const iso=n=>new Date(n).toISOString();
const day=n=>iso(n).slice(0,10);
const endDay=n=>iso(Date.parse(day(n)+"T00:00:00.000Z")+DAY_MS);
const decode=s=>{
 if(typeof s!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/u.test(s))fail("SIGNATURE_INVALID");
 const result=Uint8Array.from(atob(s),x=>x.charCodeAt(0));
 if(btoa(String.fromCharCode(...result))!==s)fail("SIGNATURE_INVALID");
 return result;
};
const classify=source=>{
 const text=String(source?.derived?.what??"").slice(0,280).toUpperCase();
 const match=Object.keys(EVENT_KINDS).find(x=>new RegExp("\\b"+x.replace("_","[ _]")+"\\b","u").test(text));
 return match??"UNKNOWN";
};
const level=signal=>signal?.corroborated_signed_original===true&&
 signal.original_verified===true?"CORROBORATED_INTERNAL_GRO":
 signal?.original_verified===true?"DUAL_ATTESTED_ORIGINAL":"UNVERIFIED_SIGNAL";
const status=(tier,proof)=>tier==="basic_focused"?
 "NEWS_ANALYSIS_AVAILABLE":tier==="standard"?
 proof==="CORROBORATED_INTERNAL_GRO"?"INTERNAL_CORROBORATED_REVIEW_REQUIRED":
 "EVIDENCE_RECOVERY_REQUIRED":"CONTRACTUAL_COMPLEX_HISTORY_REVIEW_REQUIRED";

export function validateDailyNewsSignal(signal,now=Date.now()){
 if(!Number.isSafeInteger(now)||!isHot50RiskCountry(signal?.country_iso3)||
    !CATEGORIES.has(signal?.category)||!HEX.test(signal?.event_fingerprint??""))
  fail("COUNTRY_CATEGORY_OR_EVENT_INVALID");
 const timestamp=Date.parse(signal.published_at??"");
 if(!Number.isFinite(timestamp)||timestamp>now+60000||day(timestamp)!==day(now))
  fail("NOT_TODAYS_NEWS");
 if(signal.corroborated_signed_original===true&&signal.original_verified!==true)
  fail("CORROBORATION_WITHOUT_ORIGINAL");
 return {...signal,event_class:classify(signal),evidence_status:level(signal)};
}

export async function makeDailyNewsGro(signal,tier,{now=Date.now()}={}){
 if(!Object.hasOwn(TIER_PRICES,tier))fail("TIER_INVALID");
 const s=validateDailyNewsSignal(signal,now);
 const score=EVENT_KINDS[s.event_class]??null;
 const confidence=s.evidence_status==="CORROBORATED_INTERNAL_GRO"?0.85:
  s.evidence_status==="DUAL_ATTESTED_ORIGINAL"?0.55:0.25;
 const state=status(tier,s.evidence_status);
 const payload={
  schema:"geomacro.hot50-news-daily-gro.v1",
  issuer:"GEOMACRO",intelligence_owner:"GEOMACRO",
  country_iso3:s.country_iso3,category:s.category,tier,
  day_utc:day(now),generated_at:iso(now),expires_at:endDay(now),
  event_fingerprint:s.event_fingerprint,event_class:s.event_class,
  evidence_status:s.evidence_status,
  evidence_corroborated:s.evidence_status==="CORROBORATED_INTERNAL_GRO",
  assessment:{
   signal_severity_index_0_100:score,
   index_semantics:"EVENT_CLASS_HEURISTIC_NOT_A_VERIFIED_COUNTRY_RISK_SCORE",
   confidence,signal_interpretation:score===null?
    "A fresh event signal was observed; its specific impact cannot yet be established.":
    "This event class warrants assessment; source confirmation and measured impacts remain separate.",
   market_relevance:MARKET[s.category],watch:WATCH[s.category],
   tier_analysis:depth(tier,s.category,s.evidence_status),
   previous_day_state_used:false,market_price_movement_asserted:false
  },
  tier_status:state,commercial_sale_authorized:false,
  commercial_eligibility:"INDEPENDENT_ISSUER_AND_LICENSE_REVIEW_REQUIRED",
  raw_source_disclosed:false,raw_upstream_text_included:false,
  execution_authorized:false,
  license:{issuer:"GEOMACRO",rights_scope:"ORIGINAL_DERIVED_ASSESSMENT_ONLY",
   onward_redistribution_permitted:false},
  customer_price_usdc:(TIER_PRICES[tier]/100).toFixed(2),
  billable:false
 };
 const groId=await progressiveSha(canonicalProgressiveJson([
  payload.country_iso3,payload.category,payload.day_utc,payload.event_fingerprint,
  tier,payload.evidence_status
 ]));
 return {gro_id:groId,payload};
}

async function verifySaved(row,publicKey,expected=null){
 if(!row||!HEX.test(row.payload_sha256??"")||
  typeof row.payload_json!=="string"||row.payload_json.length>9000||
  await progressiveSha(row.payload_json)!==row.payload_sha256)return false;
 let stored;try{stored=JSON.parse(row.payload_json)}catch{return false}
 if(stored.raw_source_disclosed!==false||stored.raw_upstream_text_included!==false||
  stored.billable!==false||stored.commercial_sale_authorized!==false||
  stored.schema!=="geomacro.hot50-news-daily-gro.v1"||
  canonicalProgressiveJson(stored)!==row.payload_json)return false;
 if(expected&&[
  "country_iso3","category","tier","day_utc","event_fingerprint","evidence_status"
 ].some(k=>stored[k]!==expected[k]))return false;
 try{return await crypto.subtle.verify("Ed25519",publicKey,
  decode(row.signature_b64),new TextEncoder().encode(row.payload_json));
 }catch{return false}
}

/** Replays and retries are immutable and independently signature-readback verified. */
export async function issueDailyNewsGro(env,signal,tier,{now=Date.now()}={}){
 if(!env?.DB?.prepare||!env.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64)
  fail("PROTECTED_BINDINGS_MISSING");
 const {gro_id,payload}=await makeDailyNewsGro(signal,tier,{now});
 const key=await crypto.subtle.importKey("spki",
  decode(env.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64),
  {name:"Ed25519"},false,["verify"]);
 const existing=await env.DB.prepare("SELECT payload_json,payload_sha256,signature_b64 "+
  "FROM risk_stream_daily_news_gro WHERE gro_id=? LIMIT 1").bind(gro_id).first();
 if(existing){
  if(!await verifySaved(existing,key,payload))fail("EXISTING_SIGNATURE_INVALID");
  return {gro_id,status:"IDEMPOTENT_SIGNED_READBACK",evidence_status:payload.evidence_status};
 }
 const signed=await signProgressiveDecision(payload,env);
 const canonical=canonicalProgressiveJson(payload);
 const digest=await progressiveSha(canonical);
 if(digest!==signed.decision_payload_sha256||
  !await crypto.subtle.verify("Ed25519",key,decode(signed.decision_signature_b64),
   new TextEncoder().encode(canonical)))fail("SIGNATURE_MISMATCH");
 await env.DB.prepare("INSERT OR IGNORE INTO risk_stream_daily_news_gro "+
  "(gro_id,country_iso3,category,day_utc,event_fingerprint,tier,evidence_status,"+
  "payload_json,payload_sha256,signature_b64,signing_key_id,generated_at,"+
  "expires_at,commercial_sale_authorized,raw_source_disclosed) "+
  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)").bind(
  gro_id,payload.country_iso3,payload.category,payload.day_utc,
  payload.event_fingerprint,tier,payload.evidence_status,canonical,digest,
  signed.decision_signature_b64,signed.decision_signature_key_id,
  payload.generated_at,payload.expires_at).run();
 const saved=await env.DB.prepare("SELECT payload_json,payload_sha256,signature_b64 "+
  "FROM risk_stream_daily_news_gro WHERE gro_id=? LIMIT 1").bind(gro_id).first();
 if(!await verifySaved(saved,key,payload))fail("D1_SIGNED_READBACK_INVALID");
 return {gro_id,status:"SIGNED_D1_READBACK",evidence_status:payload.evidence_status};
}

/** Existing 1-minute cron and event Queue both call this; no historical events. */
export async function issueDailyNewsBatch(env,signals,{now=Date.now(),limit=12}={}){
 if(!Number.isInteger(limit)||limit<1||limit>24||!Array.isArray(signals))
  fail("BATCH_INVALID");
 if(env?.RISK_STREAM_ACTIVE!=="1"||
  env?.STREAM_INGESTION_ENABLED!=="true"||
  env?.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED!=="1")
  return {status:"NEWS_GRO_AUTOMATION_HELD",signed:0};
 const seen=new Set();let issued=0,existing=0,skipped=0;
 for(const signal of signals.slice(0,limit)){
  let valid;try{valid=validateDailyNewsSignal(signal,now)}
  catch{skipped++;continue}
  const id=[valid.country_iso3,valid.category,
   valid.event_fingerprint,valid.evidence_status].join("|");
  if(seen.has(id))continue;
  seen.add(id);
  for(const tier of TIER_ORDER){
   const receipt=await issueDailyNewsGro(env,valid,tier,{now});
   if(receipt.status==="SIGNED_D1_READBACK")issued++;
   else existing++;
  }
 }
 return {schema:"geomacro.hot50-daily-gro-issuance.v1",
  status:"GRO_SIGNATURE_READBACK_PASS",
  processed_events:seen.size,signed:issued,idempotent:existing,skipped,
  commercial_deliveries_performed:0,raw_sources_disclosed:false};
}

/** Root-admin ONLY; no customer path, payment, source URL or article bytes. */
export async function readDailyNewsGros(request,env,now=Date.now()){
 const noStore={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
 const bad=(error,status=400)=>Response.json({ok:false,error,
  commercial_delivery:false},{status,headers:noStore});
 if(request.method!=="GET")return bad("METHOD_NOT_ALLOWED",405);
 const url=new URL(request.url);
 if([...url.searchParams.keys()].some(x=>
  !["country_iso3","category","tier","limit"].includes(x)))
  return bad("NEWS_GRO_QUERY_INVALID");
 const country=url.searchParams.get("country_iso3");
 const category=url.searchParams.get("category");
 const tier=url.searchParams.get("tier");
 const limitRaw=url.searchParams.get("limit")??"12";
 const limit=Number(limitRaw);
 if(!isHot50RiskCountry(country)||!CATEGORIES.has(category)||
  (tier!==null&&!Object.hasOwn(TIER_PRICES,tier))||
  !/^[1-9][0-9]?$/u.test(limitRaw)||limit>24||
  !env?.DB?.prepare||!env?.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64)
  return bad("NEWS_GRO_QUERY_OR_BINDING_INVALID",503);
 try{
  const verifier=await crypto.subtle.importKey("spki",
   decode(env.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64),
   {name:"Ed25519"},false,["verify"]);
  const expectedKeyId=String(env.RISK_GATE_DECISION_ED25519_KEY_ID??"");
  const sql="SELECT gro_id,payload_json,payload_sha256,signature_b64,signing_key_id "+
   "FROM risk_stream_daily_news_gro WHERE country_iso3=? AND category=? "+
   "AND day_utc=? "+(tier?"AND tier=? ":"")+
   "ORDER BY generated_at DESC,gro_id DESC LIMIT ?";
  const bound=tier?[country,category,day(now),tier,limit]:
   [country,category,day(now),limit];
  const response=await env.DB.prepare(sql).bind(...bound).all();
  if(!Array.isArray(response?.results)||response.results.length>limit)
   return bad("NEWS_GRO_READBACK_INVALID",503);
  const items=[];
  for(const row of response.results){
   const p=JSON.parse(row.payload_json);
   const recomputed=await progressiveSha(canonicalProgressiveJson([
    p.country_iso3,p.category,p.day_utc,p.event_fingerprint,
    p.tier,p.evidence_status
   ]));
   if(row.gro_id!==recomputed||row.signing_key_id!==expectedKeyId||
    p.country_iso3!==country||p.category!==category||
    p.day_utc!==day(now)||(tier!==null&&p.tier!==tier)||
    !await verifySaved(row,verifier))
    return bad("NEWS_GRO_SIGNATURE_OR_SCOPE_INVALID",503);
   items.push({gro_id:row.gro_id,payload:p,
    signature_algorithm:"Ed25519",signature_key_id:row.signing_key_id,
    payload_sha256:row.payload_sha256,signature_b64:row.signature_b64});
  }
  return Response.json({ok:true,schema:"geomacro.hot50-news-gro-owner-readback.v1",
   country_iso3:country,category,day_utc:day(now),
   signed_count:items.length,signature_readback_verified:true,
   commercial_delivery:false,items},{headers:noStore});
 }catch{return bad("NEWS_GRO_PROVIDER_READBACK_UNAVAILABLE",503)}
}

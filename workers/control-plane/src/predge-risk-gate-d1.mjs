/**
 * Predge Risk Gate on existing Cloudflare D1. No Supabase, no x402 charges.
 * Separate purpose-scoped bearer, bounded request, D1 atomic quota, idempotent
 * audit and genuine signed GRO verified against owner-provisioned trust keys.
 */
// Load the canonical TS engine lazily only after signed GRO acceptance.\n// The D1 Worker is also imported by Node ESM ops tests without TS extension resolution.

import {readCachedSignedGro} from "./signed-gro-read-cache.mjs";
import {persistRiskGateAuditReceipt} from "./risk-gate-audit-receipt.mjs";
import {readIntradayFlashOverride,applyIntradayFlashDecision} from "./risk-gate-flash-override.mjs";
import {readProgressiveFacts,progressiveTierMatrix,provisionalRiskGate,sevenDayRollupIsReady,signProgressiveDecision} from "./progressive-risk-gate.mjs";
import {predgePaidRiskGateTerms,usdcFromCents} from "./predge-paid-risk-gate-contract.mjs";

const HASH=/^[a-f0-9]{64}$/;
const ISO3=/^[A-Z]{3}$/;
const KEY_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DRIVER=new Set(["conflict","sanctions","political_instability","trade_policy",
  "monetary_policy","inflation","labor_market","currency_fx","macro_stress",
  "rare_earth_supply","critical_minerals","shipping_logistics","other"]);
const encoder=new TextEncoder();
const MAX_BYTES=65536;
// Compile-time trust pin matches src/lib/risk-object-public-registry.ts.
// An environment variable alone may not authorize a new signing key.
const ACTIVE_KEY_ID="geomacro-risk-2026-03";
const ACTIVE_KEY_SPKI="MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=";
const DEFAULT_AUTHORITY=Object.freeze({key_id:ACTIVE_KEY_ID,public_key_spki_b64:ACTIVE_KEY_SPKI});
const DAY_LIMIT=100;
const HARD_CEILING=500;
const headers={"Cache-Control":"private, no-store","Vary":"Authorization",
 "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function fail(error,status=503,extra={}){
 return Response.json({ok:false,error,channel:"predge_b2b",verdict_id:null,
  tier:null,structure_type:null,customer_price_usdc:"0.00",
  geomacro_fee_usdc:"0.00",billable:false,entry_status:"UNDELIVERED",
  advisory_decision:"PAUSE",execution_authorized:false,...extra},{status,headers});
}
function constantEqual(a,b){
 const left=encoder.encode(String(a??"")),right=encoder.encode(String(b??""));
 if(left.length!==right.length||left.length<32)return false;
 let v=0;for(let i=0;i<left.length;i++)v|=left[i]^right[i];
 return v===0;
}
function keysOnly(obj,allowed){
 return Object.keys(obj).every(k=>allowed.includes(k));
}
function record(v){return v!==null&&typeof v==="object"&&!Array.isArray(v);}
function canonical(v){
 if(v===null||typeof v==="string"||typeof v==="boolean")return JSON.stringify(v);
 if(typeof v==="number"){if(!Number.isFinite(v))throw Error("NONFINITE");return JSON.stringify(v);}
 if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
 if(record(v))return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
 throw Error("NON_JSON");
}
async function digest(text){
 const bytes=await crypto.subtle.digest("SHA-256",encoder.encode(text));
 return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
function b64bytes(v){
 if(typeof v!=="string"||!v||v.length>2048||!/^[A-Za-z0-9+/]+={0,2}$/.test(v))throw Error("INVALID_BASE64");
 const binary=atob(v), bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 let round="";for(const n of bytes)round+=String.fromCharCode(n);
 if(btoa(round)!==v)throw Error("NONCANONICAL_BASE64");
 return bytes;
}
function trustRecord(env,id,generatedAt,authority=DEFAULT_AUTHORITY){
 if(!KEY_ID.test(id)||id!==authority.key_id)return null;
 const protectedRegistry=String(env?.RISK_GATE_VERIFY_KEYS_JSON??"").trim();
 let ent;
 if(!protectedRegistry){
   // The production Ed25519 PUBLIC key is already pinned in reviewed code.
   // Absence of a duplicate secret must not disable genuine verification.
   ent={status:"active",public_key_spki_b64:authority.public_key_spki_b64};
 }else{
   let registry;
   try{registry=JSON.parse(protectedRegistry)}catch{return null;}
   if(!record(registry))return null;
   ent=registry[id];
 }
 if(!record(ent)||ent.status!=="active"||ent.public_key_spki_b64!==authority.public_key_spki_b64)return null;
 const n=Date.parse(generatedAt);
 if(ent.not_before&&n<Date.parse(ent.not_before))return null;
 if(ent.not_after&&n>Date.parse(ent.not_after))return null;
 return ent;
}
export async function verifyHotGRO(row,env,subject,now=Date.now(),authority=DEFAULT_AUTHORITY){
 if(!record(row)||row.archive_write_acknowledged!==1||
     row.schema_version!=="gro-1.1"||!HASH.test(String(row.record_sha256))||
     !HASH.test(String(row.payload_hash))||typeof row.object_json!=="string"||
     encoder.encode(row.object_json).byteLength>MAX_BYTES*8)return null;
 if(await digest(row.object_json)!==row.record_sha256)return null;
 let obj;try{obj=JSON.parse(row.object_json)}catch{return null;}
 if(!record(obj)||obj.schema_version!=="gro-1.1"||
     obj.subject?.type!==subject.type||obj.subject?.id!==subject.id||
     obj.object_id!==row.object_id||obj.generated_at!==row.generated_at||
     obj.expires_at!==row.expires_at||
     obj.issuer!=="Geomacro"||!record(obj.integrity)||
     obj.integrity.payload_hash!==row.payload_hash||
     obj.integrity.signing_key_id!==row.signing_key_id||
     obj.integrity.signature_scheme!=="Ed25519"||
     obj.integrity.canonicalization!=="geomacro-canonical-json-v1"||
     obj.verification?.status!=="VERIFIED"||
     obj.commercial_eligibility?.status!=="VERIFIED"||
     obj.decision_readiness?.status==="UNREADY"||
     !Number.isFinite(obj.risk?.score)||obj.risk.score<0||obj.risk.score>100||
     !Number.isFinite(obj.confidence)||obj.confidence<0||obj.confidence>1||
     !Array.isArray(obj.attribution)||!Array.isArray(obj.evidence)||
     obj.evidence.length===0||obj.evidence_summary?.independent_source_count<1||
     !["country-risk-v0.1.0-pilot","corridor-endpoint-max-v0.1.0-pilot"].includes(obj.methodology_version))
     return null;
 for(const k of ["input_hash","data_hash","calculation_hash","payload_hash"]){
   if(!HASH.test(String(obj.integrity[k]??"")))return null;
 }
 const generated=Date.parse(obj.generated_at),expires=Date.parse(obj.expires_at);
 if(!Number.isFinite(generated)||!Number.isFinite(expires)||
     generated>now+300000||generated>now||expires<=now||
     expires<=generated||expires-generated>3*60*60*1000+300000)return null;
 const ent=trustRecord(env,row.signing_key_id,obj.generated_at,authority);
 if(!ent)return null;
 const signable={...obj,integrity:{...obj.integrity,payload_hash:null,signature:null}};
 const bytes=encoder.encode(canonical(signable));
 if(await digest(new TextDecoder().decode(bytes))!==obj.integrity.payload_hash)return null;
 try{
   const pub=await crypto.subtle.importKey("spki",b64bytes(ent.public_key_spki_b64),
     {name:"Ed25519"},false,["verify"]);
   if(!await crypto.subtle.verify({name:"Ed25519"},pub,
     b64bytes(obj.integrity.signature),bytes))return null;
 }catch{return null;}
 return obj;
}
function finite(v,min,max){return typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;}
export function parseRequest(obj,now=Date.now()){
 if(!record(obj)||!keysOnly(obj,["request_id","country_iso3","subject","policy","evaluated_at","action_context","tier"]))
   return null;
 if(typeof obj.request_id!=="string"||obj.request_id.length<1||obj.request_id.length>256)return null;
 if(!["basic_focused","standard","complex_full"].includes(obj.tier))return null;
 let subject;
 if(obj.subject!==undefined){
   if(obj.country_iso3!==undefined||!record(obj.subject))return null;
   const s=obj.subject;
   if(s.type==="country"&&keysOnly(s,["type","country_iso3"])&&ISO3.test(s.country_iso3))
     subject={type:"country",id:s.country_iso3};
   else if(s.type==="corridor"&&
     keysOnly(s,["type","origin_country_iso3","destination_country_iso3"])&&
     ISO3.test(s.origin_country_iso3)&&ISO3.test(s.destination_country_iso3)&&
     s.origin_country_iso3!==s.destination_country_iso3)
     subject={type:"corridor",id:s.origin_country_iso3+">"+s.destination_country_iso3};
   else return null;
 }else{
   if(!ISO3.test(obj.country_iso3))return null;
   subject={type:"country",id:obj.country_iso3};
 }
 if(obj.evaluated_at!==undefined){
   const t=Date.parse(obj.evaluated_at);
   if(typeof obj.evaluated_at!=="string"||!Number.isFinite(t)||Math.abs(t-now)>300000)return null;
 }
 const p=obj.policy;
 if(!record(p)||!keysOnly(p,["policy_id","policy_version","continue_max_score",
   "reduce_limit_max_score","require_approval_max_score",
   "minimum_confidence_for_auto_continue","require_commercial_verification_for_continue",
   "max_positive_delta_for_auto_continue","hard_stop_driver_contributions"]))return null;
 if(typeof p.policy_id!=="string"||!p.policy_id||p.policy_id.length>256||
    typeof p.policy_version!=="string"||!p.policy_version||p.policy_version.length>128||
    !finite(p.continue_max_score,0,100)||!finite(p.reduce_limit_max_score,0,100)||
    !finite(p.require_approval_max_score,0,100)||
    !(p.continue_max_score<p.reduce_limit_max_score&&p.reduce_limit_max_score<p.require_approval_max_score)||
    !finite(p.minimum_confidence_for_auto_continue,0,1)||
    typeof p.require_commercial_verification_for_continue!=="boolean")return null;
 if(p.max_positive_delta_for_auto_continue!==undefined&&
    !finite(p.max_positive_delta_for_auto_continue,0,100))return null;
 if(p.hard_stop_driver_contributions!==undefined){
   if(!record(p.hard_stop_driver_contributions))return null;
   for(const [k,v] of Object.entries(p.hard_stop_driver_contributions)){
     if(!DRIVER.has(k)||!finite(v,0,100))return null;
   }
 }
 if(obj.action_context!==undefined){
   const a=obj.action_context;
   if(!record(a)||!keysOnly(a,["action_type","amount","currency","destination","metadata"])||
      (a.amount!==undefined&&!finite(a.amount,0,Number.MAX_SAFE_INTEGER))||
      (a.action_type!==undefined&&(typeof a.action_type!=="string"||a.action_type.length>128))||
      (a.currency!==undefined&&(typeof a.currency!=="string"||a.currency.length>32))||
      (a.destination!==undefined&&(typeof a.destination!=="string"||a.destination.length>256))||
      (a.metadata!==undefined&&!record(a.metadata)))return null;
 }
 return {request_id:obj.request_id,subject,policy:p,action_context:obj.action_context,tier:obj.tier};
}
async function deterministicVerdictId(requestHash){
 const digestBytes=new Uint8Array(await crypto.subtle.digest("SHA-256",
   encoder.encode("geomacro:predge-paid-risk-gate-addendum-v2:"+requestHash)));
 digestBytes[6]=(digestBytes[6]&0x0f)|0x50;
 digestBytes[8]=(digestBytes[8]&0x3f)|0x80;
 const hex=Array.from(digestBytes.slice(0,16),x=>x.toString(16).padStart(2,"0")).join("");
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function persistPredgePaidUsage(db,{verdict_id,request_id,tier,request_hash,
 response,entry_status,created_at}){
 const terms=predgePaidRiskGateTerms(tier),billable=entry_status==="DELIVERED";
 const ledger_id=await digest("geomacro:predge-paid-risk-gate-ledger:v2:"+verdict_id);
 const response_sha256=await digest(canonical(response));
 const createdClock=Date.parse(created_at);
 if(!Number.isFinite(createdClock))return false;
 const createdDate=new Date(createdClock);
 const nextMonth=new Date(Date.UTC(createdDate.getUTCFullYear(),createdDate.getUTCMonth()+1,1));
 const nextMonthPrefix=nextMonth.toISOString().slice(0,7);
 const usageReportDueDate=nextMonthPrefix+"-05";
 const settlementDueDate=nextMonthPrefix+"-10";
 try{
  await db.prepare(`INSERT INTO predge_paid_risk_gate_usage_ledger
   (ledger_id,verdict_id,request_id,channel,tier,structure_type,
    customer_price_usdc_cents,contract_geomacro_fee_usdc_cents,
    contract_predge_share_usdc_cents,geomacro_fee_usdc_cents,
    predge_share_usdc_cents,billable,entry_status,request_hash,response_sha256,
    created_at,usage_month,usage_report_due_date,settlement_due_date,
    collection_status,settlement_status)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'UNREPORTED','AWAITING_COLLECTION_REPORT')
   ON CONFLICT(request_id) DO NOTHING`)
    .bind(ledger_id,verdict_id,request_id,"predge_b2b",tier,terms.structure_type,
      terms.customer_price_usdc_cents,terms.geomacro_fee_usdc_cents,
      terms.predge_share_usdc_cents,billable?terms.geomacro_fee_usdc_cents:0,
      billable?terms.predge_share_usdc_cents:0,billable?1:0,entry_status,
      request_hash,response_sha256,created_at,created_at.slice(0,7),
      usageReportDueDate,settlementDueDate).run();
  const saved=await db.prepare(`SELECT verdict_id,request_hash,response_sha256,
      entry_status,billable,geomacro_fee_usdc_cents,
      usage_report_due_date,settlement_due_date
    FROM predge_paid_risk_gate_usage_ledger WHERE request_id=? LIMIT 1`)
    .bind(request_id).first();
  return Boolean(saved&&saved.verdict_id===verdict_id&&
    saved.request_hash===request_hash&&saved.response_sha256===response_sha256&&
    saved.entry_status===entry_status&&saved.billable===(billable?1:0)&&
    saved.geomacro_fee_usdc_cents===(billable?terms.geomacro_fee_usdc_cents:0)&&
    saved.usage_report_due_date===usageReportDueDate&&
    saved.settlement_due_date===settlementDueDate);
 }catch{return false;}
}
async function hotRow(db,subject,now){
 if(subject.type==="country"){
   return db.prepare("SELECT * FROM country_gro_verified_hot WHERE country_iso3=? AND generated_at<=? AND expires_at>? LIMIT 1")
     .bind(subject.id,new Date(now).toISOString(),new Date(now).toISOString()).first();
 }
 return db.prepare("SELECT * FROM corridor_gro_verified_hot WHERE corridor_id=? AND generated_at<=? AND expires_at>? LIMIT 1")
   .bind(subject.id,new Date(now).toISOString(),new Date(now).toISOString()).first();
}
function serviceCredential(request,env){
 const expected=String(env?.PREDGE_RISK_GATE_TOKEN??"");
 if(!HASH.test(expected)||constantEqual(expected,env?.CONTROL_PLANE_TOKEN)||
    constantEqual(expected,env?.PREDGE_RESEARCH_NEWS_TOKEN))
   return {error:"RISK_GATE_CREDENTIAL_NOT_CONFIGURED",status:503};
 const token=request.headers.get("authorization");
 if(typeof token!=="string"||!/^Bearer [a-f0-9]{64}$/.test(token)||
    !constantEqual(token.slice(7),expected))return {error:"RISK_GATE_UNAUTHORIZED",status:401};
 return null;
}
// Production entry passes only request/env/time; HTTP and env cannot choose this pin.
// The optional code-level authority permits isolated signed staging fixtures.
export async function predgeRiskGateD1(request,env,now=Date.now(),authority=DEFAULT_AUTHORITY){
 if(!Number.isSafeInteger(now)||now<0)return fail("RISK_GATE_CLOCK_UNAVAILABLE");
 const auth=serviceCredential(request,env);
 if(auth)return fail(auth.error,auth.status);
 if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
 if(!env?.DB?.prepare)return fail("RISK_GATE_D1_UNAVAILABLE");
 if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
   return fail("UNSUPPORTED_MEDIA_TYPE",415);
 const length=Number(request.headers.get("content-length")??"0");
 if(!Number.isFinite(length)||length>MAX_BYTES)return fail("BODY_TOO_LARGE",413);
 // Bound actual streamed body even when Content-Length is absent or forged.
 let raw="";
 try{
   const reader=request.body?.getReader();
   if(!reader)return fail("INVALID_RISK_GATE_REQUEST",400);
   const chunks=[];let total=0;
   for(;;){
     const {done,value}=await reader.read();
     if(done)break;
     total+=value.byteLength;
     if(total>MAX_BYTES){await reader.cancel();return fail("BODY_TOO_LARGE",413);}
     chunks.push(value);
   }
   const buf=new Uint8Array(total);let offset=0;
   for(const chunk of chunks){buf.set(chunk,offset);offset+=chunk.byteLength;}
   raw=new TextDecoder("utf-8",{fatal:true}).decode(buf);
 }catch{return fail("INVALID_RISK_GATE_REQUEST",400);}
 let body;try{body=JSON.parse(raw)}catch{return fail("INVALID_JSON",400);}
 const parsed=parseRequest(body,now);
 if(!parsed)return fail("INVALID_RISK_GATE_REQUEST",400);
 // Lock the requested commercial tier before any evidence reads. Evidence
 // determines billability; it may never change the requested tier.
 const lockedTier=parsed.tier;
 const lockedTerms=predgePaidRiskGateTerms(lockedTier);
 // Three independent read-only probes. No waiting on a GRO-producing queue,
 // no unsigned object masquerading as a signed GRO, and no unbounded rollup read.
 // D1 schema or transport failure is an infrastructure error, not missing proof.
 let gro,facts,sevenDayRollupReady;
 try{
   [gro,facts,sevenDayRollupReady]=await Promise.all([
     readCachedSignedGro(env,parsed.subject,now,
        ()=>hotRow(env.DB,parsed.subject,now),
        row=>row?verifyHotGRO(row,env,parsed.subject,now,authority):null),
     readProgressiveFacts(env.DB,parsed.subject,now),
     sevenDayRollupIsReady(env,parsed.subject,now),
   ]);
 }catch{return fail("RISK_GATE_D1_UNAVAILABLE",503);}
 const tierActivationMatrix=progressiveTierMatrix(facts,Boolean(gro),sevenDayRollupReady);
 const complexReady=tierActivationMatrix.complex.active===true;
 const standardReady=tierActivationMatrix.standard.active===true;
 const tierReady=lockedTier==="basic_focused"?facts.distinct_events>0:
   lockedTier==="standard"?standardReady:complexReady;
 const channel="predge_b2b";
 const structureType=lockedTerms.structure_type;
 const customerPriceUsdc=usdcFromCents(lockedTerms.customer_price_usdc_cents);
 const contractGeomacroFeeUsdc=usdcFromCents(lockedTerms.geomacro_fee_usdc_cents);
 // Only server-provisioned Predge pilot may call this route. No payment endpoint.
 const requestHash=await digest(canonical(body));
 const verdictId=await deterministicVerdictId(requestHash);
 const nowIso=new Date(now).toISOString();
 const client="predge-risk-gate-v1",day=nowIso.slice(0,10);
 try{
   await env.DB.prepare(`INSERT OR IGNORE INTO risk_gate_d1_requests
     (client_id,request_id,request_hash,subject_type,subject_id,created_at,state)
     VALUES(?,?,?,?,?,?,'PENDING')`)
      .bind(client,parsed.request_id,requestHash,parsed.subject.type,parsed.subject.id,nowIso).run();
   const claim=await env.DB.prepare(`SELECT request_hash,state,response_json
     FROM risk_gate_d1_requests WHERE client_id=? AND request_id=? LIMIT 1`)
      .bind(client,parsed.request_id).first();
   if(!claim)return fail("RISK_GATE_LEDGER_UNAVAILABLE");
   if(claim.request_hash!==requestHash)return fail("RISK_GATE_IDEMPOTENCY_CONFLICT",409);
   if(claim.state==="DONE"&&claim.response_json){
      let saved;
      try{saved=JSON.parse(claim.response_json)}catch{return fail("RISK_GATE_REPLAY_INVALID");}
      if(saved?.ok!==true||saved?.execution_authorized!==false||
         saved?.risk_gate?.execution_authorized!==false||
         !["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"].includes(saved.risk_gate.decision))
        return fail("RISK_GATE_REPLAY_INVALID");
      return Response.json({...saved,idempotent_replay:true},{status:200,headers});
   }
   // PENDING claim must belong to the current request: older claims cannot
   // run concurrently or replay unless already durably finalized.
   const owned=await env.DB.prepare(`UPDATE risk_gate_d1_requests SET state='CLAIMED'
      WHERE client_id=? AND request_id=? AND state='PENDING'
      RETURNING request_id`).bind(client,parsed.request_id).first();
   if(!owned)return fail("RISK_GATE_REQUEST_IN_PROGRESS",409);
   const quota=await env.DB.prepare(`INSERT INTO risk_gate_d1_quota (client_id,usage_day,used)
     VALUES(?,?,1) ON CONFLICT(client_id,usage_day) DO UPDATE SET used=used+1
     WHERE used < ? RETURNING used`).bind(client,day,Math.min(DAY_LIMIT,HARD_CEILING)).first();
   if(!quota)return fail("RISK_GATE_DAILY_LIMIT",429,{daily_limit:DAY_LIMIT});

   let result;
   if(!tierReady){
     result=provisionalRiskGate(parsed,facts,now);
     result={...result,decision:"PAUSE",recommended_action:"BLOCK",
       reason_codes:["INSUFFICIENT_EVIDENCE"],primary_driver:"INSUFFICIENT_EVIDENCE",
       execution_authorized:false};
   }else if(lockedTier==="complex_full"){
     const {evaluateRiskGate}=await import("../../../src/lib/risk-gate-engine.ts");
     result=evaluateRiskGate(parsed,gro,new Date(now));
     const flash=await readIntradayFlashOverride(env.DB,gro,parsed.subject,now);
     applyIntradayFlashDecision(result,flash);
   }else{
     result=provisionalRiskGate(parsed,facts,now);
   }
   if(result.execution_authorized!==false)throw Error("EXECUTION_BOUNDARY");
   const context={
      subject:parsed.subject,source:lockedTier==="complex_full"?"cloudflare-d1-verified-hot":"derived-fact-index",
      verified_signed_gro:lockedTier==="complex_full"&&tierReady,
      commercial_eligible:lockedTier==="complex_full"&&tierReady,
      payment_authorized:false,
      risk_metric_semantics:lockedTier==="complex_full"&&tierReady?"VERIFIED_GRO_RISK_SCORE":result.risk_metric_semantics,
      observation_count:facts.distinct_events,
      latest_observation_clock:facts.latest_event_clock
   };
   const billable=tierReady&&result.reason_codes?.includes("INSUFFICIENT_EVIDENCE")!==true;
   const entryStatus=billable?"DELIVERED":"INSUFFICIENT_EVIDENCE";
   const geomacroFeeUsdc=billable?contractGeomacroFeeUsdc:"0.00";
   // Ed25519 signs the immutable decision and tier matrix. HMAC audit
   // receipts remain separate and are never mislabeled as Ed25519.
   const signedPayload={
     schema:"geomacro.progressive-risk-gate-decision.v1",
     request_hash:requestHash,risk_gate:result,context,
     verdict_id:verdictId,channel,tier:lockedTier,structure_type:structureType,
     customer_price_usdc:customerPriceUsdc,geomacro_fee_usdc:geomacroFeeUsdc,
     predge_share_usdc:billable?"0.05":"0.00",billable,entry_status,
     tier_activation_matrix:tierActivationMatrix,
     execution_authorized:false
   };
   const decisionSignature=await signProgressiveDecision(signedPayload,env);
   const response={ok:true,...signedPayload,
     decision_signed_payload:signedPayload,...decisionSignature};
   const receipt=await persistRiskGateAuditReceipt(env.DB,{
     client_id:client,request_id:parsed.request_id,request_hash:requestHash,env,
     subject_type:parsed.subject.type,subject_id:parsed.subject.id,
     decision:result.decision,policy_id:parsed.policy.policy_id,
     policy_version:parsed.policy.policy_version,evaluated_at:nowIso,response
   });
   response.audit_receipt_hash=receipt.audit_receipt_hash;
   response.audit_receipt_signature=receipt.audit_receipt_signature;
   response.audit_receipt_signature_key_id=receipt.signature_key_id;
   response.audit_receipt_signature_scheme=receipt.signature_scheme;
   response.audit_receipt_signature_scope=receipt.signature_scope;
   if(!await persistPredgePaidUsage(env.DB,{verdict_id:verdictId,
      request_id:parsed.request_id,tier:lockedTier,request_hash:requestHash,
      response,entry_status:entryStatus,created_at:nowIso}))
     return fail("PREDGE_PAID_USAGE_LEDGER_UNAVAILABLE",503);
   const serialized=JSON.stringify(response);
   const audit=await env.DB.prepare(`UPDATE risk_gate_d1_requests
     SET state='DONE',response_json=?,finished_at=?,object_id=?,decision=?
     WHERE client_id=? AND request_id=? AND state='CLAIMED' RETURNING request_id`)
     .bind(serialized,nowIso,gro?.object_id??null,result.decision,client,parsed.request_id).first();
   if(!audit)return fail("RISK_GATE_AUDIT_UNAVAILABLE");
   return Response.json(response,{status:200,headers});
 }catch{return fail("RISK_GATE_D1_UNAVAILABLE",503);}
}

/** Coarse source-safe operational readiness, never a paid-launch verdict. */
export async function predgeRiskGateD1Readiness(env,now=Date.now()){
 const configured=/^[a-f0-9]{64}$/.test(String(env?.PREDGE_RISK_GATE_TOKEN??""))&&
   !constantEqual(env.PREDGE_RISK_GATE_TOKEN,env?.PREDGE_RESEARCH_NEWS_TOKEN)&&
   !constantEqual(env.PREDGE_RISK_GATE_TOKEN,env?.CONTROL_PLANE_TOKEN);
 let d1=false,keys=false,signed=false;
 try{
   if(env?.DB?.prepare){
     await env.DB.prepare("SELECT 1 AS healthy FROM risk_gate_d1_requests LIMIT 1").first();
     d1=true;
     keys=Boolean(trustRecord(env,ACTIVE_KEY_ID,new Date(now).toISOString()));
     if(keys){
       const row=await env.DB.prepare(
         "SELECT * FROM country_gro_verified_hot WHERE generated_at<=? AND expires_at>? ORDER BY verified_at DESC LIMIT 1"
       ).bind(new Date(now).toISOString(),new Date(now).toISOString()).first();
       if(row&&ISO3.test(row.country_iso3)){
         const obj=await verifyHotGRO(row,env,{type:"country",id:row.country_iso3},now);
         signed=Boolean(obj);
       }
     }
   }
 }catch{d1=false;keys=false;signed=false;}
 const signerConfigured=/^[A-Za-z0-9._:-]{4,120}$/.test(String(env?.RISK_GATE_DECISION_ED25519_KEY_ID??""))&&
   String(env?.RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64??"").length>=40&&
   String(env?.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"").length>=40;
 const ready=Boolean(configured&&d1&&signerConfigured);
 return Response.json({
   status:ready?"ready":"not_ready",
   checked_at:new Date(now).toISOString(),
   authority:"cloudflare-d1",
   scope:"predge-risk-gate-country-v1",
   checks:{database:d1,audit_store:d1,isolated_partner_credential:configured,
      active_pinned_verification_key:keys,
      fresh_verified_commercial_country_gro:signed,
      progressive_decision_ed25519_signer_configured:signerConfigured},
   // readiness is not partner-market proof, rights to onward redistribute, or paid approval.
   paid_launch_approved:false,execution_authorized:false
 },{status:ready?200:503,headers:{"Cache-Control":"public, max-age=60",
 "X-Content-Type-Options":"nosniff"}});
}

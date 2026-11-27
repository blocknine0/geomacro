import {generateProgressiveRiskGateDecision,readProgressiveFacts,
 signProgressiveDecision,sevenDayRollupIsReady} from "./progressive-risk-gate.mjs";
import {parseRequest,verifyHotGRO} from "./predge-risk-gate-d1.mjs";
import {STORE_RISK_GATE_PRICE_CENTS} from "./store-risk-gate.mjs";
import {resignExpiredRiskStreamGro} from "./risk-stream-gro-resigner.mjs";
import {verifyHot50SignedGroReadbacks} from "./risk-stream-autonomous-hot50.mjs";

const headers={"Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff",
 "Vary":"Authorization"};
const json=(body,status)=>Response.json(body,{status,headers});
const VALID_NETWORKS=new Set(["base","polygon","arc"]);
const TX_RE=/^0x[0-9a-fA-F]{64}$/;

function validLedgerAuth(request,env){
 const token=String(env?.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
 if(token.length<32)return false;
 const auth=request.headers.get("authorization")??"";
 return auth===`Bearer ${token}`;
}

async function signedGroForStoreUsdc(db,env,subject,now){
 const at=new Date(now).toISOString();
 const sql=subject.type==="country"
  ?"SELECT * FROM country_gro_verified_hot WHERE country_iso3=? AND generated_at<=? AND expires_at>? LIMIT 1"
  :"SELECT * FROM corridor_gro_verified_hot WHERE corridor_id=? AND generated_at<=? AND expires_at>? LIMIT 1";
 const row=await db.prepare(sql).bind(subject.id,at,at).first();
 return row?verifyHotGRO(row,env,subject,now):null;
}
const STREAM_CATEGORY=Object.freeze({geopolitics:"GEOPOLITICS",macro:"MACRO_FX",
 critical_minerals:"CRITICAL_MINERALS"});
async function currentStreamGroForStoreUsdc(db,env,subject,category,now){
 if(subject.type!=="country"||!STREAM_CATEGORY[category])return null;
 const active=await db.prepare("SELECT gro_id,country_iso3,category,event_fingerprint,"+
  "expires_at,payload_json,payload_sha256,signature_b64,created_at "+
  "FROM risk_stream_signed_gro WHERE country_iso3=? AND category=? "+
  "AND expires_at>? ORDER BY created_at DESC LIMIT 1")
  .bind(subject.id,STREAM_CATEGORY[category],new Date(now).toISOString()).first();
 if(active){
  try{
   const verified=await verifyHot50SignedGroReadbacks([active],env,now);
   if(verified[0])return verified[0];
  }catch{}
 }
 return reissuedStreamGroForStoreUsdc(db,env,subject,category,now);
}
async function reissuedStreamGroForStoreUsdc(db,env,subject,category,now){
 if(subject.type!=="country"||!STREAM_CATEGORY[category])return null;
 const row=await db.prepare("SELECT gro_id,country_iso3,category,event_fingerprint,"+
  "expires_at,payload_json,payload_sha256,signature_b64,created_at "+
  "FROM risk_stream_signed_gro WHERE country_iso3=? AND category=? "+
  "AND expires_at<=? AND created_at>=? ORDER BY created_at DESC LIMIT 1")
  .bind(subject.id,STREAM_CATEGORY[category],new Date(now).toISOString(),
   new Date(now-72*3600000).toISOString()).first();
 if(!row)return null;
 try{
  const refreshed=await resignExpiredRiskStreamGro(env,row.gro_id,{now,row});
  const verified=await verifyHot50SignedGroReadbacks([refreshed.row],env,now);
  return verified[0]??null;
 }catch{return null;}
}

export async function storeRiskGateUsdcD1(request,env,now=Date.now()){
 if(request.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 if(!validLedgerAuth(request,env))return json({ok:false,error:"USDC_LEDGER_UNAUTHORIZED"},401);
 if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
  return json({ok:false,error:"UNSUPPORTED_MEDIA_TYPE"},415);
 let body;try{body=await request.json()}catch{return json({ok:false,error:"INVALID_JSON"},400);}
 const {network:_n,tx_hash:_t,amount_atomic:_a,payer:_p,...gateBody}=body&&typeof body==="object"&&!Array.isArray(body)?body:{};
 const parsed=parseRequest(gateBody,now);
 if(!parsed)return json({ok:false,error:"INVALID_RISK_GATE_REQUEST"},400);
 if(!parsed.category)return json({ok:false,error:"STORE_CATEGORY_REQUIRED"},400);
 const network=String(body?.network??"").trim().toLowerCase();
 const txHash=String(body?.tx_hash??"").trim().toLowerCase();
 const amountAtomic=String(body?.amount_atomic??"").trim();
 const payer=body?.payer?String(body.payer).trim().toLowerCase():null;
 if(!VALID_NETWORKS.has(network)||!TX_RE.test(txHash)||!/^[1-9][0-9]*$/.test(amountAtomic))
  return json({ok:false,error:"INVALID_USDC_RECEIPT_BINDING"},400);

let facts,decision,streamGro=null,legacyGro=null;
 try{
  facts=await readProgressiveFacts(env.DB,parsed.subject,now,parsed.category);
  const [foundStreamGro,foundLegacyGro,history]=await Promise.all([
   currentStreamGroForStoreUsdc(env.DB,env,parsed.subject,parsed.category,now),
   parsed.tier==="complex_full"?signedGroForStoreUsdc(env.DB,env,parsed.subject,now):Promise.resolve(null),
   parsed.tier==="complex_full"?sevenDayRollupIsReady(env,parsed.subject,now):Promise.resolve(false)
  ]);
  streamGro=foundStreamGro;
  legacyGro=foundLegacyGro;
  const streamCorroborated=Number(streamGro?.payload?.evidence_and_confidence?.corroborated_originals??0)>=2;
  const effectiveFacts=streamCorroborated&&!facts.standard_ready
   ?{...facts,standard_ready:true,corroboration_sources_count:Math.max(2,Number(facts.corroboration_sources_count??0))}
   :facts;
  decision=generateProgressiveRiskGateDecision(parsed,effectiveFacts,parsed.tier,
   Boolean(legacyGro||streamGro),history,now,Boolean(streamGro));
 }catch{return json({ok:false,error:"RISK_GATE_FACTS_UNAVAILABLE"},503);}

 const chargeable=decision.tierReady===true;
 const chargeCents=chargeable?STORE_RISK_GATE_PRICE_CENTS[parsed.tier]:0;
 const groScore=streamGro?.payload?.eligible_derived_score;
 const analystBrief=groScore?.analyst_brief??{
  risk_mechanism:"Elevated "+parsed.category+" event density in "+parsed.subject.id+" ("+decision.result.observation_count+" recent observations; primary driver: "+decision.result.primary_driver+").",
  watch_triggers:["Monitor official central bank, customs, and sanctions notices for "+parsed.subject.id,"Re-check if score crosses 55 (REDUCE_LIMIT) or 75 (PAUSE)"],
  raw_source_redacted:true,
  licensed_source_text_included:false
 };
 const decisionGuidance={
  summary:decision.result.recommended_action+" | score "+decision.result.severity_score+"/100 ("+decision.result.risk.label+") | driver: "+decision.result.primary_driver,
  exposure_cap_ratio:decision.result.suggested_mitigation.exposure_cap_ratio,
  settlement_delay_hours:decision.result.suggested_mitigation.settlement_delay_hours,
  verified_gro_attached:Boolean(streamGro?.gro_id??legacyGro?.object_id)
 };
 const payload={schema:"geomacro.progressive-risk-gate-decision.v1",
  issuer:"Geomacro",commercial_signatory:"Geomacro",
  source_origin_agnostic_commercial_seal:true,request_id:parsed.request_id,
  source_gro_id:streamGro?.gro_id??legacyGro?.object_id??null,
  risk_gate:decision.result,analyst_brief:analystBrief,decision_guidance:decisionGuidance,
  tier:parsed.tier,billing_mode:"GEOMACRO_DIRECT_USDC_PAY_PER_CALL",
  charge_usdc:(chargeCents/100).toFixed(2),charge_cents:chargeCents,
  credit_equivalent:chargeable?chargeCents:0,
  billable:chargeable,resale_permitted:false,execution_authorized:false,
  entry_status:chargeable?"DELIVERED":"INSUFFICIENT_EVIDENCE",
  ...(chargeable?{}:{entry_status:"INSUFFICIENT_EVIDENCE",charge_usdc:"0.00"})};
 let signature;try{signature=await signProgressiveDecision(payload,env)}
 catch{return json({ok:false,error:"RISK_GATE_DECISION_SIGNER_UNAVAILABLE"},503);}

 if(chargeable){
  const nowIso=new Date(now).toISOString();
  try{
   await env.DB.prepare(`CREATE TABLE IF NOT EXISTS usdc_pay_per_call_receipts (
    network TEXT NOT NULL, tx_hash TEXT NOT NULL, request_id TEXT NOT NULL,
    tier TEXT NOT NULL, amount_atomic TEXT NOT NULL, payer TEXT,
    occurred_at TEXT NOT NULL, PRIMARY KEY (network, tx_hash))`).run();
   await env.DB.prepare(`INSERT INTO usdc_pay_per_call_receipts
    (network,tx_hash,request_id,tier,amount_atomic,payer,occurred_at)
    VALUES(?,?,?,?,?,?,?)`).bind(network,txHash,parsed.request_id,parsed.tier,
      amountAtomic,payer,nowIso).run();
  }catch(error){
   const msg=String(error?.message??"");
   if(msg.includes("UNIQUE")||msg.includes("PRIMARY KEY"))
    return json({ok:false,error:"USDC_TX_ALREADY_USED"},409);
   return json({ok:false,error:"USDC_RECEIPT_PERSIST_FAILED"},503);
  }
 }
 return json({ok:true,...payload,decision_signed_payload:payload,...signature},200);
}

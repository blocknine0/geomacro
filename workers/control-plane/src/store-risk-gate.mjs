import {generateProgressiveRiskGateDecision,readProgressiveFacts,
 signProgressiveDecision} from "./progressive-risk-gate.mjs";
import {parseRequest} from "./predge-risk-gate-d1.mjs";
import {verifyHotGRO} from "./predge-risk-gate-d1.mjs";
import {customerPaidKeyDigest} from "./customer-paid-ledger.mjs";
import {sevenDayRollupIsReady} from "./progressive-risk-gate.mjs";

const headers={"Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff",
 "Vary":"Authorization"};
const json=(body,status)=>Response.json(body,{status,headers});
export const STORE_RISK_GATE_PRICE_CENTS=Object.freeze({basic_focused:15,standard:20,complex_full:30});
const tokenPattern=/^gmk_live_[0-9a-f]{64}$/;
export function storePaidCheckoutLocked(){
 return json({ok:false,error:"STORE_PAID_CHECKOUT_LOCKED",
  execution_authorized:false,chargeable:false},403);
}
export function generateStoreProgressiveDecision(parsed,facts,tier,
 signedGroReady=false,sevenDayRollupReady=false,now=Date.now()){
 return generateProgressiveRiskGateDecision(parsed,facts,tier,
  signedGroReady,sevenDayRollupReady,now);
}
async function signedGroForStore(db,env,subject,now){
 const at=new Date(now).toISOString();
 const sql=subject.type==="country"
  ?"SELECT * FROM country_gro_verified_hot WHERE country_iso3=? AND generated_at<=? AND expires_at>? LIMIT 1"
  :"SELECT * FROM corridor_gro_verified_hot WHERE corridor_id=? AND generated_at<=? AND expires_at>? LIMIT 1";
 const row=await db.prepare(sql).bind(subject.id,at,at).first();
 return row?verifyHotGRO(row,env,subject,now):null;
}
async function authorizeStoreCustomer(request,env,nowIso){
 const auth=request.headers.get("authorization")??"";
 const key=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!tokenPattern.test(key))return {error:"CUSTOMER_PAID_API_KEY_REQUIRED",status:401};
 let digest;try{digest=await customerPaidKeyDigest(env,key)}
 catch{return {error:"CUSTOMER_PAID_CREDENTIAL_PEPPER_REQUIRED",status:503};}
 try{
  const row=await env.DB.prepare(`SELECT k.key_id,k.user_id,k.scopes_json,g.grant_id,
      g.tier AS grant_tier,g.expires_at,p.receipt_id,p.amount_minor_units
    FROM api_keys k JOIN users u ON u.id=k.user_id
    JOIN customer_entitlement_grants g ON g.user_id=k.user_id
    JOIN customer_payment_receipts p ON p.receipt_id=g.receipt_id AND p.user_id=g.user_id
    WHERE k.hmac_sha256=? AND k.revoked_at IS NULL AND k.expires_at>?
      AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND g.status='active' AND g.starts_at<=? AND g.expires_at>?
      AND p.verified_at<=? AND NOT EXISTS(SELECT 1 FROM credit_ledger l
        WHERE l.receipt_id=p.receipt_id AND l.event_type='reversal')
    ORDER BY g.expires_at ASC LIMIT 1`).bind(digest,nowIso,nowIso,nowIso,nowIso).first();
  if(!row)return {error:"CUSTOMER_PAID_ACTIVE_RECHARGE_REQUIRED",status:403};
  let scopes;try{scopes=JSON.parse(row.scopes_json)}catch{return {error:"CUSTOMER_PAID_KEY_SCOPE_INVALID",status:503};}
  if(!Array.isArray(scopes)||!scopes.includes("risk-gate:read"))
    return {error:"CUSTOMER_PAID_SCOPE_DENIED",status:403};
  return row;
 }catch{return {error:"CUSTOMER_PAID_LEDGER_UNAVAILABLE",status:503};}
}
/**
 * Customer Store delivery has an independent receipt-backed cents ledger.
 * Checkout is disabled unless explicitly enabled; it never touches Predge
 * credentials, quota, or usage ledgers and never authorizes execution/resale.
 */
export async function storeRiskGateD1(request,env,now=Date.now()){
 if(request.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 if(env?.GEOMACRO_STORE_CHECKOUT_ENABLED!=="YES")return storePaidCheckoutLocked();
 if(!env?.DB?.prepare)return json({ok:false,error:"CUSTOMER_PAID_LEDGER_UNAVAILABLE"},503);
 const nowIso=new Date(now).toISOString();
 const customer=await authorizeStoreCustomer(request,env,nowIso);
 if(customer?.error)return json({ok:false,error:customer.error},customer.status);
 if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
  return json({ok:false,error:"UNSUPPORTED_MEDIA_TYPE"},415);
 let body;try{body=await request.json()}catch{return json({ok:false,error:"INVALID_JSON"},400);}
 const parsed=parseRequest(body,now);
 if(!parsed)return json({ok:false,error:"INVALID_RISK_GATE_REQUEST"},400);
 if(!parsed.category)return json({ok:false,error:"STORE_CATEGORY_REQUIRED"},400);
 let facts,decision;
 try{
  facts=await readProgressiveFacts(env.DB,parsed.subject,now,parsed.category);
  let gro=null,history=false;
  if(parsed.tier==="complex_full"){
   [gro,history]=await Promise.all([
    signedGroForStore(env.DB,env,parsed.subject,now),
    sevenDayRollupIsReady(env,parsed.subject,now)
   ]);
  }
  decision=generateStoreProgressiveDecision(parsed,facts,parsed.tier,Boolean(gro),history,now);
 }catch{return json({ok:false,error:"RISK_GATE_FACTS_UNAVAILABLE"},503);}
 const chargeable=decision.tierReady===true;
 const chargeCents=chargeable?STORE_RISK_GATE_PRICE_CENTS[parsed.tier]:0;
 const result=decision.result;
 const payload={schema:"geomacro.progressive-risk-gate-decision.v1",
  issuer:"Geomacro",commercial_signatory:"Geomacro",
  source_origin_agnostic_commercial_seal:true,request_id:parsed.request_id,
  risk_gate:result,tier:parsed.tier,billing_mode:"GEOMACRO_STORE_MONTHLY_RECHARGE",
  charge_usdc:(chargeCents/100).toFixed(2),charge_cents:chargeCents,
  billable:chargeable,resale_permitted:false,execution_authorized:false,
  entry_status:chargeable?"DELIVERED":"INSUFFICIENT_EVIDENCE",
  ...(chargeable?{}:{entry_status:"INSUFFICIENT_EVIDENCE",charge_usdc:"0.00"})};
 let signature;try{signature=await signProgressiveDecision(payload,env)}
 catch{return json({ok:false,error:"RISK_GATE_DECISION_SIGNER_UNAVAILABLE"},503);}
 if(chargeable){
  try{
   await env.DB.prepare(`INSERT INTO customer_store_risk_gate_usage
    (user_id,request_id,key_id,grant_id,receipt_id,tier,charge_cents,occurred_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(customer.user_id,parsed.request_id,customer.key_id,
      customer.grant_id,customer.receipt_id,parsed.tier,chargeCents,nowIso).run();
  }catch(error){
   const msg=String(error?.message??"");
   if(msg.includes("INSUFFICIENT_RECHARGE_BALANCE"))
    return json({ok:false,error:"INSUFFICIENT_RECHARGE_BALANCE"},402);
   if(msg.includes("UNIQUE")||msg.includes("PRIMARY KEY"))
    return json({ok:false,error:"STORE_RISK_GATE_REQUEST_ALREADY_USED"},409);
   return json({ok:false,error:"STORE_RISK_GATE_DEBIT_REJECTED"},403);
  }
 }
 return json({ok:true,...payload,decision_signed_payload:payload,...signature},200);
}

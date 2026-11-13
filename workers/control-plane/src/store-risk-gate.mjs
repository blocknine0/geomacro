import {generateProgressiveRiskGateDecision,signProgressiveDecision} from "./progressive-risk-gate.mjs";
import {readRiskGateEvidence,generateRequestRiskGateDecision,parseRequest} from "./predge-risk-gate-d1.mjs";
import {authenticateCanonicalCustomerPaid,consumeCanonicalCustomerPaid,
 CustomerPaidError,CUSTOMER_RISK_GATE_USAGE_CREDITS,
 CUSTOMER_RISK_GATE_PRICE_USD_CENTS} from "./customer-paid-ledger.mjs";
import {persistRiskGateAuditReceipt} from "./risk-gate-audit-receipt.mjs";

const REQUEST_ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/;
const CAPABILITY=Object.freeze({basic_focused:"risk_gate_basic_focused",
 standard:"risk_gate_standard",complex_full:"risk_gate_complex_full"});
const json=(body,status)=>Response.json(body,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Vary":"Authorization","Referrer-Policy":"no-referrer"
}});
const lock=()=>json({ok:false,error:"STORE_PAID_CHECKOUT_LOCKED",
 execution_authorized:false,chargeable:false,resale_permitted:false},403);
const errorResponse=error=>{
 if(error instanceof CustomerPaidError){
  const code=error.code==="CUSTOMER_PAID_INSUFFICIENT_CREDITS"?
   "INSUFFICIENT_RECHARGE_BALANCE":error.code;
  return json({ok:false,error:code,execution_authorized:false,chargeable:false},
   code==="INSUFFICIENT_RECHARGE_BALANCE"?402:error.status);
 }
 return json({ok:false,error:"STORE_RISK_GATE_UNAVAILABLE",execution_authorized:false,
  chargeable:false},503);
};

/** Same progressive facts engine as Predge; this adapter owns Store auth and billing only. */
export function generateStoreProgressiveDecision(parsed,facts,tier,
 signedGroReady=false,sevenDayRollupReady=false,now=Date.now()){
 return generateProgressiveRiskGateDecision(parsed,facts,tier,
  signedGroReady,sevenDayRollupReady,now);
}

export async function storeRiskGateD1(request,env,now=Date.now(),evidenceReader=readRiskGateEvidence,decisionBuilder=generateRequestRiskGateDecision){
 if(request.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 if(env?.GEOMACRO_STORE_CHECKOUT_ENABLED!=="YES")return lock();
 if(!env?.DB?.prepare)return json({ok:false,error:"CUSTOMER_PAID_D1_UNAVAILABLE"},503);
 const authorization=request.headers.get("authorization")??"";
 if(!authorization.startsWith("Bearer "))return json({ok:false,error:"CUSTOMER_PAID_API_KEY_REQUIRED"},401);
 if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
  return json({ok:false,error:"UNSUPPORTED_MEDIA_TYPE"},415);
 let raw,body;
 try{
  raw=await request.text();
  if(new TextEncoder().encode(raw).length>65536)return json({ok:false,error:"BODY_TOO_LARGE"},413);
  body=JSON.parse(raw);
 }catch{return json({ok:false,error:"INVALID_JSON"},400);}
 const parsed=parseRequest(body,now);
 if(!parsed)return json({ok:false,error:"INVALID_RISK_GATE_REQUEST"},400);
 if(!REQUEST_ID.test(parsed.request_id))return json({ok:false,error:"IDEMPOTENCY_KEY_REQUIRED"},400);
 const capability=CAPABILITY[parsed.tier];
 if(!capability)return json({ok:false,error:"INVALID_RISK_GATE_TIER"},400);
 const apiKey=authorization.slice(7);
 let principal;
 try{principal=await authenticateCanonicalCustomerPaid(env.DB,env,apiKey,capability);}
 catch(error){return errorResponse(error);}
 let evidence,decision;
 try{
  evidence=await evidenceReader(env,parsed,now);
  decision=await decisionBuilder(parsed,evidence,now);
 }catch{return json({ok:false,error:"RISK_GATE_D1_UNAVAILABLE"},503);}
 const result=decision.result,tierReady=decision.tierReady===true;
 const priceCents=tierReady?CUSTOMER_RISK_GATE_PRICE_USD_CENTS[parsed.tier]:0;
 const creditCost=tierReady?CUSTOMER_RISK_GATE_USAGE_CREDITS[parsed.tier]:0;
 const createdAt=new Date(now).toISOString();
 const requestHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
 const requestHashHex=Array.from(new Uint8Array(requestHash),x=>x.toString(16).padStart(2,"0")).join("");
 const signedPayload={schema:"geomacro.store.risk-gate-decision.v1",
  issuer:"Geomacro",commercial_signatory:"Geomacro",
  source_origin_agnostic_commercial_seal:true,
  request_id:parsed.request_id,request_hash:requestHashHex,
  risk_gate:result,subject:parsed.subject,tier:parsed.tier,
  billing_mode:"MONTHLY_PREPAID_CREDITS",credit_cost:creditCost,
  price_usd_cents:priceCents,customer_price_usd:(priceCents/100).toFixed(2),
  geomacro_fee_usd_cents:priceCents,geomacro_fee_usd:(priceCents/100).toFixed(2),
  predge_share_usd_cents:0,predge_share_usd:"0.00",
  billable:tierReady,entry_status:tierReady?"DELIVERED":"INSUFFICIENT_EVIDENCE",
  license_scope:{licensee:"customer",max_uses:1,resale_permitted:false},
  source_rights_verified:false,commercial_eligible:false,
  tier_activation_matrix:decision.tierActivationMatrix,
  execution_authorized:false,created_at:createdAt};
 let signature;
 try{signature=await signProgressiveDecision(signedPayload,env);}
 catch{return json({ok:false,error:"RISK_GATE_DECISION_SIGNER_UNAVAILABLE"},503);}
 const response={ok:true,...signedPayload,decision_signed_payload:signedPayload,
  resale_permitted:false,...signature};
 try{
  const receipt=await persistRiskGateAuditReceipt(env.DB,{
   client_id:"geomacro-store-risk-gate:"+principal.key_id,request_id:parsed.request_id,
   request_hash:requestHashHex,subject_type:parsed.subject.type,subject_id:parsed.subject.id,
   decision:result.decision,policy_id:parsed.policy.policy_id,
   policy_version:parsed.policy.policy_version,evaluated_at:createdAt,response,env
  });
  response.audit_receipt_hash=receipt.audit_receipt_hash;
  response.audit_receipt_signature=receipt.audit_receipt_signature;
  response.audit_receipt_signature_key_id=receipt.signature_key_id;
  response.audit_receipt_signature_scheme=receipt.signature_scheme;
  response.audit_receipt_signature_scope=receipt.signature_scope;
 }catch{return json({ok:false,error:"RISK_GATE_AUDIT_UNAVAILABLE"},503);}
 if(tierReady){
  try{await consumeCanonicalCustomerPaid(env.DB,env,{apiKey,capability,requestId:parsed.request_id});}
  catch(error){return errorResponse(error);}
 }
 return json(response,200);
}

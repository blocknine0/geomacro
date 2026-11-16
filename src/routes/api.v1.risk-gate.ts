import {createHash,createPublicKey,verify as edVerify} from "node:crypto";
import {createFileRoute} from "@tanstack/react-router";
import {canonicalRiskObjectJson} from "../lib/risk-object-signing.server";
import {fetchWithoutRedirect} from "../lib/fetch-without-redirect";
import {GEOMACRO_RISK_GATE_CREDIT_COSTS} from "../lib/credit-metering-policy.mjs";

const FALLBACK="https://geomacro-control-plane.daspallab202391.workers.dev";
const HEADERS={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  "Vary":"Authorization","Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, Authorization"};
const CATEGORIES={
  GEOPOLITICS:"geopolitics",geopolitics:"geopolitics",
  MACRO_FX:"macro_fx","macro-fx":"macro_fx",macro_fx:"macro_fx",
  CRITICAL_MINERALS:"critical_minerals","critical-minerals":"critical_minerals",
  critical_minerals:"critical_minerals",
} as const;
const TIERS=new Set(["basic_focused","standard","complex_full"]);
const PRICE_BY_TIER={basic_focused:"0.15",standard:"0.20",complex_full:"0.30"} as const;
const TIER_ALIASES={BASIC:"basic_focused",STANDARD:"standard",COMPLEX:"complex_full"} as const;
const DEFAULT_POLICY={policy_id:"geomacro-direct-risk-gate-default",policy_version:"v1",
  continue_max_score:35,reduce_limit_max_score:55,require_approval_max_score:75,
  minimum_confidence_for_auto_continue:0.8,require_commercial_verification_for_continue:true,
  max_positive_delta_for_auto_continue:5};
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const bad=(error:string,status:number)=>Response.json({ok:false,error,
  execution_authorized:false,chargeable:false},{status,headers:HEADERS});

function validateSignedStoreDecision(value:Record<string,unknown>,keySpki:string,keyId:string){
  const payload=value.decision_signed_payload;
  if(!isRecord(payload)||value.ok!==true||value.execution_authorized!==false||
    value.decision_signature_scheme!=="Ed25519"||
    value.decision_signature_scope!=="geomacro.progressive-risk-gate-decision.v1"||
    value.decision_signature_key_id!==keyId||
    typeof value.decision_signature_b64!=="string"||
    !/^[A-Za-z0-9+/]{86}==$/.test(value.decision_signature_b64)||
    typeof value.decision_payload_sha256!=="string"||
    !/^[a-f0-9]{64}$/.test(value.decision_payload_sha256)||
    payload.schema!=="geomacro.progressive-risk-gate-decision.v1"||
    payload.execution_authorized!==false||payload.tier!==value.tier||
    payload.billable!==value.billable||payload.entry_status!==value.entry_status||
    payload.credit_equivalent!==value.credit_equivalent||
    payload.billing_mode!==value.billing_mode||payload.charge_usdc!==value.charge_usdc)return false;
  const tier=String(value.tier) as keyof typeof PRICE_BY_TIER;
  if(!Object.hasOwn(PRICE_BY_TIER,tier))return false;
  if(value.billable===true&&(value.entry_status!=="DELIVERED"||value.charge_usdc!==PRICE_BY_TIER[tier]))return false;
  if(value.billable===true&&value.credit_equivalent!==GEOMACRO_RISK_GATE_CREDIT_COSTS[tier])return false;
  if(value.billable===false&&(value.entry_status!=="INSUFFICIENT_EVIDENCE"||value.charge_usdc!=="0.00"||value.credit_equivalent!==0))return false;
  try{
    const canonical=canonicalRiskObjectJson(payload);
    if(createHash("sha256").update(canonical,"utf8").digest("hex")!==value.decision_payload_sha256)return false;
    const key=createPublicKey({key:Buffer.from(keySpki,"base64"),format:"der",type:"spki"});
    return key.asymmetricKeyType==="ed25519"&&edVerify(null,Buffer.from(canonical),key,
      Buffer.from(value.decision_signature_b64,"base64"));
  }catch{return false;}
}

async function resolveDecisionKey(origin:string,fetcher:typeof fetchWithoutRedirect){
  const pinned=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
  if(pinned)return {key:pinned,id:String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_KEY_ID??"")};
  const response=await fetcher(origin+"/v1/public/risk-gate-decision-key",{
    method:"GET",redirect:"manual",headers:{accept:"application/json"},signal:AbortSignal.timeout(2000)});
  if(response.status!==200||response.redirected)throw Error("RISK_GATE_DECISION_KEY_UNAVAILABLE");
  const value=await response.json() as Record<string,unknown>;
  if(value.ok!==true||value.schema!=="geomacro.risk-gate-decision-key.v1"||value.scheme!=="Ed25519"||
    typeof value.key_id!=="string"||typeof value.public_key_spki_b64!=="string")
    throw Error("RISK_GATE_DECISION_KEY_INVALID");
  return {key:value.public_key_spki_b64,id:value.key_id};
}

export async function forwardDirectRiskGate(request:Request,
  fetcher:typeof fetchWithoutRedirect=fetchWithoutRedirect):Promise<Response>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
  if(request.method!=="POST")return bad("METHOD_NOT_ALLOWED",405);
  if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
    return bad("UNSUPPORTED_MEDIA_TYPE",415);
  let text:string;
  try{text=await request.text()}catch{return bad("BODY_UNREADABLE",400);}
  if(new TextEncoder().encode(text).byteLength>16*1024)return bad("BODY_TOO_LARGE",413);
  let body:unknown;try{body=JSON.parse(text)}catch{return bad("INVALID_JSON",400);}
  if(!isRecord(body)||Object.keys(body).some(k=>![
    "mode","request_id","category","country_iso3","tier","policy","evaluated_at","action_context",
  ].includes(k)))return bad("INVALID_RISK_GATE_REQUEST",400);
  const category=typeof body.category==="string"?CATEGORIES[body.category as keyof typeof CATEGORIES]:undefined;
  const tier=typeof body.tier==="string"?
    (TIER_ALIASES[body.tier as keyof typeof TIER_ALIASES]??body.tier):undefined;
  const countryIso3=typeof body.country_iso3==="string"?body.country_iso3.trim().toUpperCase():"";
  if(!category||!/^[A-Z]{3}$/.test(countryIso3)||
    typeof tier!=="string"||!TIERS.has(tier))return bad("INVALID_RISK_GATE_REQUEST",400);
  if(body.mode!==undefined&&body.mode!=="prepare")return bad("INVALID_RISK_GATE_REQUEST",400);
  if(body.mode==="prepare"){
    if(Object.keys(body).some(k=>!["mode","category","country_iso3","tier"].includes(k)))
      return bad("INVALID_RISK_GATE_PREPARATION",400);
    const canonicalTier=tier as keyof typeof GEOMACRO_RISK_GATE_CREDIT_COSTS;
    return Response.json({ok:true,status:"REQUEST_SHAPE_VALID_NO_CHARGE",
      method:"POST",endpoint:"/api/v1/risk-gate",category,country_iso3:countryIso3,
      tier:canonicalTier,price_usdc:PRICE_BY_TIER[canonicalTier],
      credit_equivalent:GEOMACRO_RISK_GATE_CREDIT_COSTS[canonicalTier],
      chargeable:false,payment_authorized:false,settlement_attempted:false,
      evidence_checked:false,decision_signed:false,execution_authorized:false},
      {status:200,headers:HEADERS});
  }
  const authorization=request.headers.get("authorization")??"";
  if(!/^Bearer gmk_live_[0-9a-f]{64}$/.test(authorization))
    return bad("CUSTOMER_PAID_API_KEY_REQUIRED",401);
  if(typeof body.request_id!=="string"||body.request_id.length<1||body.request_id.length>256)
    return bad("INVALID_RISK_GATE_REQUEST",400);
  const url=new URL(request.url);
  const origin=String(process.env.GEOMACRO_CONTROL_PLANE_URL??FALLBACK).replace(/\/+$/u,"");
  if(!/^https:\/\/[A-Za-z0-9._-]+(?::443)?$/u.test(origin)||
    ["localhost","127.0.0.1","[::1]"].includes(url.hostname))
    return bad("RISK_GATE_ORIGIN_INVALID",503);
  try{
    const upstream=await fetcher(origin+"/v1/store/risk-gate",{
      method:"POST",redirect:"manual",headers:{"content-type":"application/json",authorization},
      body:JSON.stringify({...body,country_iso3:countryIso3,category,tier,policy:body.policy??DEFAULT_POLICY}),signal:AbortSignal.timeout(5000),
    });
    if(upstream.status>=300&&upstream.status<400)throw Error("REDIRECT_FORBIDDEN");
    const responseText=await upstream.text();
    if(new TextEncoder().encode(responseText).byteLength>128*1024)throw Error("RESPONSE_OVERSIZED");
    let value:Record<string,unknown>;try{value=JSON.parse(responseText)}catch{throw Error("RESPONSE_INVALID_JSON");}
    if(value.execution_authorized!==false)throw Error("EXECUTION_BOUNDARY");
    if(upstream.status===200){
      if(value.tier!==tier||typeof value.billable!=="boolean"||
        !["DELIVERED","INSUFFICIENT_EVIDENCE"].includes(String(value.entry_status)))
        throw Error("RISK_GATE_RESPONSE_INVALID");
      const trusted=await resolveDecisionKey(origin,fetcher);
      if(!validateSignedStoreDecision(value,trusted.key,trusted.id))throw Error("RISK_GATE_SIGNATURE_INVALID");
    }
    return Response.json(value,{status:upstream.status,headers:HEADERS});
  }catch{
    return bad("RISK_GATE_D1_TRANSPORT_UNAVAILABLE",503);
  }
}

export const Route=createFileRoute("/api/v1/risk-gate")({
  server:{handlers:{
    OPTIONS:async({request})=>forwardDirectRiskGate(request),
    POST:async({request})=>forwardDirectRiskGate(request),
  }},
});

import {createHash,createPublicKey,verify as edVerify} from "node:crypto";
import {canonicalRiskObjectJson} from "../lib/risk-object-signing.server";
import {createFileRoute} from "@tanstack/react-router";
import {fetchWithoutRedirect} from "../lib/fetch-without-redirect";

/**
 * Supabase-free external Risk Gate ingress. The D1 Worker owns the separate
 * partner credential, atomic quota, idempotency, signed-GRO verification and
 * durable audit. No fallback to the former Supabase handler is permitted.
 */
const FALLBACK="https://geomacro-control-plane.daspallab202391.workers.dev";
const MAX_BYTES=64*1024;
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
export function validateSignedProgressiveResponse(json:Record<string,unknown>,trustedKey:string,keyId:string|null):boolean{
 const payload=json.decision_signed_payload;
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
    json.decision_signature_scheme!=="Ed25519"||
    json.decision_signature_scope!=="geomacro.progressive-risk-gate-decision.v1"||
    typeof json.decision_signature_key_id!=="string"||
    !/^[A-Za-z0-9._:-]{4,120}$/.test(json.decision_signature_key_id)||
    typeof json.decision_signature_b64!=="string"||
    !/^[A-Za-z0-9+/]{86}==$/.test(json.decision_signature_b64)||
    typeof json.decision_payload_sha256!=="string"||
    !/^[a-f0-9]{64}$/.test(json.decision_payload_sha256))return false;
 const obj=payload as Record<string,unknown>;
 if(obj.schema!=="geomacro.progressive-risk-gate-decision.v1"||
    obj.execution_authorized!==false||
    obj.tier!==json.tier||
    obj.channel!==json.channel||obj.verdict_id!==json.verdict_id||
    obj.structure_type!==json.structure_type||
    obj.customer_price_usdc!==json.customer_price_usdc||
    obj.geomacro_fee_usdc!==json.geomacro_fee_usdc||
    obj.predge_share_usdc!==json.predge_share_usdc||
    obj.billable!==json.billable||obj.billing_mode!==json.billing_mode||
    obj.entry_status!==json.entry_status||
    !["basic_focused","standard","complex_full"].includes(String(obj.tier)))return false;
 const paidTerms={
   basic_focused:{structure:"BASIC_FOCUSED_FACTS_DERIVED_V1",price:"0.15",fee:"0.10"},
   standard:{structure:"STANDARD_DUAL_ORIGINAL_GRO_V1",price:"0.20",fee:"0.15"},
   complex_full:{structure:"COMPLEX_7D_CORRIDOR_SYNTHESIS_V1",price:"0.30",fee:"0.25"},
 } as Record<string,{structure:string;price:string;fee:string}>;
 const terms=paidTerms[String(obj.tier)];
 if(obj.channel!=="predge_b2b"||
    typeof obj.verdict_id!=="string"||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(obj.verdict_id)||
    obj.structure_type!==terms.structure||obj.customer_price_usdc!==terms.price||
    !["PILOT_FREE","DELIVERED","INSUFFICIENT_EVIDENCE","UNDELIVERED","REFUNDED"].includes(String(obj.entry_status))||
    !["PILOT_FREE","PAID_ADDENDUM_V2"].includes(String(obj.billing_mode))||
    (obj.billable===true&&(obj.billing_mode!=="PAID_ADDENDUM_V2"||obj.entry_status!=="DELIVERED"||obj.geomacro_fee_usdc!==terms.fee||obj.predge_share_usdc!=="0.05"))||
    (obj.billable===false&&(!["PILOT_FREE","INSUFFICIENT_EVIDENCE","UNDELIVERED","REFUNDED"].includes(String(obj.entry_status))||obj.geomacro_fee_usdc!=="0.00"||obj.predge_share_usdc!=="0.00"))||
    (obj.entry_status==="PILOT_FREE"&&obj.billing_mode!=="PILOT_FREE")||
    (obj.entry_status==="DELIVERED"&&obj.billing_mode!=="PAID_ADDENDUM_V2"))return false;
 const matrix=obj.tier_activation_matrix as Record<string,Record<string,unknown>>|undefined;
 if(!matrix||matrix.basic?.status!=="ACTIVE"||matrix.basic?.active!==true||
    !["ACTIVE","PENDING"].includes(String(matrix.standard?.status))||
    !["ACTIVE","LOCKED"].includes(String(matrix.complex?.status))||
    !Number.isSafeInteger(matrix.standard?.corroboration_sources_count)||
    typeof matrix.complex?.signed_gro_ready!=="boolean"||
    typeof matrix.complex?.seven_day_rollup_ready!=="boolean"||
    typeof matrix.complex?.active!=="boolean"||
    typeof matrix.standard?.active!=="boolean")return false;
 const standardActive=matrix.standard.active===true;
 const complexReady=standardActive &&
   matrix.complex.signed_gro_ready===true &&
   matrix.complex.seven_day_rollup_ready===true;
 if(matrix.standard.status!==(standardActive?"ACTIVE":"PENDING")||
    matrix.complex.active!==complexReady||
    matrix.complex.status!==(complexReady?"ACTIVE":"LOCKED")||
    (obj.billable===true&&obj.tier==="standard"&&!standardActive)||
    (obj.billable===true&&obj.tier==="complex_full"&&!complexReady))
    return false;
 // Never publish a proxy-modified decision outside the signed bytes.
 for(const field of ["risk_gate","context","tier_activation_matrix"]){
   if(canonicalRiskObjectJson(obj[field])!==canonicalRiskObjectJson(json[field]))return false;
 }
 const canonical=canonicalRiskObjectJson(payload);
 const digest=createHash("sha256").update(canonical,"utf8").digest("hex");
 if(digest!==json.decision_payload_sha256)return false;
 // The Worker also independently verifies signing-key pair consistency.
 // SSR additionally verifies if a separately pinned public key is installed.
 if(!trustedKey||keyId!==null&&json.decision_signature_key_id!==keyId)return false;
 try{
   const key=createPublicKey({key:Buffer.from(trustedKey,"base64"),format:"der",type:"spki"});
   return key.asymmetricKeyType==="ed25519" && edVerify(null,Buffer.from(canonical),
     key,Buffer.from(json.decision_signature_b64,"base64"));
 }catch{return false}
}
/**
 * A separately configured SSR trust pin is preferred. Where Lovable SSR has
 * no deployment-specific pin, resolve the public key ONLY from the same
 * configured Cloudflare origin over validated HTTPS (no redirects).
 * This fallback is transport-bound trust, not an independently pinned issuer.
 */
async function resolveDecisionVerifier(origin:string,
 fetcher:typeof fetchWithoutRedirect,staging:boolean):Promise<{key:string;id:string|null}>{
 const pinned=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
 if(pinned)return {key:pinned,id:null};
 if(staging || !origin.startsWith("https://"))throw Error("DECISION_KEY_PIN_UNAVAILABLE");
 const res=await fetcher(origin+"/v1/public/risk-gate-decision-key",{
   method:"GET",redirect:"manual",
   headers:{"accept":"application/json"},signal:AbortSignal.timeout(2000)
 });
 if(res.status!==200||res.redirected)throw Error("DECISION_KEY_ORIGIN_UNAVAILABLE");
 const wire=await res.text();
 if(wire.length>2048)throw Error("DECISION_KEY_OVERSIZED");
 const obj=JSON.parse(wire) as Record<string,unknown>;
 if(obj.ok!==true||obj.schema!=="geomacro.risk-gate-decision-key.v1"||
   obj.scheme!=="Ed25519"||
   typeof obj.key_id!=="string"||!/^[A-Za-z0-9._:-]{4,120}$/.test(obj.key_id)||
   typeof obj.public_key_spki_b64!=="string"||
   !/^[A-Za-z0-9+/]{55,120}={0,2}$/.test(obj.public_key_spki_b64))
   throw Error("DECISION_KEY_ORIGIN_INVALID");
 return {key:obj.public_key_spki_b64,id:obj.key_id};
}
export async function forwardRiskGateToD1(request:Request,fetcher=fetchWithoutRedirect):Promise<Response>{
 const incoming=new URL(request.url);
 // Disposable local tests must never forward their synthetic bearer or GRO
 // to the real production Worker. A local D1 fixture is a separate explicit
 // test target; restoring a Supabase production fallback is not permitted.
 const local=["localhost","127.0.0.1","[::1]"].includes(incoming.hostname);
 const localOrigin=String(process.env.GEOMACRO_RISK_GATE_LOCAL_D1_ORIGIN??'');
 const staging=local&&process.env.NODE_ENV==='development'&&
  process.env.RISK_GATE_LOAD_TEST_ACK==='STAGING_ONLY'&&
  /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(localOrigin);
 if(local&&!staging)return Response.json({ok:false,error:"RISK_GATE_LOCAL_D1_FIXTURE_REQUIRED",
   execution_authorized:false},{status:503,headers});
 const origin=staging?localOrigin:String(process.env.GEOMACRO_CONTROL_PLANE_URL??FALLBACK).replace(/\/+$/,"");
 if(!staging&&!/^https:\/\/[A-Za-z0-9._-]+(?::443)?$/.test(origin)){
   return Response.json({ok:false,error:"RISK_GATE_ORIGIN_INVALID",execution_authorized:false},{status:503,headers});
 }
 const contentType=(request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase();
 if(contentType!=="application/json")return Response.json(
   {ok:false,error:"UNSUPPORTED_MEDIA_TYPE",execution_authorized:false},{status:415,headers});
 let body:string;
 try{body=await request.text()}catch{
   return Response.json({ok:false,error:"RISK_GATE_BODY_UNREADABLE",execution_authorized:false},{status:400,headers});
 }
 if(Buffer.byteLength(body,"utf8")>MAX_BYTES)return Response.json(
   {ok:false,error:"BODY_TOO_LARGE",execution_authorized:false},{status:413,headers});
 try{
   const upstream=await fetcher(origin+"/v1/partner/predge/risk-gate",{
     method:"POST",redirect:"manual",
     headers:{"content-type":"application/json",
       "authorization":request.headers.get("authorization")??""},
     body,signal:AbortSignal.timeout(4500),
   });
   if(upstream.status>=300&&upstream.status<400)throw Error("REDIRECT_FORBIDDEN");
   const text=await upstream.text();
   if(Buffer.byteLength(text,"utf8")>128*1024)throw Error("OVERSIZED");
   let json:Record<string,unknown>;
   try{json=JSON.parse(text)}catch{throw Error("INVALID_JSON");}
   if(json.execution_authorized!==false)throw Error("EXECUTION_BOUNDARY");
   if(upstream.status===200){
     if(json.ok!==true||!json.risk_gate||
        (json.risk_gate as Record<string,unknown>).execution_authorized!==false||
        json.decision_signature_scheme!=="Ed25519")
       throw Error("INVALID_SIGNED_PROGRESSIVE_RESPONSE");
     const verifier=await resolveDecisionVerifier(origin,fetcher,staging);
     if(!validateSignedProgressiveResponse(json,verifier.key,verifier.id))
       throw Error("INVALID_SIGNED_PROGRESSIVE_RESPONSE");
   }
   return Response.json(json,{status:upstream.status,headers});
 }catch{
   return Response.json({ok:false,error:"RISK_GATE_D1_TRANSPORT_UNAVAILABLE",
     advisory_decision:"PAUSE",execution_authorized:false},{status:503,headers});
 }
}
export const Route=createFileRoute("/api/risk-gate")({
 server:{handlers:{POST:async({request})=>forwardRiskGateToD1(request)}},
});

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
function validateSignedProgressiveResponse(json:Record<string,unknown>):boolean{
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
    obj.price_per_call_usd!==json.price_per_call_usd||
    !["BASIC_0_10","STANDARD_0_15","COMPLEX_0_25"].includes(String(obj.tier)))return false;
 const matrix=obj.tier_activation_matrix as Record<string,Record<string,unknown>>|undefined;
 if(!matrix||matrix.basic?.status!=="ACTIVE"||matrix.basic?.active!==true||
    !["ACTIVE","PENDING"].includes(String(matrix.standard?.status))||
    !["ACTIVE","LOCKED"].includes(String(matrix.complex?.status))||
    !Number.isSafeInteger(matrix.standard?.corroboration_sources_count)||
    typeof matrix.complex?.signed_gro_ready!=="boolean"||
    typeof matrix.complex?.seven_day_rollup_ready!=="boolean")return false;
 // Never publish a proxy-modified decision outside the signed bytes.
 for(const field of ["risk_gate","context","tier_activation_matrix"]){
   if(canonicalRiskObjectJson(obj[field])!==canonicalRiskObjectJson(json[field]))return false;
 }
 const canonical=canonicalRiskObjectJson(payload);
 const digest=createHash("sha256").update(canonical,"utf8").digest("hex");
 if(digest!==json.decision_payload_sha256)return false;
 // The Worker also independently verifies signing-key pair consistency.
 // SSR additionally verifies if a separately pinned public key is installed.
 const pin=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
 if(!pin)return false;
 try{
   const key=createPublicKey({key:Buffer.from(pin,"base64"),format:"der",type:"spki"});
   return key.asymmetricKeyType==="ed25519" && edVerify(null,Buffer.from(canonical),
     key,Buffer.from(json.decision_signature_b64,"base64"));
 }catch{return false}
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
   if(upstream.status===200&&
      (json.ok!==true||
       !json.risk_gate||
       (json.risk_gate as Record<string,unknown>).execution_authorized!==false||
       !validateSignedProgressiveResponse(json)))
       throw Error("INVALID_SIGNED_PROGRESSIVE_RESPONSE");
   return Response.json(json,{status:upstream.status,headers});
 }catch{
   return Response.json({ok:false,error:"RISK_GATE_D1_TRANSPORT_UNAVAILABLE",
     advisory_decision:"PAUSE",execution_authorized:false},{status:503,headers});
 }
}
export const Route=createFileRoute("/api/risk-gate")({
 server:{handlers:{POST:async({request})=>forwardRiskGateToD1(request)}},
});

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
export async function forwardRiskGateToD1(request:Request,fetcher=fetchWithoutRedirect):Promise<Response>{
 const incoming=new URL(request.url);
 // Disposable local tests must never forward their synthetic bearer or GRO
 // to the real production Worker. A local D1 fixture is a separate explicit
 // test target; restoring a Supabase production fallback is not permitted.
 if(["localhost","127.0.0.1","[::1]"].includes(incoming.hostname))
  return Response.json({ok:false,error:"RISK_GATE_LOCAL_D1_FIXTURE_REQUIRED",
   execution_authorized:false},{status:503,headers});
 const origin=String(process.env.GEOMACRO_CONTROL_PLANE_URL??FALLBACK).replace(/\/+$/,"");
 if(!/^https:\/\/[A-Za-z0-9._-]+(?::443)?$/.test(origin)){
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
       (json.risk_gate as Record<string,unknown>).execution_authorized!==false))
       throw Error("INVALID_RESPONSE");
   return Response.json(json,{status:upstream.status,headers});
 }catch{
   return Response.json({ok:false,error:"RISK_GATE_D1_TRANSPORT_UNAVAILABLE",
     advisory_decision:"PAUSE",execution_authorized:false},{status:503,headers});
 }
}
export const Route=createFileRoute("/api/risk-gate")({
 server:{handlers:{POST:async({request})=>forwardRiskGateToD1(request)}},
});

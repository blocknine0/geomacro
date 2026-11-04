import {createFileRoute} from "@tanstack/react-router";
import {timingSafeEqual} from "node:crypto";
import {country195ByIso3} from "../lib/canonical-country-registry-195";
import {getLatestSignedResearchGRO} from "../lib/risk-gate/stream-ingest";

const HEADERS={"Cache-Control":"private, no-store","Vary":"Authorization",
 "X-Robots-Tag":"noindex,nofollow","X-Content-Type-Options":"nosniff"};
const pause=(error:string,status=503)=>Response.json({
 schema:"geomacro.research-corridor-gate.v1",
 ok:false,decision:"PAUSE",reason:error,
 execution_authorized:false,commercial_eligible:false,
 research_only:true,
},{status,headers:HEADERS});
function authorized(request:Request,secret:string):boolean{
 const auth=request.headers.get("authorization")??"";
 const actual=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(secret.length<32||actual.length!==secret.length)return false;
 const expected=Buffer.from(secret,"utf8"),supplied=Buffer.from(actual,"utf8");
 return expected.length===supplied.length&&timingSafeEqual(expected,supplied);
}
/**
 * Separate private RESEARCH-only endpoint. Never touch /api/risk-gate,
 * /v1/partner/predge/risk-gate, x402, purchases or execution adaptors.
 */

/**
 * The isolated Supabase Edge production gate is the only source of verified
 * research readback when host-private credentials have not been provisioned.
 * The CLIENT supplies its own private Vault read token. No Supabase service
 * key or signing private key is copied to Nitro, GitHub or the browser.
 * An explicit research kill switch (ENABLE=0) still blocks this route.
 */
export async function proxyIsolatedResearchRiskGate(
 request:Request,fetchImpl:typeof fetch=fetch
):Promise<Response>{
 const authorization=request.headers.get("authorization")??"";
 if(!/^Bearer [a-f0-9]{64}$/u.test(authorization))
  return pause("RESEARCH_AUTH_REQUIRED",401);
 if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
  return pause("UNSUPPORTED_MEDIA_TYPE",415);
 let body:string;
 try{
  body=await request.text();
  if(Buffer.byteLength(body,"utf8")>8192)return pause("RESEARCH_REQUEST_TOO_LARGE",413);
 }catch{return pause("RESEARCH_INVALID_REQUEST",400)}
 let reply:Response;
 try{
  reply=await fetchImpl(
   "https://ymjuwuvbialsevfawvvq.supabase.co/functions/v1/gm-research-risk-gate",{
   method:"POST",redirect:"error",cache:"no-store",headers:{
    Authorization:authorization,"Content-Type":"application/json",Accept:"application/json"
   },body,signal:AbortSignal.timeout(9000)
  });
 }catch{return pause("RESEARCH_EDGE_RELAY_TRANSPORT_UNAVAILABLE")}
 if(reply.redirected||![200,400,401,405,413,415,503].includes(reply.status))
  return pause("RESEARCH_EDGE_RELAY_UPSTREAM_STATUS");
 let result:Record<string,unknown>;
 try{
  const text=await reply.text();
  if(text.length>4800)throw Error("OVERSIZE");
  const data=JSON.parse(text);
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error("SHAPE");
  result=data;
 }catch{return pause("RESEARCH_EDGE_RELAY_INVALID_JSON")}
 if(result.schema!=="geomacro.research-corridor-gate.v1"||
    result.execution_authorized!==false||
    result.commercial_eligible!==false||result.research_only!==true||
    !["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"].includes(
     String(result.decision??""))||
    (reply.status===200?(result.ok!==true||
       result.verification_status!=="PROVISIONAL_RESEARCH_ONLY"):
     (result.ok!==false||result.decision!=="PAUSE")))
  return pause("RESEARCH_EDGE_RELAY_INVALID_ENVELOPE");
 return Response.json(result,{status:reply.status,headers:HEADERS});
}

export async function evaluateResearchRiskGate(
 request:Request,opts:{
 env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch;now?:Date
 }={}
):Promise<Response>{
 const env=opts.env??process.env,now=opts.now??new Date();
 if(env.GEOMACRO_RESEARCH_RISK_GATE_ENABLE==="0")
  return pause("RESEARCH_RISK_GATE_NOT_ACTIVATED");
 // Research-only Supabase Edge tokens are independently minted 256-bit hex.
 // Route these through the isolated, Ed25519-verified production gate even
 // if the legacy Nitro env switch is "1" without matching local secrets.
 // An explicit ENABLE=0 remains the hard production kill switch.
 const incomingBearer=request.headers.get("authorization")??"";
 if(/^Bearer [a-f0-9]{64}$/u.test(incomingBearer)||
    env.GEOMACRO_RESEARCH_RISK_GATE_ENABLE===undefined||
    env.GEOMACRO_RESEARCH_RISK_GATE_ENABLE==="")
  return proxyIsolatedResearchRiskGate(request,opts.fetchImpl);
 if(env.GEOMACRO_RESEARCH_RISK_GATE_ENABLE!=="1")
  return pause("RESEARCH_RISK_GATE_NOT_ACTIVATED");
 if(!authorized(request,String(env.GEOMACRO_RESEARCH_RISK_GATE_READ_TOKEN??"")))
  return pause("RESEARCH_AUTH_REQUIRED",401);
 if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
  return pause("UNSUPPORTED_MEDIA_TYPE",415);
 let input:Record<string,unknown>;
 try{
  const body=await request.text();
  if(Buffer.byteLength(body,"utf8")>8192)return pause("RESEARCH_REQUEST_TOO_LARGE",413);
  const parsed=JSON.parse(body);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();
  input=parsed;
 }catch{return pause("RESEARCH_INVALID_REQUEST",400)}
 if(Object.keys(input).some(x=>!["origin_country","destination_country","policy_threshold"].includes(x))||
    typeof input.origin_country!=="string"||
    typeof input.destination_country!=="string"||
    !country195ByIso3(input.origin_country)||!country195ByIso3(input.destination_country)||
    input.origin_country===input.destination_country)
   return pause("RESEARCH_COUNTRY_PAIR_INVALID",400);
 const threshold=input.policy_threshold===undefined?70:Number(input.policy_threshold);
 if(!Number.isFinite(threshold)||threshold<50||threshold>85)
  return pause("RESEARCH_THRESHOLD_INVALID",400);
 let origin,dest;
 try{
  [origin,dest]=await Promise.all([
   getLatestSignedResearchGRO(input.origin_country,{...opts,env,now}),
   getLatestSignedResearchGRO(input.destination_country,{...opts,env,now})
  ]);
 }catch{return pause("RESEARCH_STORE_UNAVAILABLE")}
 if(!origin||!dest)return pause("VERIFIED_SIGNED_RESEARCH_STATE_UNAVAILABLE");
 const maxScore=Math.max(origin.composite_score,dest.composite_score);
 const decision=maxScore>=85?"PAUSE":
    maxScore>=threshold?"REQUIRE_APPROVAL":
    maxScore>=50?"REDUCE_LIMIT":"CONTINUE";
 return Response.json({
  schema:"geomacro.research-corridor-gate.v1",
  ok:true,decision,execution_authorized:false,commercial_eligible:false,
  research_only:true,verification_status:"PROVISIONAL_RESEARCH_ONLY",
  corridor:input.origin_country+"->"+input.destination_country,
  corridor_score:maxScore,
  proof:{
   origin_signature:origin.research_signature_b64,
   dest_signature:dest.research_signature_b64,
   origin_sha256:origin.research_sha256,
   dest_sha256:dest.research_sha256,
   signing_key_id:origin.research_signing_key_id,
   verified_at:now.toISOString()
  },
  note:"Advisory research state only; not a verified event, payment entitlement or permission to execute.",
 },{status:200,headers:HEADERS});
}
export const Route=createFileRoute("/api/research-risk-gate")({
 server:{handlers:{POST:async({request})=>evaluateResearchRiskGate(request)}}
});

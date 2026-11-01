/**
 * Isolated, optional signed sample transport for PREDGE.
 * Does not call, modify or authorize the existing risk-gate decision path.
 * GET uses the existing research Bearer and the SAME atomic 500/day research
 * governor, so a second unrestricted quota is never introduced.
 *
 * Signer operates outside the Worker. No production private key is deployed
 * to this Worker. PUT is owner-only and verifies the pinned signature BEFORE
 * replacing the single bounded D1 sample.
 */
import {consumeCentralSecurityBudget} from "./central-security-budget.mjs";
import {MAX_WIRE_BYTES,verifySignedPilotCheck} from "./predge-pilot-news-context-v2.mjs";
const HEADERS={"Cache-Control":"private, no-store","Pragma":"no-cache",
  "Vary":"Authorization","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const TOKEN=/^[a-f0-9]{64}$/;
const error=(code,status=503)=>Response.json({ok:false,error:code,chargeable:false,execution_authorized:false},
  {status,headers:HEADERS});
function constantEqual(a,b){
  if(typeof a!=="string"||typeof b!=="string"||a.length!==64||b.length!==64)return false;
  let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function authenticate(req,secret){
  const header=req.headers.get("authorization")??"";
  return TOKEN.test(secret)&&/^Bearer [a-f0-9]{64}$/.test(header)&&
    constantEqual(header.slice(7),secret);
}
async function digest(s){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function readBounded(request){
  const claimed=Number(request.headers.get("content-length")??0);
  if(!Number.isFinite(claimed)||claimed>MAX_WIRE_BYTES)return null;
  const reader=request.body?.getReader();if(!reader)return null;
  const parts=[];let size=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>MAX_WIRE_BYTES){await reader.cancel();return null;}
    parts.push(value);
  }
  const combined=new Uint8Array(size);let offset=0;
  for(const part of parts){combined.set(part,offset);offset+=part.length;}
  return new TextDecoder("utf-8",{fatal:true}).decode(combined);
}
export async function predgePilotCheckV2(request,env,now=Date.now()){
  if(request.method!=="GET")return error("METHOD_NOT_ALLOWED",405);
  if(new URL(request.url).search)return error("QUERY_NOT_SUPPORTED",400);
  const token=env?.PREDGE_RESEARCH_NEWS_TOKEN;
  if(!TOKEN.test(String(token??"")))return error("RESEARCH_CREDENTIAL_UNAVAILABLE");
  if(!authenticate(request,token))return error("PILOT_CHECK_UNAUTHORIZED",401);
  if(!env?.DB?.batch||!env?.DB?.prepare)return error("PILOT_CHECK_D1_UNAVAILABLE");
  let budget;
  try{
    budget=await consumeCentralSecurityBudget(env.DB,{
      route_class:"predge_research_news",client_key:await digest(token),
    },{now});
  }catch{return error("PILOT_CHECK_BUDGET_UNAVAILABLE");}
  if(!budget.allowed)return Response.json({
    ok:false,error:"PILOT_CHECK_DAILY_LIMIT",execution_authorized:false,chargeable:false,
  },{status:429,headers:{...HEADERS,"Retry-After":String(Math.max(1,budget.retry_after_seconds))}});
  let row;
  try{row=await env.DB.prepare(
    "SELECT envelope_json FROM predge_pilot_signed_news_context WHERE singleton=1 LIMIT 1"
  ).first();}catch{return error("PILOT_CHECK_D1_UNAVAILABLE");}
  if(!row||typeof row.envelope_json!=="string")return error("SIGNED_PILOT_SAMPLE_NOT_PUBLISHED");
  let payload;
  try{
    if(new TextEncoder().encode(row.envelope_json).length>MAX_WIRE_BYTES)
      return error("SIGNED_PILOT_SAMPLE_OVERSIZE");
    payload=JSON.parse(row.envelope_json);
    await verifySignedPilotCheck(payload,{now,registry:env.RISK_GATE_VERIFY_KEYS_JSON});
  }catch{return error("SIGNED_PILOT_SAMPLE_NOT_VERIFIED");}
  // Transport exactly the signed bytes; do NOT append replay metadata or alter
  // response fields after Ed25519 signing.
  return new Response(row.envelope_json,{status:200,headers:{
    ...HEADERS,"Content-Type":"application/json; charset=utf-8"
  }});
}
export async function publishPredgePilotCheckV2(request,env,now=Date.now()){
  if(request.method!=="PUT")return error("METHOD_NOT_ALLOWED",405);
  if(new URL(request.url).search)return error("QUERY_NOT_SUPPORTED",400);
  if(!TOKEN.test(String(env?.CONTROL_PLANE_TOKEN??"")))
    return error("OWNER_CREDENTIAL_UNAVAILABLE");
  if(!authenticate(request,env.CONTROL_PLANE_TOKEN))return error("OWNER_UNAUTHORIZED",401);
  if((request.headers.get("content-type")??"").split(";")[0].trim().toLowerCase()!=="application/json")
    return error("UNSUPPORTED_MEDIA_TYPE",415);
  if(!env?.DB?.prepare)return error("PILOT_CHECK_D1_UNAVAILABLE");
  let raw,payload;
  try{raw=await readBounded(request);if(raw===null)return error("PILOT_SAMPLE_TOO_LARGE",413);
    payload=JSON.parse(raw);
    await verifySignedPilotCheck(payload,{now,registry:env.RISK_GATE_VERIFY_KEYS_JSON});
  }catch{return error("PILOT_SAMPLE_SIGNATURE_OR_SCHEMA_INVALID",422);}
  try{
    const result=await env.DB.prepare(
      "INSERT INTO predge_pilot_signed_news_context (singleton,envelope_json,generated_at,expires_at,payload_hash,updated_at) "+
      "VALUES(1,?,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET "+
      "envelope_json=excluded.envelope_json,generated_at=excluded.generated_at,"+
      "expires_at=excluded.expires_at,payload_hash=excluded.payload_hash,updated_at=excluded.updated_at "+
      "WHERE excluded.generated_at>=predge_pilot_signed_news_context.generated_at"
    ).bind(JSON.stringify(payload),payload.generated_at,payload.expires_at,
      payload.integrity.payload_hash,new Date(now).toISOString()).run();
    if(!result?.success)return error("PILOT_SAMPLE_D1_WRITE_UNCONFIRMED");
    return Response.json({ok:true,received_hash:payload.integrity.payload_hash,
      updated_at:new Date(now).toISOString(),execution_authorized:false,chargeable:false},
    {status:200,headers:HEADERS});
  }catch{return error("PILOT_SAMPLE_D1_WRITE_UNAVAILABLE");}
}

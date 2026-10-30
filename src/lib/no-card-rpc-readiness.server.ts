import process from "node:process";
import {createHmac,timingSafeEqual} from "node:crypto";

/**
 * Operator-signed, read-only, no-funds Base/Polygon RPC diagnostics.
 * This module has no access to buyer signatures, wallets, payment facilitators,
 * settle/verify operations, token keys or privileged PREDGE state.
 */
const SCOPE="geomacro.rpc-readiness.v1\nPOST\n/api/v1/payments/networks\n";
const NETWORKS=[
  {slug:"base",suffix:"BASE",chainId:"0x2105"},
  {slug:"polygon",suffix:"POLYGON",chainId:"0x89"},
] as const;
const TIMEOUT_MS=6000;
const MAX_ALTERNATES=10;
const HEX=/^0x[0-9a-fA-F]+$/u;
type AuditEnvironment=Record<string,string|undefined>;
type ProbeResult={network:string;slot:string;status:string;provider_family?:string};

export function rpcAuditSignature(secret:string,atMs:number){
  return createHmac("sha256",secret).update(SCOPE+String(atMs)).digest("hex");
}
export function isAuthorizedRpcAudit(request:Request,env:AuditEnvironment,now=Date.now()){
  const key=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"");
  const stamp=String(request.headers.get("x-geomacro-rpc-audit-time")??"");
  const signature=String(request.headers.get("x-geomacro-rpc-audit-hmac")??"");
  if(key.length<32||!/^[0-9]{13}$/u.test(stamp)||!/^[a-f0-9]{64}$/u.test(signature))return false;
  const at=Number(stamp);
  if(!Number.isSafeInteger(at)||Math.abs(now-at)>30000)return false;
  const ours=Buffer.from(rpcAuditSignature(key,at),"hex");
  const theirs=Buffer.from(signature,"hex");
  return ours.length===theirs.length && timingSafeEqual(ours,theirs);
}
function safeUrl(value:string){
  let url:URL;
  try{url=new URL(value);}catch{throw Error("INVALID_URL");}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||url.hash||
    !host||host==="localhost"||host.endsWith(".localhost")||host==="[::1]"||
    host==="::1"||/^127\./u.test(host)||/^10\./u.test(host)||
    /^192\.168\./u.test(host)||/^169\.254\./u.test(host)||
    /^172\.(1[6-9]|2[0-9]|3[01])\./u.test(host))
    throw Error("INVALID_URL");
  return url.toString();
}
function slotConfig(suffix:string,env:AuditEnvironment){
  const primary=String(env["GEOMACRO_NO_CARD_RPC_"+suffix]??"").trim();
  const raw=String(env["GEOMACRO_NO_CARD_RPC_"+suffix+"_ALTERNATES"]??"").trim();
  let legacy:string[]=[];
  if(raw){
    let parsed:unknown;
    try{parsed=raw.startsWith("https://")?raw:JSON.parse(raw);}
    catch{throw Error("ALTERNATES_INVALID");}
    if(typeof parsed==="string")parsed=[parsed];
    if(!Array.isArray(parsed)||parsed.length>MAX_ALTERNATES||
      parsed.some(v=>typeof v!=="string"||!v.trim()))throw Error("ALTERNATES_INVALID");
    legacy=parsed;
  }
  const individual=Array.from({length:MAX_ALTERNATES},(_,i)=>
    String(env["GEOMACRO_NO_CARD_RPC_"+suffix+"_BACKUP_"+(i+1)]??"").trim()
  ).filter(Boolean);
  if(legacy.length+individual.length>MAX_ALTERNATES)throw Error("ALTERNATES_INVALID");
  const combined=[primary,...legacy,...individual];
  // Private diagnostics focus on exactly the owner's three selected providers.
  // Preserve operator-defined order; refuse missing slots or duplicated URLs.
  if(!combined[0]||!combined[1]||!combined[2])
    throw Error("SIX_PROVIDER_SLOTS_REQUIRED");
  const urls=combined.slice(0,3).map(safeUrl);
  if(new Set(urls).size!==3)throw Error("DUPLICATE_PROVIDER_URL");
  return urls;
}
function errorClass(e:unknown){
  if(e instanceof Error && (e.name==="TimeoutError"||e.name==="AbortError"))
    return "RPC_TIMEOUT";
  const cause=(e&&typeof e==="object"&&"cause" in e)?e.cause:null;
  const code=cause&&typeof cause==="object"&&"code" in cause?String(cause.code):"";
  if(["ENOTFOUND","EAI_AGAIN"].includes(code))return "RPC_DNS_UNRESOLVED";
  if(["ETIMEDOUT","UND_ERR_CONNECT_TIMEOUT"].includes(code))return "RPC_CONNECT_TIMEOUT";
  if(["ENETUNREACH","EHOSTUNREACH","ECONNREFUSED"].includes(code))
    return "RPC_NETWORK_UNREACHABLE";
  if(["CERT_HAS_EXPIRED","UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "ERR_TLS_CERT_ALTNAME_INVALID","SELF_SIGNED_CERT_IN_CHAIN"].includes(code))
    return "RPC_TLS_ERROR";
  return "RPC_FETCH_FAILED";
}
function providerFamily(url:string){
  const host=new URL(url).hostname.toLowerCase();
  if(host==="alchemy.com"||host.endsWith(".alchemy.com"))return "ALCHEMY";
  if(host==="ankr.com"||host.endsWith(".ankr.com"))return "ANKR";
  if(host==="drpc.org"||host.endsWith(".drpc.org"))return "DRPC";
  return "OTHER";
}
async function outboundHttpsCheck(fetcher:typeof fetch){
  try{
    const r=await fetcher("https://www.cloudflare.com/cdn-cgi/trace",{
      method:"GET",redirect:"error",cache:"no-store",
      signal:AbortSignal.timeout(5000),
    });
    return r.status===200?"EGRESS_PASS":"EGRESS_HTTP_FAILURE";
  }catch(e){return "EGRESS_"+errorClass(e);}
}
async function call(url:string,method:string,params:unknown[],fetcher:typeof fetch){
  let response:Response;
  try{
    response=await fetcher(url,{method:"POST",redirect:"error",cache:"no-store",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
      signal:AbortSignal.timeout(TIMEOUT_MS),
    });
  }catch(e){throw Error(errorClass(e));}
  if(!response.ok){
    const status=response.status;
    if(status===401)throw Error("RPC_AUTH_REJECTED");
    if(status===403)throw Error("RPC_ACCESS_DENIED");
    if(status===404)throw Error("RPC_ENDPOINT_NOT_FOUND");
    if(status===429)throw Error("RPC_RATE_LIMITED");
    if(status>=500)throw Error("RPC_PROVIDER_5XX");
    throw Error("RPC_HTTP_ERROR");
  }
  if(Number(response.headers.get("content-length")||0)>65536)
    throw Error("RPC_RESPONSE_TOO_LARGE");
  let body:{jsonrpc?:string;id?:number;result?:unknown;error?:unknown};
  try{
    const raw=await response.text();
    if(raw.length>65536)throw Error("RPC_UNAVAILABLE");
    body=JSON.parse(raw);
  }catch{throw Error("RPC_INVALID_REPLY");}
  if(body?.jsonrpc!=="2.0"||body.id!==1||body.error||!Object.hasOwn(body,"result"))
    throw Error("RPC_INVALID_REPLY");
  return body.result;
}
async function probe(url:string,chainId:string,fetcher:typeof fetch){
  const id=await call(url,"eth_chainId",[],fetcher);
  if(id!==chainId)throw Error("RPC_WRONG_CHAIN");
  const height=await call(url,"eth_blockNumber",[],fetcher);
  if(typeof height!=="string"||!HEX.test(height)||BigInt(height)<1n)
    throw Error("RPC_INVALID_HEAD");
  const block=await call(url,"eth_getBlockByNumber",[height,false],fetcher) as
    {number?:unknown;hash?:unknown}|null;
  if(!block||block.number!==height||typeof block.hash!=="string"||
    !/^0x[0-9a-fA-F]{64}$/u.test(block.hash))
    throw Error("RPC_INVALID_BLOCK");
  const unknownTx="0x"+"0".repeat(64);
  const receipt=await call(url,"eth_getTransactionReceipt",[unknownTx],fetcher);
  if(receipt!==null)throw Error("RPC_UNEXPECTED_RECEIPT");
  return "PASS";
}
const STATUSES=new Set([
  "PASS","RPC_FETCH_FAILED","RPC_TIMEOUT","RPC_INVALID_REPLY",
  "RPC_AUTH_REJECTED","RPC_ACCESS_DENIED","RPC_ENDPOINT_NOT_FOUND",
  "RPC_RATE_LIMITED","RPC_PROVIDER_5XX","RPC_HTTP_ERROR",
  "RPC_RESPONSE_TOO_LARGE","RPC_WRONG_CHAIN","RPC_UNAVAILABLE",
  "RPC_DNS_UNRESOLVED","RPC_CONNECT_TIMEOUT",
  "RPC_NETWORK_UNREACHABLE","RPC_TLS_ERROR",
  "RPC_INVALID_HEAD","RPC_INVALID_BLOCK","RPC_UNEXPECTED_RECEIPT",
]);
export async function runSignedRpcReadiness(
  request:Request,env:AuditEnvironment=process.env,fetcher:typeof fetch=fetch,
  now=Date.now(),
){
  if(!isAuthorizedRpcAudit(request,env,now))
    return Response.json({ok:false,error:"NOT_FOUND"},{status:404,
      headers:{"Cache-Control":"no-store"}});
  if(new URL(request.url).search||new URL(request.url).hash)
    return Response.json({ok:false,error:"REQUEST_INVALID"},{status:400,
      headers:{"Cache-Control":"no-store"}});
  const egress_check=await outboundHttpsCheck(fetcher);
  const results:ProbeResult[]=[];
  for(const net of NETWORKS){
    let urls:string[];
    try{urls=slotConfig(net.suffix,env);}
    catch(e){
      const code=e instanceof Error?e.message:"";
      const configCode=new Set([
        "ALTERNATES_INVALID","SIX_PROVIDER_SLOTS_REQUIRED",
        "DUPLICATE_PROVIDER_URL","INVALID_URL",
      ]).has(code)?code:"CONFIG_INVALID";
      for(let i=0;i<3;i++)results.push({
        network:net.slug,slot:i===0?"primary":i===1?"backup_1":"backup_2",
        status:configCode,
      });
      continue;
    }
    const checked=await Promise.all(urls.map(async(url,i)=>{
      let status:string;
      try{status=await probe(url,net.chainId,fetcher);}
      catch(e){
        const code=e instanceof Error?e.message:"";
        status=STATUSES.has(code)?code:"RPC_UNAVAILABLE";
      }
      return {network:net.slug,slot:i===0?"primary":i===1?"backup_1":"backup_2",
        status,provider_family:providerFamily(url)};
    }));
    results.push(...checked);
  }
  const verified=results.length===6&&results.every(x=>x.status==="PASS");
  // Do not return URLs, provider credentials, secret names, detailed RPC
  // responses, block numbers, JSON-RPC error strings or payment auth state.
  return Response.json({
    schema:"geomacro.no-funds-six-rpc-readiness.v1",
    ok:verified,checked_at:new Date(now).toISOString(),
    egress_check,checks:results,
    secrets_exposed:false,chargeable:false,payment_performed:false,
    settlement_verified:false,paid_delivery_verified:false,
    proof_scope:"production SSR chain RPC connectivity only; NOT payment or rights acceptance",
  },{status:verified?200:503,headers:{"Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"}});
}

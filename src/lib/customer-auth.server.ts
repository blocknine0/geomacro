import process from "node:process";

export const CUSTOMER_COOKIE = "__Host-gm_customer";
const AUTH_HEADER = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;
export class CustomerError extends Error {
 constructor(public status:number,public code:string){super(code);}
}
export function customerHeaders(){return AUTH_HEADER;}

/**
 * No-funds, no-customer-data ingress diagnostic. The response deliberately
 * exposes neither the observed IP nor tokens. It DOES NOT establish trust:
 * an independent HTTPS client must send CF-Connecting-IP=198.51.100.217 and
 * observe that the platform overwrote it with a valid non-probe address.
 * Only then may the separate trusted-edge deployment flag be considered.
 */
export function customerIngressHeaderProbe(request:Request){
 const value=request.headers.get("cf-connecting-ip")??"";
 return {
  ok:true,
  schema:"geomacro.customer-ingress-header-probe.v1",
  cf_connecting_ip_present:/^[0-9a-fA-F:.]{3,64}$/.test(value),
  injected_cf_connecting_ip_survived:value==="198.51.100.217",
  no_email_or_payment_touched:true,
 };
}
export function rejectCrossOrigin(request:Request){
 const origin=request.headers.get("origin");
 if(!origin||origin!==new URL(request.url).origin)throw new CustomerError(403,"CUSTOMER_ORIGIN_REQUIRED");
}
export function customerSessionCookie(token:string,request:Request,maxAge:number){
 if(new URL(request.url).protocol!=="https:")throw new CustomerError(503,"CUSTOMER_SECURE_TRANSPORT_REQUIRED");
 const age=Math.max(0,Math.min(Math.floor(maxAge),3600));
 return `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
}
export function clearCustomerCookie(request:Request){return customerSessionCookie("",request,0);}
export function customerSessionToken(request:Request){
 const matches=request.headers.get("cookie")?.split(";").map(s=>s.trim()).filter(s=>s.startsWith(CUSTOMER_COOKIE+"="))??[];
 if(matches.length!==1)throw new CustomerError(401,"CUSTOMER_SESSION_REQUIRED");
 const token=matches[0].slice(CUSTOMER_COOKIE.length+1);
 if(!/^[a-f0-9]{64}$/.test(token))throw new CustomerError(401,"CUSTOMER_SESSION_INVALID");return token;
}
export async function customerBody(request:Request):Promise<Record<string,unknown>>{
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw new CustomerError(415,"CUSTOMER_JSON_REQUIRED");
 if(Number(request.headers.get("content-length")??0)>2048)throw new CustomerError(413,"CUSTOMER_BODY_TOO_LARGE");
 const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();throw new CustomerError(413,"CUSTOMER_BODY_TOO_LARGE");}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new CustomerError(400,"CUSTOMER_JSON_REQUIRED");}
 if(!body||typeof body!=="object"||Array.isArray(body))throw new CustomerError(400,"CUSTOMER_JSON_REQUIRED");return body as Record<string,unknown>;
}
type WorkerResult={ok:boolean;code?:string;user?:{id:string;email:string};session_token?:string;max_age?:number;[key:string]:unknown};
export async function callCustomerWorker(request:Request,action:string,payload:Record<string,unknown>={}):Promise<WorkerResult>{
 if(!/^(otp-start|otp-verify|session|account|key-create|key-revoke|logout|paid-authorize|paid-debit)$/.test(action))throw new CustomerError(400,"CUSTOMER_ACTION_INVALID");
 // Read protected configuration per request. There is deliberately no retired
 // Auth/PostgREST fallback, default URL, or generic control-plane token fallback.
 const raw=process.env.GEOMACRO_CUSTOMER_WORKER_URL??"",token=process.env.GEOMACRO_CUSTOMER_SSR_TOKEN??"";
 let base:URL;try{base=new URL(raw);}catch{throw new CustomerError(503,"CUSTOMER_D1_NOT_CONFIGURED");}
 if(base.protocol!=="https:"||base.username||base.password||base.search||base.hash||base.pathname!=="/"||token.length<64)
  throw new CustomerError(503,"CUSTOMER_D1_NOT_CONFIGURED");
 if([process.env.CONTROL_PLANE_TOKEN,process.env.GEOMACRO_CONTROL_PLANE_TOKEN,process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN].some(x=>x&&x===token))
  throw new CustomerError(503,"CUSTOMER_TOKEN_ISOLATION_REQUIRED");
 const origin=new URL(request.url).origin;
 if(!origin.startsWith("https://"))throw new CustomerError(503,"CUSTOMER_SECURE_TRANSPORT_REQUIRED");
 const headers:Record<string,string>={Authorization:`Bearer ${token}`,Origin:origin,"Content-Type":"application/json",Accept:"application/json"};
 if(action.startsWith("otp-")){
  // Cloudflare sets this at the trusted edge. Never use X-Forwarded-For or
  // browser JSON; absent trusted deployment metadata disables OTP rather than
  // silently dropping IP abuse controls. Hosting must strip spoofed CF headers.
  if(process.env.GEOMACRO_CUSTOMER_TRUSTED_EDGE!=="cloudflare")throw new CustomerError(503,"CUSTOMER_TRUSTED_IP_REQUIRED");
  const ip=request.headers.get("cf-connecting-ip");
  if(!ip||ip.length>64||!/^[0-9a-fA-F:.]+$/.test(ip))throw new CustomerError(503,"CUSTOMER_TRUSTED_IP_REQUIRED");
  headers["X-Gm-Customer-IP"]=ip;
 }
 let response:Response;
 try{response=await fetch(new URL(`/v1/internal/customer/${action}`,base),{
  method:"POST",headers,body:JSON.stringify(payload),redirect:"manual",signal:AbortSignal.timeout(28000),
 });}catch{throw new CustomerError(503,"CUSTOMER_D1_UNAVAILABLE");}
 if(response.status>=300&&response.status<400)throw new CustomerError(503,"CUSTOMER_D1_REDIRECT_REJECTED");
 let body:WorkerResult;try{body=await response.json() as WorkerResult;}catch{throw new CustomerError(503,"CUSTOMER_D1_RESPONSE_INVALID");}
 if(!body||body.ok!==true||!response.ok){
  const code=typeof body?.code==="string"&&/^CUSTOMER_[A-Z0-9_]{1,80}$/.test(body.code)?body.code:"CUSTOMER_D1_UNAVAILABLE";
  throw new CustomerError([400,401,403,404,413,415,429,503].includes(response.status)?response.status:503,code);
 }
 return body;
}
export async function authenticatedCustomer(request:Request){
 const result=await callCustomerWorker(request,"session",{session_token:customerSessionToken(request)});
 if(!result.user?.id||!result.user.email)throw new CustomerError(503,"CUSTOMER_D1_RESPONSE_INVALID");
 return result.user;
}
export function customerFailure(error:unknown){
 const status=error instanceof CustomerError?error.status:503;
 const code=error instanceof CustomerError?error.code:"CUSTOMER_SERVICE_UNAVAILABLE";
 return Response.json({ok:false,code},{status,headers:AUTH_HEADER});
}
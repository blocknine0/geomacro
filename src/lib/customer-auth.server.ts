import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { AUTHORITATIVE_RISK_PROJECT_REF } from "./risk-supabase.server";

const URL = `https://${AUTHORITATIVE_RISK_PROJECT_REF}.supabase.co`;
export const CUSTOMER_COOKIE = "__Host-gm_customer";
const AUTH_HEADER = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

export class CustomerError extends Error {
 constructor(public status:number,public code:string){super(code);}
}
function configuredAnon(){
 const url=(process.env.APP_SUPABASE_URL??process.env.SUPABASE_URL??"").trim();
 const key=(process.env.APP_SUPABASE_ANON_KEY??process.env.SUPABASE_ANON_KEY??"").trim();
 if(url!==URL||key.length<24)throw new CustomerError(503,"CUSTOMER_AUTH_NOT_CONFIGURED");
 return createClient(URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function customerAuthClient(){return configuredAnon();}
export function customerHeaders(){return AUTH_HEADER;}
export function rejectCrossOrigin(request:Request){
 const origin=request.headers.get("origin");
 if(!origin||origin!==new URL(request.url).origin)
  throw new CustomerError(403,"CUSTOMER_ORIGIN_REQUIRED");
}
export function customerSessionCookie(token:string,request:Request,maxAge:number){
 const secure=new URL(request.url).protocol==="https:";
 if(!secure && process.env.NODE_ENV==="production")
  throw new CustomerError(503,"CUSTOMER_SECURE_TRANSPORT_REQUIRED");
 const name=secure?CUSTOMER_COOKIE:"gm_customer_dev";
 const age=Math.max(0,Math.min(Math.floor(maxAge),3600));
 return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?"; Secure":""}`;
}
export function clearCustomerCookie(request:Request){
 return customerSessionCookie("",request,0);
}
export async function authenticatedCustomer(request:Request){
 const name=new URL(request.url).protocol==="https:"?CUSTOMER_COOKIE:"gm_customer_dev";
 const raw=request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="));
 const token=raw?decodeURIComponent(raw.slice(name.length+1)):"";
 if(!token||token.length>4096)throw new CustomerError(401,"CUSTOMER_SESSION_REQUIRED");
 const auth=customerAuthClient();
 try{
  const result=await auth.auth.getUser(token);
  const user=result.data.user;
  if(result.error||!user?.id||!user.email||!user.email_confirmed_at)
   throw new CustomerError(401,"CUSTOMER_SESSION_INVALID");
  return {id:user.id,email:user.email};
 }catch(error){
  if(error instanceof CustomerError)throw error;
  throw new CustomerError(503,"CUSTOMER_AUTH_UPSTREAM_UNAVAILABLE");
 }
}
export function customerFailure(error:unknown){
 const status=error instanceof CustomerError?error.status:503;
 const code=error instanceof CustomerError?error.code:"CUSTOMER_SERVICE_UNAVAILABLE";
 return Response.json({ok:false,code},{status,headers:AUTH_HEADER});
}

import {createFileRoute} from "@tanstack/react-router";

export const Route=createFileRoute("/api/v1/customer/auth")({server:{handlers:{
 GET:async({request}:{request:Request})=>{
  const c=await import("../lib/customer-auth.server");
  try{return Response.json({ok:true,user:await c.authenticatedCustomer(request)},{headers:c.customerHeaders()});}
  catch(error){return c.customerFailure(error);}
 },
 POST:async({request}:{request:Request})=>{
  const c=await import("../lib/customer-auth.server");
  try{
   c.rejectCrossOrigin(request);const body=await c.customerBody(request);
   if(body.action==="start"){
    const result=await c.callCustomerWorker(request,"otp-start",{email:body.email});
    return Response.json({ok:true,code:result.code},{headers:c.customerHeaders()});
   }
   if(body.action==="verify"){
    const result=await c.callCustomerWorker(request,"otp-verify",{email:body.email,otp:body.otp});
    if(!result.session_token||!/^[a-f0-9]{64}$/.test(result.session_token)||result.max_age!==3600||!result.user?.email)
     throw new c.CustomerError(503,"CUSTOMER_D1_RESPONSE_INVALID");
    // The opaque token exists only in the secure cookie, never in browser JSON.
    return Response.json({ok:true,user:{email:result.user.email}},{headers:{...c.customerHeaders(),
     "Set-Cookie":c.customerSessionCookie(result.session_token,request,result.max_age)}});
   }
   throw new c.CustomerError(400,"CUSTOMER_AUTH_ACTION_INVALID");
  }catch(error){return c.customerFailure(error);}
 },
 DELETE:async({request}:{request:Request})=>{
  const c=await import("../lib/customer-auth.server");
  try{
   c.rejectCrossOrigin(request);
   await c.callCustomerWorker(request,"logout",{session_token:c.customerSessionToken(request)});
   return Response.json({ok:true},{headers:{...c.customerHeaders(),"Set-Cookie":c.clearCustomerCookie(request)}});
  }catch(error){return c.customerFailure(error);}
 },
}}});
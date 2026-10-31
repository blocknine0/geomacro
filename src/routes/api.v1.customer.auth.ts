import { createFileRoute } from "@tanstack/react-router";
import { authenticatedCustomer, customerAuthClient, clearCustomerCookie,
 customerFailure, customerHeaders, customerSessionCookie, rejectCrossOrigin,
 CustomerError } from "../lib/customer-auth.server";
import { enrollCustomer } from "../lib/customer-commercial.server";
const JSON_HEADERS={...customerHeaders(),"Content-Type":"application/json"};
async function bodyOf(request:Request){
 if(Number(request.headers.get("content-length")??0)>2048)throw new CustomerError(413,"CUSTOMER_BODY_TOO_LARGE");
 const raw=await request.text();
 if(raw.length>2048)throw new CustomerError(413,"CUSTOMER_BODY_TOO_LARGE");
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{throw new CustomerError(400,"CUSTOMER_JSON_REQUIRED");}
 if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")
  throw new CustomerError(400,"CUSTOMER_JSON_REQUIRED");
 return parsed as Record<string,unknown>;
}
export const Route=createFileRoute("/api/v1/customer/auth")({
 server:{handlers:{
  GET:async({request}:{request:Request})=>{
   try{
    const user=await authenticatedCustomer(request);
    return Response.json({ok:true,user},{headers:JSON_HEADERS});
   }catch(error){return customerFailure(error);}
  },
  POST:async({request}:{request:Request})=>{
   try{
    rejectCrossOrigin(request);
    const body=await bodyOf(request);
    if(body.action==="start"){
     const email=String(body.email??"").trim().toLowerCase();
     if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
      throw new CustomerError(400,"CUSTOMER_EMAIL_INVALID");
     const {error}=await customerAuthClient().auth.signInWithOtp({
      email,options:{shouldCreateUser:true},
     });
     if(error)throw new CustomerError(503,"CUSTOMER_OTP_UNAVAILABLE");
     return Response.json({ok:true,code:"CUSTOMER_EMAIL_SENT_IF_ELIGIBLE"},
      {headers:JSON_HEADERS});
    }
    if(body.action==="verify"){
     const email=String(body.email??"").trim().toLowerCase();
     const otp=String(body.otp??"").trim();
     if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)||
      !/^[0-9]{6,8}$/u.test(otp))
      throw new CustomerError(400,"CUSTOMER_OTP_INVALID");
     const {data,error}=await customerAuthClient().auth.verifyOtp({
      email,token:otp,type:"email",
     });
     if(error||!data.session?.access_token||!data.user?.id||
       !data.user.email_confirmed_at)
      throw new CustomerError(401,"CUSTOMER_OTP_NOT_VERIFIED");
     // Create a principal identity, NEVER a credit pool or funded entitlement.
     await enrollCustomer(data.user.id);
     const cookie=customerSessionCookie(data.session.access_token,request,
      data.session.expires_in??3600);
     return Response.json({ok:true,user:{email:data.user.email}},
      {headers:{...JSON_HEADERS,"Set-Cookie":cookie}});
    }
    throw new CustomerError(400,"CUSTOMER_AUTH_ACTION_INVALID");
   }catch(error){return customerFailure(error);}
  },
  DELETE:async({request}:{request:Request})=>{
   try{rejectCrossOrigin(request);
    return Response.json({ok:true},{headers:{
     ...JSON_HEADERS,"Set-Cookie":clearCustomerCookie(request),
    }});
   }catch(error){return customerFailure(error);}
  },
 }},
});

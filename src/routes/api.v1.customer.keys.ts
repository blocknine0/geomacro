import {createFileRoute} from "@tanstack/react-router";
export const Route=createFileRoute("/api/v1/customer/keys")({server:{handlers:{
 POST:async({request}:{request:Request})=>{
  const c=await import("../lib/customer-auth.server");
  try{
   c.rejectCrossOrigin(request);
   const {issueCustomerKey}=await import("../lib/customer-commercial.server");
   return Response.json(await issueCustomerKey(request),{headers:c.customerHeaders()});
  }catch(error){return c.customerFailure(error);}
 },
 DELETE:async({request}:{request:Request})=>{
  const c=await import("../lib/customer-auth.server");
  try{
   c.rejectCrossOrigin(request);const body=await c.customerBody(request);
   if(typeof body.key_id!=="string")throw new c.CustomerError(400,"INVALID_KEY_ID");
   const {revokeCustomerKey}=await import("../lib/customer-commercial.server");
   return Response.json(await revokeCustomerKey(request,body.key_id),{headers:c.customerHeaders()});
  }catch(error){return c.customerFailure(error);}
 },
}}});
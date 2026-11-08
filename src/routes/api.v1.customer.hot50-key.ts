import {createFileRoute} from "@tanstack/react-router";
/** Only a verified D1 session can request a new secret; never accept user_id. */
export const Route=createFileRoute("/api/v1/customer/hot50-key")({
 server:{handlers:{
  POST:async({request}:{request:Request})=>{
   const c=await import("../lib/customer-auth.server");
   try {
    c.rejectCrossOrigin(request);
    const result=await c.callCustomerWorker(request,"hot50-key-create",{
      session_token:c.customerSessionToken(request),
    });
    return Response.json(result,{headers:c.customerHeaders()});
   }catch(error){return c.customerFailure(error);}
  },
 }}
});

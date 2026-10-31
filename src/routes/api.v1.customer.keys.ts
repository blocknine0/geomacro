import {createFileRoute} from "@tanstack/react-router";
import {authenticatedCustomer,customerFailure,customerHeaders,
 rejectCrossOrigin,CustomerError} from "../lib/customer-auth.server";
import {issueCustomerKey,revokeCustomerKey} from "../lib/customer-commercial.server";
export const Route=createFileRoute("/api/v1/customer/keys")({
 server:{handlers:{
  POST:async({request}:{request:Request})=>{
   try{
    rejectCrossOrigin(request);
    const user=await authenticatedCustomer(request);
    const created=await issueCustomerKey(user.id);
    return Response.json({ok:true,...created},{headers:customerHeaders()});
   }catch(e){return customerFailure(e);}
  },
  DELETE:async({request}:{request:Request})=>{
   try{
    rejectCrossOrigin(request);
    const user=await authenticatedCustomer(request);
    if(Number(request.headers.get("content-length")??0)>1024)
      throw new CustomerError(413,"KEY_REVOKE_BODY_TOO_LARGE");
    const raw=await request.text();
    if(raw.length>1024)throw new CustomerError(413,"KEY_REVOKE_BODY_TOO_LARGE");
    let body:unknown;
    try{body=JSON.parse(raw);}catch{throw new CustomerError(400,"KEY_REVOKE_JSON_REQUIRED");}
    if(!body||typeof body!=="object"||Array.isArray(body))
      throw new CustomerError(400,"KEY_REVOKE_JSON_REQUIRED");
    const keyId=(body as {key_id?:unknown}).key_id;
    if(typeof keyId!=="string")throw new CustomerError(400,"INVALID_KEY_ID");
    return Response.json({ok:true,...await revokeCustomerKey(user.id,keyId)},
      {headers:customerHeaders()});
   }catch(e){return customerFailure(e);}
  },
 }},
});

import {createFileRoute} from "@tanstack/react-router";
export const Route=createFileRoute("/api/v1/customer/account")({server:{handlers:{
 GET:async({request}:{request:Request})=>{
  const c=await import("../lib/customer-auth.server");
  try{
   const {readCustomerAccount}=await import("../lib/customer-commercial.server");
   return Response.json(await readCustomerAccount(request),{headers:c.customerHeaders()});
  }catch(error){return c.customerFailure(error);}
 },
}}});
import {createFileRoute} from "@tanstack/react-router";
import {authenticatedCustomer,customerFailure,customerHeaders} from "../lib/customer-auth.server";
import {readCustomerAccount} from "../lib/customer-commercial.server";
export const Route=createFileRoute("/api/v1/customer/account")({
 server:{handlers:{
  GET:async({request}:{request:Request})=>{
   try{
    const user=await authenticatedCustomer(request);
    const account=await readCustomerAccount(user.id);
    return Response.json({ok:true,user:{email:user.email},...account},
     {headers:customerHeaders()});
   }catch(e){return customerFailure(e);}
  },
 }},
});

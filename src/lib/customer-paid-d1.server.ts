import process from "node:process";
import {callCustomerWorker,CustomerError} from "./customer-auth.server";
import {GEOMACRO_CREDIT_COSTS,type GeomacroCreditCapability} from "./commercial-access-contract";

/**
 * P0-1B prepared D1 bridge, intentionally NOT plugged into the legacy
 * commercial/testnet/A2A orchestration paths. Do not charge before a prepared,
 * source-qualified response and verified owner launch approval.
 * The SSR token is never exposed to the caller; no independent price is sent.
 */
function ready() {
 if(process.env.GEOMACRO_CUSTOMER_PAID_SSR_ACCEPTANCE!=="ACCEPTED_D1_PAID_API_SSR")
   throw new CustomerError(503,"CUSTOMER_PAID_SSR_NOT_ACCEPTED");
}
function capabilityOf(capability:string):GeomacroCreditCapability {
 if(!Object.prototype.hasOwnProperty.call(GEOMACRO_CREDIT_COSTS,capability))
   throw new CustomerError(400,"CUSTOMER_PAID_CAPABILITY_INVALID");
 return capability as GeomacroCreditCapability;
}
function tokenOf(request:Request):string {
 const match=request.headers.get("authorization")?.match(/^Bearer\s+(gmk_live_[a-f0-9]{64})$/);
 if(!match)throw new CustomerError(401,"CUSTOMER_PAID_API_KEY_REQUIRED");
 return match[1];
}
export async function authorizeD1PaidCustomerCapability(request:Request,capability:string){
 ready();return callCustomerWorker(request,"paid-authorize",{
  api_key:tokenOf(request),capability:capabilityOf(capability),
 });
}
export async function debitD1PaidCustomerCapability(request:Request,capability:string,requestId:string){
 ready();
 if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/.test(requestId))
  throw new CustomerError(400,"CUSTOMER_PAID_REQUEST_ID_INVALID");
 return callCustomerWorker(request,"paid-debit",{
  api_key:tokenOf(request),capability:capabilityOf(capability),request_id:requestId,
 });
}

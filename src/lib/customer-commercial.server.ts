import {callCustomerWorker,customerSessionToken} from "./customer-auth.server";

// Owner identity is derived from the opaque session inside D1, never from a
// caller-supplied user ID. No paid RPC, principal enrollment, or credit mint.
export async function readCustomerAccount(request:Request){
 return callCustomerWorker(request,"account",{session_token:customerSessionToken(request)});
}
export async function issueCustomerKey(request:Request){
 // Worker mints keys only after canonical paid-runtime acceptance and verified funded grant.
 return callCustomerWorker(request,"key-create",{session_token:customerSessionToken(request)});
}
export async function revokeCustomerKey(request:Request,keyId:string){
 return callCustomerWorker(request,"key-revoke",{session_token:customerSessionToken(request),key_id:keyId});
}
import {verifyMessage} from "ethers";
import {authenticatedCustomer,callCustomerWorker,customerSessionToken,CustomerError} from "./customer-auth.server";

const ADDRESS=/^0x[0-9a-f]{40}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SIGNATURE=/^0x[0-9a-f]{130}$/iu;

export function customerWalletLinkMessage(email:string,address:string,nonce:string,issuedAt:string){
 return `GeoMacro wallet link v1\nEmail: ${email.toLowerCase()}\nWallet: ${address.toLowerCase()}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

export async function bindCustomerWallet(request:Request,input:Record<string,unknown>){
 const allowed=["action","wallet_address","signature","nonce","issued_at"];
 if(Object.keys(input).some(key=>!allowed.includes(key))||
   typeof input.wallet_address!=="string"||typeof input.signature!=="string"||
   typeof input.nonce!=="string"||typeof input.issued_at!=="string")
  throw new CustomerError(400,"CUSTOMER_WALLET_BINDING_INVALID");
 const address=input.wallet_address.toLowerCase(),nonce=input.nonce,issuedAt=input.issued_at;
 if(!ADDRESS.test(address)||!SIGNATURE.test(input.signature)||!UUID.test(nonce)||
   !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(issuedAt))
  throw new CustomerError(400,"CUSTOMER_WALLET_BINDING_INVALID");
 const timestamp=Date.parse(issuedAt);
 if(!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>5*60_000)
  throw new CustomerError(400,"CUSTOMER_WALLET_SIGNATURE_EXPIRED");
 const user=await authenticatedCustomer(request);
 const message=customerWalletLinkMessage(user.email,address,nonce,issuedAt);
 let signer:string;
 try{signer=verifyMessage(message,input.signature).toLowerCase();}
 catch{throw new CustomerError(401,"CUSTOMER_WALLET_SIGNATURE_INVALID");}
 if(signer!==address)throw new CustomerError(401,"CUSTOMER_WALLET_SIGNATURE_INVALID");
 return callCustomerWorker(request,"wallet-bind",{
  session_token:customerSessionToken(request),wallet_address:address,
 });
}

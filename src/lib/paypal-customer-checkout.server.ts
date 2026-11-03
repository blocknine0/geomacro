import process from "node:process";
import { CustomerError, callCustomerWorker, customerBody,
  customerSessionToken, rejectCrossOrigin, customerFailure,
} from "./customer-auth.server";
import { getCommercialLaunchState } from "./commercial-launch-gate.server";
import { configuredPayPal, createPayPalCheckoutOrder,
  captureApprovedPayPalOrderOnce, readPayPalOrderSettlementState,
  readVerifiedPayPalCapturedOrder, attestVerifiedPayPalCapture,
} from "./paypal-api.server";

const HEADERS = { "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff" } as const;
const PAYPAL_ORDER_ID=/^[A-Z0-9]{8,32}$/u;
const PAYPAL_INTENT_ID=/^gmpi_[a-f0-9-]{36}$/u;
const PAYPAL_MERCHANT_ID=/^[A-Z0-9]{8,32}$/u;
type WorkerRecord=Record<string,unknown>;
type MerchantReady={ config: NonNullable<ReturnType<typeof configuredPayPal>>;
  merchantId:string; fundingAttestationKey:string };
function reject(status:number,code:string):never{ throw new CustomerError(status,code); }

function merchantReady():MerchantReady{
  const state=getCommercialLaunchState();
  if(state.emergencyFrozen)reject(423,"CUSTOMER_PAYPAL_EMERGENCY_FREEZE_ACTIVE");
  if(!state.authorized)reject(503,"CUSTOMER_PAYPAL_LAUNCH_NOT_ACCEPTED");
  if(state.disabledProviders.includes("paypal"))
    reject(423,"CUSTOMER_PAYPAL_PROVIDER_QUARANTINED");
  const env=process.env;
  if(env.GEOMACRO_CENTRAL_SECURITY_MODE!=="enforce" ||
     env.GEOMACRO_REAL_FUNDS_SECURITY_ACK!=="I_ACCEPT_REAL_FUNDS_SECURITY_GATES" ||
     env.GEOMACRO_CUSTOMER_PAID_SSR_ACCEPTANCE!=="ACCEPTED_D1_PAID_API_SSR" ||
     env.GEOMACRO_PAYPAL_KYC_RECEIVE_ACK!=="VERIFIED_LIVE_CROSS_BORDER_MERCHANT" ||
     String(env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER??"").length<32 ||
     String(env.GEOMACRO_API_CREDENTIAL_PEPPER??"").length<32)
     reject(503,"CUSTOMER_PAYPAL_SECURITY_PREREQUISITE_MISSING");
  const config=configuredPayPal();
  const merchantId=String(env.GEOMACRO_PAYPAL_MERCHANT_ID??"");
  const fundingAttestationKey=String(env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY??"");
  if(config?.environment!=="live"||
     !PAYPAL_MERCHANT_ID.test(merchantId)||
     fundingAttestationKey.length<64)
    reject(503,"CUSTOMER_PAYPAL_MERCHANT_NOT_VERIFIED");
  return {config,merchantId,fundingAttestationKey};
}
const worker=async(request:Request,action:string,data:WorkerRecord)=>
  callCustomerWorker(request,action,{session_token:customerSessionToken(request),...data});
function exactFields(value:WorkerRecord,keys:readonly string[]):boolean{
  return Object.keys(value).every(k=>keys.includes(k))&&
    keys.every(k=>Object.hasOwn(value,k));
}
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:HEADERS});

/** Owner-authenticated, no arbitrary prices or recipient supplied by browser. */
export async function createCustomerPayPalOrder(request:Request):Promise<Response>{
 try{
  rejectCrossOrigin(request);
  const body=await customerBody(request);
  if(!exactFields(body,["sku"])||typeof body.sku!=="string")
    reject(400,"CUSTOMER_PAYPAL_SKU_INVALID");
  const ready=merchantReady();
  const intent=await worker(request,"paypal-intent-create",{sku:body.sku});
  const intentId=intent.intentId,amount=intent.amountMinorUnits;
  if(typeof intentId!=="string"||!PAYPAL_INTENT_ID.test(intentId)||
     !Number.isSafeInteger(amount)||Number(amount)<1)
    reject(503,"CUSTOMER_PAYPAL_INTENT_NOT_VERIFIED");
  // Creation is a PayPal order only, never a capture/settlement.
  const order=await createPayPalCheckoutOrder(ready.config,
    {intentId,amountMinorUnits:Number(amount)},ready.merchantId);
  await worker(request,"paypal-order-bind",{intent_id:intentId,order_id:order.orderId});
  return respond({ok:true,order_id:order.orderId,sku:body.sku,
    approval_url:order.approvalUrl,checkout_environment:"live",
    credits_funded:0,paid:false});
 } catch(error) { return customerFailure(error); }
}

/**
 * Buyer returns from approved PayPal checkout. Verify provider GET first.
 * A D1 claim fences the one and only capture attempt, including concurrency.
 * After timeout, NEVER auto-repeat provider capture; GET reconciliation only.
 */
export async function captureCustomerPayPalOrder(request:Request):Promise<Response>{
 try{
  rejectCrossOrigin(request);
  const body=await customerBody(request);
  if(!exactFields(body,["order_id"])||
     typeof body.order_id!=="string"||!PAYPAL_ORDER_ID.test(body.order_id))
    reject(400,"CUSTOMER_PAYPAL_ORDER_ID_INVALID");
  const ready=merchantReady();
  const orderId=body.order_id;
  const intent=await worker(request,"paypal-intent-read",{order_id:orderId});
  if(typeof intent.intentId!=="string"||!PAYPAL_INTENT_ID.test(intent.intentId)||
     !Number.isSafeInteger(intent.amountMinorUnits) ||
     !["bound","capture_requested","funded"].includes(String(intent.state)))
    reject(409,"CUSTOMER_PAYPAL_INTENT_NOT_PAYABLE");
  const expected={
    orderId,merchantId:ready.merchantId,intentId:intent.intentId,
    amountMinorUnits:Number(intent.amountMinorUnits),
  };
  // Start with a verified provider GET; never capture based on a network
  // exception or any unexpected provider readback.
  let state;
  try{state=await readPayPalOrderSettlementState(ready.config,expected);}
  catch{reject(503,"CUSTOMER_PAYPAL_ORDER_RECONCILIATION_REQUIRED");}
  let verified;
  if(state.state==="completed"){
    verified=state.proof;
  }else{
    if(intent.state==="funded"||intent.state==="capture_requested")
      reject(409,"CUSTOMER_PAYPAL_CAPTURE_RECONCILIATION_REQUIRED");
    const claim=await worker(request,"paypal-capture-claim",{order_id:orderId});
    if(claim.claimed!==true)
      reject(409,"CUSTOMER_PAYPAL_CAPTURE_RECONCILIATION_REQUIRED");
    try{
      await captureApprovedPayPalOrderOnce(ready.config,intent.intentId,orderId);
    }catch{
      // PayPal might have captured. Never repeat capture automatically.
      reject(503,"CUSTOMER_PAYPAL_CAPTURE_RECONCILIATION_REQUIRED");
    }
    // A successful HTTP response from capture is not settlement proof.
    try{verified=await readVerifiedPayPalCapturedOrder(ready.config,expected);}
    catch{reject(503,"CUSTOMER_PAYPAL_CAPTURE_RECONCILIATION_REQUIRED");}
  }
  const attestation=attestVerifiedPayPalCapture(verified,ready.fundingAttestationKey);
  const funding=await worker(request,"paypal-fund",{proof:verified,attestation});
  if(funding.ok!==true||typeof funding.receiptId!=="string")
    reject(503,"CUSTOMER_PAYPAL_FUNDING_UNCONFIRMED");
  return respond({ok:true,receipt_id:funding.receiptId,
    credits_funded:funding.credits,idempotent_replay:funding.idempotent_replay===true,
    settlement_verified:true});
 }catch(error){return customerFailure(error);}
}

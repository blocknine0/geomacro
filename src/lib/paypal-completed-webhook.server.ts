/**
 * Verified PayPal capture webhook -> immutable D1 checkout intent ->
 * provider GET order readback -> HMAC attested single canonical credit grant.
 *
 * The existing refund/reversal webhook remains independent and operational
 * even during an emergency freeze. No webhook triggers a provider capture.
 */
import process from "node:process";
import {configuredPayPal,verifyPayPalWebhook,
 readVerifiedPayPalCapturedOrder,attestVerifiedPayPalCapture}
 from "./paypal-api.server";
import {callCustomerWorker} from "./customer-auth.server";
import {handleVerifiedPayPalReversalWebhook,readPayPalWebhookBody}
 from "./paypal-refund-webhook.server";
import {getCommercialLaunchState} from "./commercial-launch-gate.server";

const H={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"} as const;
const ID=/^[A-Z0-9]{8,32}$/u;
const fail=(code:string,status=503)=>Response.json({
  ok:false,code,receipt_verified:false,credits_issued:false,
 },{status,headers:H});
const obj=(x:unknown):Record<string,unknown>|null=>
 x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
/** Do not log resource JSON, merchant secrets, HMAC attestations or raw PII. */
export async function handleVerifiedPayPalCommercialWebhook(
 request:Request,{fetchImpl=fetch,workerCall=callCustomerWorker}:{
  fetchImpl?:typeof fetch;workerCall?:typeof callCustomerWorker
 }={}
):Promise<Response>{
 if(request.method!=="POST"||new URL(request.url).search)
  return fail("PAYPAL_WEBHOOK_METHOD_INVALID",405);
 let event:Record<string,unknown>;
 try{
  const raw=await readPayPalWebhookBody(request.clone());
  event=obj(JSON.parse(raw))??{};
 }catch{return fail("PAYPAL_WEBHOOK_INVALID_BODY",400);}
 if(event.event_type!=="PAYMENT.CAPTURE.COMPLETED")
  return handleVerifiedPayPalReversalWebhook(request,{fetchImpl});
 const config=configuredPayPal();
 const merchantId=String(process.env.GEOMACRO_PAYPAL_MERCHANT_ID??"");
 const fundingKey=String(process.env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY??"");
 if(config?.environment!=="live"||!ID.test(merchantId)||fundingKey.length<64)
  return fail("PAYPAL_CAPTURE_WEBHOOK_MERCHANT_NOT_CONFIGURED");
 const launch=getCommercialLaunchState();
 if(!launch.authorized||launch.disabledProviders.includes("paypal"))
  return fail("PAYPAL_CAPTURE_WEBHOOK_LAUNCH_NOT_ACCEPTED");
 let verified;
 try {
  verified=await verifyPayPalWebhook({
   rawBody:await readPayPalWebhookBody(request),
   headers:request.headers,config,fetcher:fetchImpl
  });
 }catch{return fail("PAYPAL_CAPTURE_WEBHOOK_SIGNATURE_INVALID",403);}
 if(verified.eventType!=="PAYMENT.CAPTURE.COMPLETED")
  return fail("PAYPAL_CAPTURE_WEBHOOK_TYPE_MISMATCH",403);
 const resource=obj(event.resource);
 const related=obj(obj(resource?.supplementary_data)?.related_ids);
 const captureId=resource?.id,orderId=related?.order_id;
 if(typeof captureId!=="string"||!ID.test(captureId)||
    typeof orderId!=="string"||!ID.test(orderId))
  return fail("PAYPAL_CAPTURE_WEBHOOK_ORDER_REFERENCE_MISSING",422);
 // Trusted internal worker correlates order only to its original server-issued
 // intent, never a buyer email or amount from the webhook body.
 let intent;
 try{
  intent=await workerCall(request,"paypal-webhook-intent",{order_id:orderId});
 }catch{return fail("PAYPAL_CAPTURE_WEBHOOK_INTENT_READBACK_UNAVAILABLE");}
 if(typeof intent.intentId!=="string"||
    !/^gmpi_[a-f0-9-]{36}$/.test(intent.intentId)||
    !Number.isSafeInteger(intent.amountMinorUnits)||
    Number(intent.amountMinorUnits)<=0||intent.orderId!==orderId)
  return fail("PAYPAL_CAPTURE_WEBHOOK_INTENT_INVALID");
 let proof;
 try{
  proof=await readVerifiedPayPalCapturedOrder(config,{
   orderId,merchantId,intentId:intent.intentId,
   amountMinorUnits:Number(intent.amountMinorUnits)
  },fetchImpl);
 }catch{return fail("PAYPAL_CAPTURE_WEBHOOK_PROVIDER_GET_UNVERIFIED");}
 if(proof.captureId!==captureId||proof.orderId!==orderId||
    proof.merchantId!==merchantId||proof.currency!=="USD"||
    proof.environment!=="live")
  return fail("PAYPAL_CAPTURE_WEBHOOK_PROVIDER_REFERENCE_MISMATCH",403);
 const attestation=attestVerifiedPayPalCapture(proof,fundingKey);
 let funding;
 try{
  funding=await workerCall(request,"paypal-webhook-fund",{proof,attestation});
 }catch{return fail("PAYPAL_CAPTURE_WEBHOOK_ATOMIC_FUNDING_UNCONFIRMED");}
 if(funding.ok!==true||typeof funding.receiptId!=="string"||
    !Number.isSafeInteger(funding.credits)||Number(funding.credits)<1)
  return fail("PAYPAL_CAPTURE_WEBHOOK_D1_READBACK_UNCONFIRMED");
 return Response.json({ok:true,reconciled:true,
   provider:'paypal',environment:'live',receipt_id:funding.receiptId,
   credits_funded:funding.credits,
   idempotent_replay:funding.idempotent_replay===true,
   checkout_key_handoff:'OWNER_SESSION_REQUIRED',
 },{headers:H});
}

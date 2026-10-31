import process from "node:process";
import { configuredPayPal, paypalAccessToken, verifyPayPalWebhook,
  type PayPalServerConfiguration } from "./paypal-api.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const MAX_BODY = 64_000;
const ORDER_ID = /^[A-Za-z0-9-]{6,80}$/;
const CAPTURE_ID = /^[A-Za-z0-9-]{6,100}$/;
const SKU = new Set(["starter_dev","pro_analyst","business_pilot",
  "starter_pack","standard_pack","growth_pack"]);

export function livePayPalSettlementConfigured() {
  return process.env.GEOMACRO_PAYPAL_LIVE_SETTLEMENT_APPROVED === "true" &&
    process.env.GEOMACRO_PAYPAL_ENVIRONMENT === "live" &&
    Boolean(process.env.GEOMACRO_PAYPAL_MERCHANT_ID?.trim()) &&
    configuredPayPal()?.environment === "live";
}
function liveConfig() {
  if (!livePayPalSettlementConfigured()) throw Error("PAYPAL_LIVE_MERCHANT_NOT_APPROVED");
  const cfg = configuredPayPal();
  if (!cfg) throw Error("PAYPAL_CONFIGURATION_UNAVAILABLE");
  return cfg;
}
async function paypalJson(cfg:PayPalServerConfiguration,path:string,init:RequestInit={},
  fetcher:typeof fetch=fetch) {
  const token = await paypalAccessToken(cfg,fetcher);
  const response = await fetcher(cfg.baseUrl+path,{
    ...init,redirect:"manual",signal:AbortSignal.timeout(10_000),
    headers:{"Authorization":"Bearer "+token,"Accept":"application/json",
      ...(init.body?{"Content-Type":"application/json"}:{}),...(init.headers??{})},
  });
  if (!response.ok || Number(response.headers.get("content-length")??0)>64_000)
    throw Error("PAYPAL_PROVIDER_REQUEST_UNAVAILABLE");
  const body=await response.text();
  if (new TextEncoder().encode(body).byteLength>64_000)
    throw Error("PAYPAL_PROVIDER_RESPONSE_TOO_LARGE");
  const json:unknown=JSON.parse(body);
  if (!json || Array.isArray(json) || typeof json!=="object")
    throw Error("PAYPAL_PROVIDER_RESPONSE_INVALID");
  return json as Record<string,unknown>;
}
function record(value:unknown):Record<string,unknown> {
  return value && typeof value==="object" && !Array.isArray(value)
    ? value as Record<string,unknown> : {};
}
function cents(value:unknown):number|null {
  if(typeof value!=="string"||!/^(?:0|[1-9]\d*)\.\d{2}$/.test(value))return null;
  const [whole,fraction]=value.split(".");
  const parsed=Number(whole)*100+Number(fraction);
  return Number.isSafeInteger(parsed) && parsed>0 ? parsed:null;
}
function merchantId() {
  const id=process.env.GEOMACRO_PAYPAL_MERCHANT_ID?.trim();
  if(!id||! /^[A-Za-z0-9]{6,32}$/.test(id))
    throw Error("PAYPAL_MERCHANT_ID_NOT_VERIFIED");
  return id;
}

/** A hosted approve link is issued only after provider order creation and
 * durable order-id binding. This function never captures money. */
export async function createPayPalCheckout(input:{principalId:string;sku:string},
  fetcher:typeof fetch=fetch) {
  const cfg=liveConfig(); merchantId();
  if(!SKU.has(input.sku)) throw Error("PAYPAL_SKU_INVALID");
  const db=requireRiskSupabase();
  const prepared=await db.rpc("prepare_commercial_paid_order",{
    p_principal_id:input.principalId,p_sku:input.sku,p_environment:"live",
  });
  if(prepared.error || !prepared.data) throw Error("PAYPAL_INTENT_UNAVAILABLE");
  const intent=record(prepared.data);
  const intentId=String(intent.intent_id??"");
  const amount=Number(intent.amount_usd_cents);
  if(!/^[0-9a-f-]{36}$/i.test(intentId)||!Number.isInteger(amount)||amount<100)
    throw Error("PAYPAL_INTENT_INVALID");
  const order=await paypalJson(cfg,"/v2/checkout/orders",{
    method:"POST",headers:{"PayPal-Request-Id":intentId},
    body:JSON.stringify({
      intent:"CAPTURE",
      purchase_units:[{
        reference_id:intentId,custom_id:intentId,invoice_id:"GM-"+intentId,
        description:"GeoMacro "+input.sku,
        amount:{currency_code:"USD",value:(amount/100).toFixed(2)},
      }],
      payment_source:{paypal:{experience_context:{
        return_url:"https://geomacro.live/pricing?payment=approved",
        cancel_url:"https://geomacro.live/pricing?payment=cancelled",
        user_action:"PAY_NOW",
      }}},
    }),
  },fetcher);
  const id=String(order.id??"");
  const approval=Array.isArray(order.links)?order.links
    .map(record).find(link=>link.rel==="approve"||link.rel==="payer-action")?.href:null;
  if(!ORDER_ID.test(id)||typeof approval!=="string"||
      !/^https:\/\/(?:www\.)?paypal\.com\//.test(approval))
    throw Error("PAYPAL_ORDER_RESPONSE_INVALID");
  const bound=await db.rpc("bind_commercial_paypal_order",{
    p_intent_id:intentId,p_order_id:id,
  });
  if(bound.error || !record(bound.data).ok) throw Error("PAYPAL_ORDER_BIND_FAILED");
  return {ok:true,order_id:id,approve_url:approval,sku:input.sku,
    amount_usd_cents:amount,credits:Number(intent.credits),
    payment_status:"BUYER_APPROVAL_REQUIRED",funded:false};
}

/** Fresh provider GETs prove capture, merchant, USD amount and immutable SKU
 * binding, independent of the webhook's untrusted resource payload. */
export async function reconcileCompletedPayPalCapture(captureId:string,
  fetcher:typeof fetch=fetch) {
  const cfg=liveConfig();
  if(!CAPTURE_ID.test(captureId))throw Error("PAYPAL_CAPTURE_ID_INVALID");
  const capture=await paypalJson(cfg,"/v2/payments/captures/"+captureId,{},fetcher);
  const amount=record(capture.amount);
  const orderId=String(record(capture.supplementary_data).related_ids &&
    record(record(capture.supplementary_data).related_ids).order_id || "");
  const paid=cents(amount.value);
  if(capture.id!==captureId || capture.status!=="COMPLETED" ||
     amount.currency_code!=="USD" || paid===null || !ORDER_ID.test(orderId))
    throw Error("PAYPAL_CAPTURE_NOT_SETTLED");
  const order=await paypalJson(cfg,"/v2/checkout/orders/"+orderId,{},fetcher);
  const units=Array.isArray(order.purchase_units)?order.purchase_units:[];
  if(order.id!==orderId||units.length!==1)
    throw Error("PAYPAL_ORDER_READBACK_INVALID");
  const unit=record(units[0]), payee=record(unit.payee);
  if(payee.merchant_id!==merchantId() ||
     record(unit.amount).currency_code!=="USD" ||
     cents(record(unit.amount).value)!==paid)
    throw Error("PAYPAL_MERCHANT_OR_AMOUNT_MISMATCH");
  const db=requireRiskSupabase();
  const lookup=await db.from("commercial_paid_order_intents")
    .select("id,principal_id,provider_environment,usd_cents,state")
    .eq("provider_order_id",orderId).maybeSingle();
  const intent=lookup.data;
  if(lookup.error || !intent || intent.provider_environment!=="live" ||
     !["provider_order_created","settled"].includes(intent.state) ||
     unit.custom_id!==intent.id || intent.usd_cents!==paid)
    throw Error("PAYPAL_IMMUTABLE_INTENT_MISMATCH");
  const capturedAt=String(capture.create_time??"");
  if(!Number.isFinite(Date.parse(capturedAt))) throw Error("PAYPAL_CAPTURE_TIME_INVALID");
  const funded=await db.rpc("settle_commercial_paypal_credits",{
    p_order_id:orderId,p_capture_id:captureId,p_usd_cents:paid,
    p_currency:"USD",p_captured_at:capturedAt,
  });
  if(funded.error || !record(funded.data).ok)
    throw Error("PAYPAL_CREDIT_SETTLEMENT_UNAVAILABLE");
  return {ok:true,settlement:record(funded.data),capture_id:captureId};
}

/** Capture only a server-bound, user-owned PayPal order. Webhook processing
 * repeats the same provider readbacks, so synchronous retries are safe. */
export async function captureApprovedPayPalOrder(input:{
  principalId:string;orderId:string}, fetcher:typeof fetch=fetch) {
  const cfg=liveConfig();
  if(!ORDER_ID.test(input.orderId)) throw Error("PAYPAL_ORDER_ID_INVALID");
  const db=requireRiskSupabase();
  const lookup=await db.from("commercial_paid_order_intents")
    .select("id,principal_id,provider_environment,state")
    .eq("provider_order_id",input.orderId).maybeSingle();
  const intent=lookup.data;
  if(lookup.error || !intent || intent.principal_id!==input.principalId ||
     intent.provider_environment!=="live" ||
     !["provider_order_created","settled"].includes(intent.state))
    throw Error("PAYPAL_ORDER_NOT_OWNED");
  if(intent.state==="settled")return {ok:true,idempotent_replay:true,funded:true};
  const completion=await paypalJson(cfg,"/v2/checkout/orders/"+input.orderId+"/capture",{
    method:"POST",headers:{"PayPal-Request-Id":intent.id},body:"{}",
  },fetcher);
  if(completion.status!=="COMPLETED")throw Error("PAYPAL_CAPTURE_NOT_COMPLETED");
  const units=Array.isArray(completion.purchase_units)?completion.purchase_units:[];
  const payments=record(record(units[0]).payments);
  const captures=Array.isArray(payments.captures)?payments.captures:[];
  if(captures.length!==1 || !CAPTURE_ID.test(String(record(captures[0]).id??"")))
    throw Error("PAYPAL_CAPTURE_DETAILS_INVALID");
  const result=await reconcileCompletedPayPalCapture(String(record(captures[0]).id),fetcher);
  return {ok:true,funded:true,...result};
}

/** Verified full refunds suspend the associated credits. Partial refund
 * handling is deliberately held for manual reconciliation; it never issues
 * additional credits or reports a successful refund recovery. */
export async function reconcileCompletedPayPalRefund(refundId:string,
  fetcher:typeof fetch=fetch) {
  const cfg=liveConfig();
  if(!CAPTURE_ID.test(refundId))throw Error("PAYPAL_REFUND_ID_INVALID");
  const refund=await paypalJson(cfg,"/v2/payments/refunds/"+refundId,{},fetcher);
  const related=record(record(refund.supplementary_data).related_ids);
  const captureId=related.capture_id;
  const amount=record(refund.amount);
  if(refund.id!==refundId || refund.status!=="COMPLETED" ||
     typeof captureId!=="string" || !CAPTURE_ID.test(captureId) ||
     amount.currency_code!=="USD" || cents(amount.value)===null)
    throw Error("PAYPAL_REFUND_READBACK_INVALID");
  const db=requireRiskSupabase();
  const existing=await db.from("commercial_paid_credit_receipts")
    .select("id,paid_usd_cents,provider_capture_id")
    .eq("provider_capture_id",captureId).maybeSingle();
  if(existing.error || !existing.data)
    throw Error("PAYPAL_REFUND_RECEIPT_NOT_FOUND");
  // Suspend immediately only for a full, provider-confirmed refund. A
  // partially-refunded order requires an explicit operator reconciliation.
  if(existing.data.paid_usd_cents!==cents(amount.value))
    throw Error("PAYPAL_PARTIAL_REFUND_MANUAL_REVIEW_REQUIRED");
  const revoked=await db.rpc("revoke_refunded_paypal_credits",{
    p_capture_id:captureId,p_refund_id:refundId,
  });
  if(revoked.error || !record(revoked.data).ok)
    throw Error("PAYPAL_REFUND_REVOKE_FAILED");
  return {ok:true,refund_reconciled:true,credits_suspended:true,
    idempotent_replay:record(revoked.data).idempotent_replay===true};
}

/** Reject unsupported webhook events. Only signed, live, separately read-back
 * captures can ever invoke the credit ledger RPC. */
export async function handlePayPalPaidWebhook(rawBody:string,headers:Headers,
  fetcher:typeof fetch=fetch) {
  if(new TextEncoder().encode(rawBody).byteLength>MAX_BODY)
    throw Error("PAYPAL_WEBHOOK_TOO_LARGE");
  const cfg=liveConfig();
  const verified=await verifyPayPalWebhook({rawBody,headers,config:cfg,fetcher});
  const body=record(JSON.parse(rawBody)),resource=record(body.resource);
  if(verified.eventType==="PAYMENT.CAPTURE.REFUNDED") {
    const refundId=resource.id;
    if(typeof refundId!=="string"||!CAPTURE_ID.test(refundId))
      throw Error("PAYPAL_REFUND_ID_INVALID");
    return {ok:true,accepted:true,awaited_refund:true,
      ...(await reconcileCompletedPayPalRefund(refundId,fetcher))};
  }
  if(verified.eventType!=="PAYMENT.CAPTURE.COMPLETED")
    return {ok:true,accepted:false,reason:"EVENT_NOT_FUNDABLE"};
  const captureId=resource.id;
  if(typeof captureId!=="string"||!CAPTURE_ID.test(captureId))
    throw Error("PAYPAL_CAPTURE_ID_INVALID");
  return {ok:true,accepted:true,awaited_capture:true,
    ...(await reconcileCompletedPayPalCapture(captureId,fetcher))};
}

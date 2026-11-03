import process from "node:process";
import { createHash, createHmac } from "node:crypto";
import { GEOMACRO_PAYPAL_READINESS } from "./paypal-checkout-readiness";

export type PayPalEnvironment = "sandbox" | "live";
const PAYPAL_API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const MAX_NETWORK_RESPONSE_BYTES = 16 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_WEBHOOK_CLOCK_SKEW_MS = 5 * 60_000;
const SAFE_OAUTH_TOKEN = /^[!-~]{1,4096}$/;
const SAFE_VALUE = /^[^\u0000-\u001f\u007f]{1,512}$/;

export type PayPalServerConfiguration = Readonly<{
  environment: PayPalEnvironment;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId: string;
}>;

export function paypalEnvironment(): PayPalEnvironment {
  return process.env.GEOMACRO_PAYPAL_ENVIRONMENT === "live" ? "live" : "sandbox";
}

export function paypalPublicConnectionStatus() {
  const environment = paypalEnvironment();
  const credentials_present = Boolean(
    process.env.GEOMACRO_PAYPAL_CLIENT_ID?.trim() &&
    process.env.GEOMACRO_PAYPAL_CLIENT_SECRET?.trim(),
  );
  const webhook_id_present = Boolean(process.env.GEOMACRO_PAYPAL_WEBHOOK_ID?.trim());
  return {
    ...GEOMACRO_PAYPAL_READINESS,
    environment,
    credentials_present,
    webhook_id_present,
    // Presence of secrets never proves provider activation or good standing.
    merchant_credentials_verified: false as const,
    active_checkout_enabled: false as const,
  };
}

export function configuredPayPal(): PayPalServerConfiguration | null {
  const environment = paypalEnvironment();
  const clientId = process.env.GEOMACRO_PAYPAL_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GEOMACRO_PAYPAL_CLIENT_SECRET?.trim() || "";
  const webhookId = process.env.GEOMACRO_PAYPAL_WEBHOOK_ID?.trim() || "";
  if (![clientId, clientSecret, webhookId].every(value => SAFE_VALUE.test(value)))
    return null;
  return { environment, baseUrl: PAYPAL_API_BASE[environment], clientId, clientSecret, webhookId };
}

async function paypalJson(response: Response): Promise<Record<string, unknown>> {
  // Workerd rejects redirect:"error" before the network request. Use
  // redirect:"manual" at each fixed PayPal API endpoint, then explicitly
  // refuse *all* redirects so tokens/signatures cannot cross origins.
  if (response.status >= 300 && response.status < 400)
    throw new Error("PAYPAL_PROVIDER_REDIRECT_REJECTED");
  if (!response.ok) throw new Error("PAYPAL_PROVIDER_REQUEST_FAILED");
  if (Number(response.headers.get("content-length") || 0) > MAX_NETWORK_RESPONSE_BYTES)
    throw new Error("PAYPAL_PROVIDER_RESPONSE_TOO_LARGE");
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_NETWORK_RESPONSE_BYTES)
    throw new Error("PAYPAL_PROVIDER_RESPONSE_TOO_LARGE");
  const json: unknown = JSON.parse(body);
  if (!json || Array.isArray(json) || typeof json !== "object")
    throw new Error("PAYPAL_PROVIDER_RESPONSE_INVALID");
  return json as Record<string, unknown>;
}

/** Server-only OAuth; never expose client secrets or access tokens via discovery. */
export async function paypalAccessToken(config: PayPalServerConfiguration, fetcher: typeof fetch = fetch) {
  const tokenEndpoint = config.baseUrl + "/v1/oauth2/token";
  const response = await fetcher(tokenEndpoint, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: "grant_type=client_credentials",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await paypalJson(response);
  if (typeof json.access_token !== "string" || !SAFE_OAUTH_TOKEN.test(json.access_token))
    throw new Error("PAYPAL_OAUTH_RESPONSE_INVALID");
  return json.access_token;
}

function requiredHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();
  if (!value || !SAFE_VALUE.test(value)) throw new Error("PAYPAL_WEBHOOK_HEADERS_INVALID");
  return value;
}

/**
 * Verify with PayPal's trusted signature-verification API before ANY payment
 * receipt processing. Verification does not create a credit entitlement.
 * The exact event must also be reconciled with a durable provider-capture
 * readback and the original immutable server-side SKU before funding.
 */
export async function verifyPayPalWebhook(input: {
  rawBody: string;
  headers: Headers;
  config: PayPalServerConfiguration;
  fetcher?: typeof fetch;
  now?: number;
}): Promise<{ verified: true; eventId: string; eventType: string }> {
  const { rawBody, headers, config } = input;
  const fetcher = input.fetcher ?? fetch;
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BODY_BYTES)
    throw new Error("PAYPAL_WEBHOOK_TOO_LARGE");
  const event: unknown = JSON.parse(rawBody);
  if (!event || Array.isArray(event) || typeof event !== "object")
    throw new Error("PAYPAL_WEBHOOK_BODY_INVALID");
  const parsed = event as Record<string, unknown>;
  const eventId = parsed.id;
  const eventType = parsed.event_type;
  if (typeof eventId !== "string" || !SAFE_VALUE.test(eventId) ||
      typeof eventType !== "string" || !SAFE_VALUE.test(eventType))
    throw new Error("PAYPAL_WEBHOOK_EVENT_INVALID");
  const timestamp = requiredHeader(headers, "paypal-transmission-time");
  const transmittedAt = Date.parse(timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(transmittedAt) || Math.abs(now - transmittedAt) > MAX_WEBHOOK_CLOCK_SKEW_MS)
    throw new Error("PAYPAL_WEBHOOK_TIMESTAMP_STALE");
  const certUrl = requiredHeader(headers, "paypal-cert-url");
  // Refuse non-PayPal certificate hosts and unexpected schemes; never fetch
  // the supplied certificate URL directly.
  const cert = new URL(certUrl);
  if (cert.protocol !== "https:" || cert.port || cert.username || cert.password ||
      !["api.paypal.com", "api.sandbox.paypal.com", "api-m.paypal.com", "api-m.sandbox.paypal.com"].includes(cert.hostname) ||
      !cert.pathname.startsWith("/v1/notifications/certs/"))
    throw new Error("PAYPAL_WEBHOOK_CERT_URL_INVALID");
  const accessToken = await paypalAccessToken(config, fetcher);
  const verification = await fetcher(config.baseUrl + "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      auth_algo: requiredHeader(headers, "paypal-auth-algo"),
      cert_url: certUrl,
      transmission_id: requiredHeader(headers, "paypal-transmission-id"),
      transmission_sig: requiredHeader(headers, "paypal-transmission-sig"),
      transmission_time: timestamp,
      webhook_id: config.webhookId,
      webhook_event: parsed,
    }),
  });
  const result = await paypalJson(verification);
  if (result.verification_status !== "SUCCESS")
    throw new Error("PAYPAL_WEBHOOK_SIGNATURE_INVALID");
  return { verified: true, eventId, eventType };
}


/**
 * Independent, read-only PayPal Orders v2 capture readback.
 * NEVER accept a browser capture reference as settlement proof. Caller must
 * supply an existing server-owned D1 checkout intent and its locked USD cents.
 * This module does NOT create/capture an order or fund an entitlement.
 */
const PAYPAL_ORDER_ID = /^[A-Z0-9]{8,32}$/;
const PAYPAL_CAPTURE_ID = /^[A-Z0-9]{8,32}$/;
const PAYPAL_MERCHANT_ID = /^[A-Z0-9]{8,32}$/;
const PAYPAL_INTENT_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,95}$/;
type PayPalRecord = Record<string,unknown>;
function object(value: unknown): PayPalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("PAYPAL_CAPTURE_PROOF_INVALID");
  return value as PayPalRecord;
}
function exactUsdCents(input: unknown): number {
  if (typeof input !== "string" || !/^(?:0|[1-9][0-9]{0,7})\.[0-9]{2}$/.test(input))
    throw Error("PAYPAL_CAPTURE_AMOUNT_INVALID");
  const cents = Number(input.slice(0,-3)) * 100 + Number(input.slice(-2));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw Error("PAYPAL_CAPTURE_AMOUNT_INVALID");
  return cents;
}
export type VerifiedPayPalCapture = Readonly<{
  environment: PayPalEnvironment;
  provider: "paypal";
  orderId: string;
  captureId: string;
  merchantId: string;
  intentId: string;
  currency: "USD";
  amountMinorUnits: number;
  settledAt: string;
  verificationSha256: string;
}>;
export function validateCompletedPayPalCapture(
  payload: unknown,
  expected: Readonly<{
    environment: PayPalEnvironment;
    orderId: string;
    merchantId: string;
    intentId: string;
    amountMinorUnits: number;
  }>,
): VerifiedPayPalCapture {
  if (!PAYPAL_ORDER_ID.test(expected.orderId) ||
      !PAYPAL_MERCHANT_ID.test(expected.merchantId) ||
      !PAYPAL_INTENT_ID.test(expected.intentId) ||
      !Number.isSafeInteger(expected.amountMinorUnits) || expected.amountMinorUnits < 1)
    throw Error("PAYPAL_CAPTURE_EXPECTATION_INVALID");
  const order = object(payload);
  if (order.id !== expected.orderId || order.status !== "COMPLETED" ||
      order.intent !== "CAPTURE")
    throw Error("PAYPAL_CAPTURE_ORDER_NOT_COMPLETED");
  const units = order.purchase_units;
  if (!Array.isArray(units) || units.length !== 1)
    throw Error("PAYPAL_CAPTURE_PURCHASE_UNITS_INVALID");
  const unit = object(units[0]);
  const payee = object(unit.payee);
  const amount = object(unit.amount);
  if (payee.merchant_id !== expected.merchantId ||
      unit.custom_id !== expected.intentId ||
      unit.invoice_id !== expected.intentId ||
      amount.currency_code !== "USD" ||
      exactUsdCents(amount.value) !== expected.amountMinorUnits)
    throw Error("PAYPAL_CAPTURE_INTENT_PRICE_PAYEE_MISMATCH");
  const payments = object(unit.payments);
  const captures = payments.captures;
  if (!Array.isArray(captures) || captures.length !== 1 ||
      (payments.refunds !== undefined &&
       (!Array.isArray(payments.refunds) || payments.refunds.length !== 0)))
    throw Error("PAYPAL_CAPTURE_MULTIPLE_OR_REFUNDED");
  const capture = object(captures[0]);
  const settledAt = capture.update_time;
  if (typeof capture.id !== "string" ||
      !PAYPAL_CAPTURE_ID.test(capture.id) ||
      capture.status !== "COMPLETED" ||
      capture.final_capture !== true ||
      typeof settledAt !== "string" ||
      !Number.isFinite(Date.parse(settledAt)))
    throw Error("PAYPAL_CAPTURE_NOT_FINAL");
  const capturedAmount = object(capture.amount);
  if (capturedAmount.currency_code !== "USD" ||
      exactUsdCents(capturedAmount.value) !== expected.amountMinorUnits)
    throw Error("PAYPAL_CAPTURE_SETTLED_AMOUNT_MISMATCH");
  const proofFields = {
    schema: "geomacro.paypal-verified-capture.v1",
    provider: "paypal" as const,
    environment: expected.environment,
    orderId: expected.orderId, captureId: capture.id,
    merchantId: expected.merchantId, intentId: expected.intentId,
    currency: "USD" as const, amountMinorUnits: expected.amountMinorUnits,
    settledAt,
  };
  const verificationSha256 = createHash("sha256")
    .update(JSON.stringify(proofFields)).digest("hex");
  return { ...proofFields, verificationSha256 };
}
export async function readVerifiedPayPalCapturedOrder(
  config: PayPalServerConfiguration,
  expected: Readonly<{
    orderId: string; merchantId: string;
    intentId: string; amountMinorUnits: number;
  }>,
  fetcher: typeof fetch = fetch,
): Promise<VerifiedPayPalCapture> {
  if (!PAYPAL_ORDER_ID.test(expected.orderId)) throw Error("PAYPAL_CAPTURE_ORDER_ID_INVALID");
  const token = await paypalAccessToken(config,fetcher);
  const response = await fetcher(
    config.baseUrl + "/v2/checkout/orders/" + expected.orderId, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    },
  );
  const body = await paypalJson(response);
  return validateCompletedPayPalCapture(body,{...expected,environment:config.environment});
}

/**
 * Read the exact PayPal order BEFORE deciding whether capture is allowed.
 * A malformed or already-completed but mismatched order MUST NEVER be
 * submitted for a second capture.
 */
export async function readPayPalOrderSettlementState(
  config: PayPalServerConfiguration,
  expected: Readonly<{
    orderId:string;merchantId:string;intentId:string;amountMinorUnits:number;
  }>,
  fetcher:typeof fetch=fetch,
):Promise<{state:"approved"}|{state:"completed";proof:VerifiedPayPalCapture}> {
  if(config.environment!=="live"||!PAYPAL_ORDER_ID.test(expected.orderId)||
     !PAYPAL_MERCHANT_ID.test(expected.merchantId)||
     !PAYPAL_INTENT_ID.test(expected.intentId)||
     !Number.isSafeInteger(expected.amountMinorUnits)||expected.amountMinorUnits<1)
    throw Error("PAYPAL_ORDER_READBACK_EXPECTATION_INVALID");
  const token=await paypalAccessToken(config,fetcher);
  const order=await paypalJson(await fetcher(
    config.baseUrl+"/v2/checkout/orders/"+expected.orderId,{
      method:"GET",redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS),
      headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    },
  ));
  if(order.id!==expected.orderId||order.intent!=="CAPTURE"||
     !Array.isArray(order.purchase_units)||order.purchase_units.length!==1)
    throw Error("PAYPAL_ORDER_IDENTITY_MISMATCH");
  const unit=object(order.purchase_units[0]);
  const payee=object(unit.payee);
  const amount=object(unit.amount);
  if(unit.custom_id!==expected.intentId||unit.invoice_id!==expected.intentId||
     payee.merchant_id!==expected.merchantId||
     amount.currency_code!=="USD"||
     exactUsdCents(amount.value)!==expected.amountMinorUnits)
    throw Error("PAYPAL_ORDER_INTENT_PRICE_MERCHANT_MISMATCH");
  if(order.status==="COMPLETED")
    return {state:"completed",proof:validateCompletedPayPalCapture(order,{
      ...expected,environment:config.environment,
    })};
  if(order.status!=="APPROVED")
    throw Error("PAYPAL_ORDER_NOT_APPROVED");
  const payments=unit.payments;
  if(payments!==undefined){
    const p=object(payments);
    if((p.captures!==undefined &&
        (!Array.isArray(p.captures)||p.captures.length!==0)) ||
       (p.refunds!==undefined &&
        (!Array.isArray(p.refunds)||p.refunds.length!==0)))
      throw Error("PAYPAL_APPROVED_ORDER_HAS_SETTLEMENT");
  }
  return {state:"approved"};
}

/** Live Orders-v2 create. The supplied intent is first persisted and
 * locked by D1; no browser input may specify a price or receiver.
 */
export async function createPayPalCheckoutOrder(
  config: PayPalServerConfiguration,
  intent: Readonly<{intentId:string;amountMinorUnits:number}>,
  merchantId: string,
  fetcher: typeof fetch = fetch,
): Promise<{orderId:string;approvalUrl:string}> {
  if(config.environment!=="live"||!PAYPAL_INTENT_ID.test(intent.intentId)||
     !PAYPAL_MERCHANT_ID.test(merchantId)||
     !Number.isSafeInteger(intent.amountMinorUnits)||intent.amountMinorUnits<1)
    throw Error("PAYPAL_CREATE_INTENT_INVALID");
  const token=await paypalAccessToken(config,fetcher);
  const dollars=(intent.amountMinorUnits/100).toFixed(2);
  const order=await paypalJson(await fetcher(config.baseUrl+"/v2/checkout/orders",{
    method:"POST",redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS),
    headers:{
      Authorization:"Bearer "+token,Accept:"application/json",
      "Content-Type":"application/json",
      "PayPal-Request-Id":intent.intentId,
      Prefer:"return=representation",
    },
    body:JSON.stringify({intent:"CAPTURE",purchase_units:[{
      reference_id:intent.intentId,invoice_id:intent.intentId,
      custom_id:intent.intentId,payee:{merchant_id:merchantId},
      amount:{currency_code:"USD",value:dollars},
    }]}),
  }));
  if(typeof order.id!=="string"||!PAYPAL_ORDER_ID.test(order.id)||
     order.status!=="CREATED"||!Array.isArray(order.links))
    throw Error("PAYPAL_CREATE_ORDER_UNCONFIRMED");
  const approval=order.links.find((item:unknown)=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return false;
    const row=item as Record<string,unknown>;
    return row.rel==="approve"||row.rel==="payer-action";
  }) as {href?:unknown}|undefined;
  if(typeof approval?.href!=="string")
    throw Error("PAYPAL_APPROVAL_LINK_MISSING");
  const href=new URL(approval.href);
  if(href.protocol!=="https:" || href.username || href.password ||
     !["paypal.com","www.paypal.com"].includes(href.hostname) ||
     href.pathname!=="/checkoutnow" ||
     href.searchParams.get("token")!==order.id)
    throw Error("PAYPAL_APPROVAL_LINK_UNTRUSTED");
  return {orderId:order.id,approvalUrl:href.href};
}

/** Issuing this POST can move real money and is only permitted after the
 * independent D1 compare-and-set capture claim. Never call it for recovery:
 * ambiguous results must use the read-only GET captured-order verifier.
 */
export async function captureApprovedPayPalOrderOnce(
  config: PayPalServerConfiguration,
  intentId: string,
  orderId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if(config.environment!=="live"||!PAYPAL_INTENT_ID.test(intentId)||
     !PAYPAL_ORDER_ID.test(orderId))
    throw Error("PAYPAL_CAPTURE_SCOPE_INVALID");
  const token=await paypalAccessToken(config,fetcher);
  await paypalJson(await fetcher(
    config.baseUrl+"/v2/checkout/orders/"+orderId+"/capture",{
      method:"POST",redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS),
      headers:{
        Authorization:"Bearer "+token,Accept:"application/json",
        "Content-Type":"application/json",
        "PayPal-Request-Id":"capture-"+intentId,
      },
      body:"{}",
    },
  ));
}

/** Attest a completed PayPal GET readback for the separate D1 ledger.
 * The Worker checks this HMAC plus the immutable checkout intent before
 * granting any credit; browser-provided capture IDs are never trusted.
 */
export function attestVerifiedPayPalCapture(
  proof: VerifiedPayPalCapture,
  sharedSecret: string,
): string {
  if (typeof sharedSecret !== "string" || sharedSecret.length < 64 ||
      proof.environment !== "live" ||
      !/^[a-f0-9]{64}$/.test(proof.verificationSha256))
    throw Error("PAYPAL_CAPTURE_FUNDING_ATTESTATION_DENIED");
  const fields = [
    "geomacro.paypal-funding.v1",proof.environment,proof.orderId,
    proof.captureId,proof.merchantId,proof.intentId,
    proof.currency,String(proof.amountMinorUnits),
    proof.settledAt,proof.verificationSha256,
  ];
  return createHmac("sha256",sharedSecret).update(fields.join("\0")).digest("hex");
}

/**
 * Money-handling is intentionally absent: checkout, capture and paid credit
 * issuance must not be offered until merchant approval, an independently
 * tested durable idempotent funding ledger, and charge/refund handling exist.
 */
export const GEOMACRO_PAYPAL_FUNDS_CAPTURE_ENABLED = false as const;

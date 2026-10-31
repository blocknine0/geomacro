import process from "node:process";
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
 * Money-handling is intentionally absent: checkout, capture and paid credit
 * issuance must not be offered until merchant approval, an independently
 * tested durable idempotent funding ledger, and charge/refund handling exist.
 */
export const GEOMACRO_PAYPAL_FUNDS_CAPTURE_ENABLED = false as const;

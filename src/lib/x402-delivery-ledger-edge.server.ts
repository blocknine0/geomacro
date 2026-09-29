import process from "node:process";

const textEncoder = new TextEncoder();
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 2_500_000;

export type EdgeLedgerClaim = {
  disposition: "CLAIMED" | "REPLAY" | "IN_PROGRESS" | "CONFLICT" | "MANUAL_REVIEW";
  claim_token: string | null;
  response_payload: unknown | null;
  settlement_tx: string | null;
  settlement_network: string | null;
};

type EdgeConfig = {
  baseUrl: string;
  secret: string;
};

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

function config(): EdgeConfig | null {
  if (String(process.env.X402_LEDGER_BACKEND ?? "supabase").trim().toLowerCase() !== "edge_d1") return null;
  const raw = String(process.env.COMMERCE_LEDGER_URL ?? "").trim();
  const secret = String(process.env.COMMERCE_LEDGER_SHARED_SECRET ?? "").trim();
  if (secret.length < 32) throw new Error("COMMERCE_LEDGER_SHARED_SECRET_INVALID");
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("COMMERCE_LEDGER_URL_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("COMMERCE_LEDGER_URL_INVALID");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return { baseUrl: parsed.toString().replace(/\/$/, ""), secret };
}

export function edgeX402LedgerEnabled() {
  return config() !== null;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("EDGE_X402_LEDGER_NOT_ENABLED");
  const bodyText = JSON.stringify(body);
  const stamp = String(Math.floor(Date.now() / 1000));
  const signed = `${stamp}\nPOST\n${path}\n${await sha256(bodyText)}`;
  const signature = await hmacHex(cfg.secret, signed);
  const response = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-geomacro-timestamp": stamp,
      "x-geomacro-signature": signature,
    },
    body: bodyText,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (raw.length > MAX_RESPONSE_BYTES) throw new Error("EDGE_X402_LEDGER_RESPONSE_TOO_LARGE");
  let parsed: any;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { throw new Error(`EDGE_X402_LEDGER_INVALID_JSON_${response.status}`); }
  if (!response.ok || !parsed?.ok) {
    const code = String(parsed?.code ?? `HTTP_${response.status}`).slice(0, 120);
    throw new Error(`EDGE_X402_LEDGER_${code}`);
  }
  return parsed as T;
}

export async function claimEdgeX402Delivery(input: {
  paymentFingerprint: string;
  requestFingerprint: string;
  clientRequestId?: string | null;
  environment: "testnet" | "mainnet";
  network: string;
  asset: string;
  amountAtomic: string;
  payToHash: string;
}) {
  return post<EdgeLedgerClaim>("/v1/claim", {
    payment_fingerprint: input.paymentFingerprint,
    request_fingerprint: input.requestFingerprint,
    client_request_id: input.clientRequestId ?? null,
    environment: input.environment,
    network: input.network,
    asset: input.asset,
    amount_atomic: input.amountAtomic,
    pay_to_hash: input.payToHash,
  });
}

export async function prepareEdgeX402Delivery(input: {
  paymentFingerprint: string;
  claimToken: string;
  responsePayloadJson: string;
  responseSha256: string;
}) {
  return post<{ ok: true; response_sha256: string }>("/v1/prepare", {
    payment_fingerprint: input.paymentFingerprint,
    claim_token: input.claimToken,
    response_payload_json: input.responsePayloadJson,
    response_sha256: input.responseSha256,
  });
}

export async function completeEdgeX402Delivery(input: {
  paymentFingerprint: string;
  claimToken: string;
  payerHash: string | null;
  settlementTx: string;
  settlementNetwork: string;
}) {
  await post<{ ok: true }>("/v1/complete", {
    payment_fingerprint: input.paymentFingerprint,
    claim_token: input.claimToken,
    payer_hash: input.payerHash,
    settlement_tx: input.settlementTx,
    settlement_network: input.settlementNetwork,
  });
}

export async function releaseEdgeX402Delivery(input: {
  paymentFingerprint: string;
  claimToken: string;
  failureCode: string;
  manualReview: boolean;
}) {
  await post<{ ok: true; released: boolean }>("/v1/release", {
    payment_fingerprint: input.paymentFingerprint,
    claim_token: input.claimToken,
    failure_code: input.failureCode.slice(0, 160),
    manual_review: input.manualReview,
  });
}

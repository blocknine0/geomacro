#!/usr/bin/env node

import {
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";

const API_ORIGIN = "https://flow-api.testnet3.goat.network";
const CHAIN_ID = 48816;
const CAIP2 = "eip155:48816";
const MAX_RESPONSE_BYTES = 128 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const ADDRESS_RE = /^0x[a-f0-9]{40}$/;
const TOKEN_RE = /^[A-Z0-9][A-Z0-9._-]{1,15}$/;
const INTEGER_RE = /^(0|[1-9][0-9]{0,77})$/;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_SCALAR_RE = /^[^&=\u0000-\u001f\u007f]{1,512}$/;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

function fail(message) {
  throw new Error(message);
}

function requiredEnv(name, maxLength = 4096) {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value.length > maxLength) {
    fail(`${name} is required for the GOAT Testnet3 provider dry run`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function safeScalar(value, field) {
  const text = String(value);
  if (!SAFE_SCALAR_RE.test(text)) {
    fail(`${field} contains unsupported HMAC delimiter/control characters`);
  }
  return text;
}

function validateCredential(value, field, maxLength) {
  const text = String(value);
  if (!text || text.length > maxLength || CONTROL_CHARS_RE.test(text)) {
    fail(`${field} contains invalid credential characters or length`);
  }
  return text;
}

function signHeaders(body, apiKey, apiSecret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const safeApiKey = validateCredential(apiKey, "api_key", 512);
  const safeApiSecret = validateCredential(apiSecret, "api_secret", 2048);
  const params = {
    ...Object.fromEntries(
      Object.entries(body ?? {}).map(([key, value]) => [
        key,
        safeScalar(value, key),
      ]),
    ),
    api_key: safeApiKey,
    timestamp: safeScalar(timestamp, "timestamp"),
    nonce: safeScalar(nonce, "nonce"),
  };

  const canonical = Object.keys(params)
    .filter((key) => params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const signature = createHmac("sha256", safeApiSecret)
    .update(canonical)
    .digest("hex");

  return {
    "X-API-Key": safeApiKey,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Sign": signature,
  };
}

async function boundedJson(response) {
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    fail("GOAT returned an oversized response");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    fail("GOAT returned an oversized response");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`GOAT returned non-JSON HTTP ${response.status}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("GOAT returned a non-object JSON response");
  }
  return parsed;
}

async function publicGet(path) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await boundedJson(response);
  if (!response.ok) {
    fail(`GOAT public request failed with HTTP ${response.status}`);
  }
  return body;
}

async function merchantRequest(method, path, body, apiKey, apiSecret, expected) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...signHeaders(body ?? {}, apiKey, apiSecret),
    },
    body: body === null ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const parsed = await boundedJson(response);
  if (!expected.includes(response.status)) {
    const code = typeof parsed.code === "string" ? parsed.code : "GOAT_FLOW_ERROR";
    fail(`${code}: GOAT merchant request failed with HTTP ${response.status}`);
  }
  return { status: response.status, body: parsed };
}

function requiredString(record, key, maxLength = 512) {
  const value = record?.[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    fail(`GOAT response field ${key} is invalid`);
  }
  return value.trim();
}

function requiredInteger(record, key) {
  const value = record?.[key];
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`GOAT response field ${key} is invalid`);
  }
  return value;
}

function parseCaip(value, field) {
  const match = typeof value === "string"
    ? value.match(/^eip155:([1-9][0-9]{0,14})$/)
    : null;
  if (!match) fail(`${field} is not a valid EVM CAIP-2 network`);
  const chainId = Number(match[1]);
  if (!Number.isSafeInteger(chainId)) fail(`${field} exceeds safe integer range`);
  return chainId;
}

function normalizeChallenge(raw, expected) {
  assert(raw.x402Version === 2, "GOAT returned unsupported x402Version");
  assert(Array.isArray(raw.accepts) && raw.accepts.length === 1, "GOAT challenge must contain exactly one payment option");
  const option = raw.accepts[0];
  assert(option && typeof option === "object" && !Array.isArray(option), "GOAT payment option is invalid");

  const extra = option.extra && typeof option.extra === "object" && !Array.isArray(option.extra)
    ? option.extra
    : {};
  const extensions = raw.extensions && typeof raw.extensions === "object" && !Array.isArray(raw.extensions)
    ? raw.extensions
    : {};
  const goatExtension = extensions.goatx402 && typeof extensions.goatx402 === "object" && !Array.isArray(extensions.goatx402)
    ? extensions.goatx402
    : {};

  const orderId = requiredString(raw, "order_id", 256);
  assert(SAFE_ID_RE.test(orderId), "GOAT order_id is not safely bounded");

  const flow = typeof raw.flow === "string"
    ? raw.flow
    : typeof extra.flow === "string"
      ? extra.flow
      : "";
  assert(flow === "ERC20_DIRECT", "GOAT dry run requires ERC20_DIRECT");

  const chainId = parseCaip(option.network, "GOAT challenge network");
  assert(chainId === CHAIN_ID, "GOAT challenge chain mismatch");

  const tokenContract = typeof option.asset === "string"
    ? option.asset.trim().toLowerCase()
    : "";
  assert(ADDRESS_RE.test(tokenContract), "GOAT challenge token contract is invalid");
  assert(tokenContract === expected.token_contract, "GOAT challenge token contract mismatch");

  const payTo = typeof option.payTo === "string"
    ? option.payTo.trim().toLowerCase()
    : "";
  assert(ADDRESS_RE.test(payTo), "GOAT challenge pay_to is invalid");

  const amount = typeof option.amount === "string" ? option.amount.trim() : "";
  assert(INTEGER_RE.test(amount) && BigInt(amount) > 0n, "GOAT challenge amount is invalid");
  assert(amount === expected.amount_wei, "GOAT challenge amount mismatch");

  const tokenSymbol = typeof raw.token_symbol === "string"
    ? raw.token_symbol.trim().toUpperCase()
    : typeof extra.tokenSymbol === "string"
      ? extra.tokenSymbol.trim().toUpperCase()
      : "";
  assert(tokenSymbol === expected.token_symbol, "GOAT challenge token symbol mismatch");

  const destinationChainId = parseCaip(
    goatExtension.destinationChain,
    "GOAT challenge destination chain",
  );
  assert(destinationChainId === CHAIN_ID, "GOAT destination chain mismatch");

  const expiresAt = goatExtension.expiresAt;
  assert(
    Number.isSafeInteger(expiresAt) && expiresAt > Math.floor(Date.now() / 1000),
    "GOAT challenge expiry is invalid or expired",
  );

  return {
    x402_version: 2,
    order_id: orderId,
    dapp_order_id: expected.dapp_order_id,
    flow: "ERC20_DIRECT",
    token_symbol: tokenSymbol,
    token_contract: tokenContract,
    pay_to: payTo,
    from_address: expected.from_address,
    chain_id: chainId,
    destination_chain_id: destinationChainId,
    amount_wei: amount,
    expires_at: expiresAt,
  };
}

const apiKey = validateCredential(requiredEnv("GOATX402_API_KEY", 512), "GOATX402_API_KEY", 512);
const apiSecret = validateCredential(requiredEnv("GOATX402_API_SECRET", 2048), "GOATX402_API_SECRET", 2048);
const merchantId = requiredEnv("GOATX402_MERCHANT_ID", 128);
assert(SAFE_ID_RE.test(merchantId), "GOATX402_MERCHANT_ID is invalid");

const merchant = await publicGet(`/merchants/${encodeURIComponent(merchantId)}`);
assert(requiredString(merchant, "merchant_id", 128) === merchantId, "GOAT merchant identity mismatch");
assert(merchant.receive_type === "DIRECT", "GOAT dry run requires a DIRECT merchant");
assert(Array.isArray(merchant.wallets), "GOAT merchant wallets are unavailable");

const usdc = merchant.wallets
  .filter((wallet) => wallet && typeof wallet === "object" && !Array.isArray(wallet))
  .map((wallet) => ({
    chain_id: requiredInteger(wallet, "chain_id"),
    token_symbol: requiredString(wallet, "token_symbol", 32).toUpperCase(),
    token_contract: requiredString(wallet, "token_contract", 64).toLowerCase(),
  }))
  .filter((token) => token.chain_id === CHAIN_ID && token.token_symbol === "USDC");

assert(usdc.length === 1, "GOAT Testnet3 merchant must expose exactly one USDC token");
assert(TOKEN_RE.test(usdc[0].token_symbol), "GOAT USDC symbol is invalid");
assert(ADDRESS_RE.test(usdc[0].token_contract), "GOAT USDC contract is invalid");

const amountAtomic = (process.env.GOATX402_DRY_RUN_AMOUNT_ATOMIC ?? "1").trim();
assert(INTEGER_RE.test(amountAtomic) && BigInt(amountAtomic) > 0n, "GOAT dry-run amount must be a positive atomic integer");

// A random payer address is intentionally generated without a private key. This
// run can create/inspect a payment challenge but can never submit a transfer.
const payer = `0x${randomBytes(20).toString("hex")}`;
const dappOrderId = `geomacro-dry-${Date.now()}-${randomBytes(4).toString("hex")}`;
assert(SAFE_ID_RE.test(dappOrderId), "Generated dapp_order_id is invalid");

const orderInput = {
  dapp_order_id: dappOrderId,
  chain_id: CHAIN_ID,
  token_symbol: usdc[0].token_symbol,
  token_contract: usdc[0].token_contract,
  from_address: payer,
  amount_wei: amountAtomic,
};

const created = await merchantRequest(
  "POST",
  "/api/v1/orders",
  orderInput,
  apiKey,
  apiSecret,
  [402],
);
assert(created.status === 402, "GOAT create-order did not return HTTP 402");

const challenge = normalizeChallenge(created.body, orderInput);
const orderRead = await merchantRequest(
  "GET",
  `/api/v1/orders/${encodeURIComponent(challenge.order_id)}`,
  null,
  apiKey,
  apiSecret,
  [200],
);

const order = orderRead.body;
assert(requiredString(order, "order_id", 256) === challenge.order_id, "GOAT order read order_id mismatch");
assert(requiredString(order, "merchant_id", 128) === merchantId, "GOAT order read merchant mismatch");
assert(requiredString(order, "dapp_order_id", 128) === dappOrderId, "GOAT order read dapp_order_id mismatch");
assert(requiredInteger(order, "chain_id") === CHAIN_ID, "GOAT order read chain mismatch");
assert(requiredString(order, "token_symbol", 32).toUpperCase() === "USDC", "GOAT order read token mismatch");
assert(requiredString(order, "token_contract", 64).toLowerCase() === usdc[0].token_contract, "GOAT order read token contract mismatch");
assert(requiredString(order, "from_address", 64).toLowerCase() === payer, "GOAT order read payer mismatch");
assert(requiredString(order, "amount_wei", 80) === amountAtomic, "GOAT order read amount mismatch");
assert(requiredString(order, "status", 64) === "CHECKOUT_VERIFIED", "No-payment dry run reached an unexpected order state");
assert(order.tx_hash === null || order.tx_hash === undefined || order.tx_hash === "", "No-payment dry run unexpectedly has a transaction hash");

const evidence = {
  evidence_version: "goat-testnet3-provider-dry-run-v1",
  captured_at: new Date().toISOString(),
  environment: "testnet3",
  chain_id: CHAIN_ID,
  network: CAIP2,
  merchant: {
    merchant_id: merchantId,
    receive_type: "DIRECT",
    selected_token: usdc[0],
  },
  request: {
    dapp_order_id: dappOrderId,
    payer_address: payer,
    amount_atomic: amountAtomic,
  },
  challenge,
  provider_order: {
    order_id: challenge.order_id,
    status: "CHECKOUT_VERIFIED",
    transaction_hash: null,
  },
  assertions: {
    merchant_identity_verified: true,
    merchant_direct_mode: true,
    runtime_usdc_capability_resolved: true,
    http_402_challenge_verified: true,
    authenticated_order_read_verified: true,
    provider_raw_payload_persisted: false,
    transaction_submitted: false,
    commercial_revenue: false,
  },
};

const artifactDir = resolve(process.env.GOATX402_DRY_RUN_ARTIFACT_DIR ?? "artifacts/goat-testnet3");
await mkdir(artifactDir, { recursive: true });
const artifactPath = resolve(artifactDir, `provider-dry-run-${Date.now()}.json`);
await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log("GOAT Testnet3 provider dry run passed.");
console.log(`Order: ${challenge.order_id}`);
console.log(`Network: ${CAIP2}`);
console.log("Transaction submitted: false");
console.log("Commercial revenue: false");
console.log(`Evidence: ${artifactPath}`);

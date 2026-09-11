#!/usr/bin/env node

import { createHmac, randomBytes, randomUUID } from "node:crypto";

const API_ORIGIN = "https://flow-api.testnet3.goat.network";
const CHAIN_ID = 48816;
const apiKey = (process.env.GOATX402_API_KEY ?? "").trim();
const apiSecret = (process.env.GOATX402_API_SECRET ?? "").trim();
const merchantId = (process.env.GOATX402_MERCHANT_ID ?? "").trim();

if (!apiKey || !apiSecret || !merchantId) {
  throw new Error("GOAT diagnostic requires configured merchant credentials");
}
if (/[\u0000-\u001f\u007f]/.test(apiKey) || /[\u0000-\u001f\u007f]/.test(apiSecret)) {
  throw new Error("GOAT diagnostic found invalid credential control characters");
}

function sign(body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const params = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => [key, String(value)]),
  );
  params.api_key = apiKey;
  params.timestamp = timestamp;
  params.nonce = nonce;
  const canonical = Object.keys(params)
    .filter((key) => params[key] !== "" && key !== "sign")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return {
    "X-API-Key": apiKey,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Sign": createHmac("sha256", apiSecret).update(canonical).digest("hex"),
  };
}

function safeMessage(value) {
  if (typeof value !== "string") return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
}

const merchantResponse = await fetch(`${API_ORIGIN}/merchants/${encodeURIComponent(merchantId)}`, {
  signal: AbortSignal.timeout(30_000),
});
const merchant = await merchantResponse.json();
if (!merchantResponse.ok || !Array.isArray(merchant?.wallets)) {
  throw new Error(`GOAT merchant discovery failed with HTTP ${merchantResponse.status}`);
}
const usdc = merchant.wallets.find(
  (wallet) => wallet?.chain_id === CHAIN_ID && String(wallet?.token_symbol ?? "").toUpperCase() === "USDC",
);
if (!usdc?.token_contract) {
  throw new Error("GOAT diagnostic could not resolve Testnet3 USDC");
}

const body = {
  dapp_order_id: `geomacro-diag-${Date.now()}-${randomBytes(4).toString("hex")}`,
  chain_id: CHAIN_ID,
  token_symbol: "USDC",
  token_contract: String(usdc.token_contract).toLowerCase(),
  from_address: `0x${randomBytes(20).toString("hex")}`,
  amount_wei: "1",
};

const response = await fetch(`${API_ORIGIN}/api/v1/orders`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...sign(body),
  },
  body: JSON.stringify(body),
  redirect: "error",
  signal: AbortSignal.timeout(30_000),
});

const text = await response.text();
let parsed = {};
try {
  parsed = JSON.parse(text);
} catch {
  parsed = {};
}

const code = safeMessage(parsed?.code) ?? "none";
const error = safeMessage(parsed?.error) ?? "none";
const message = safeMessage(parsed?.message) ?? "none";
console.log(`GOAT diagnostic HTTP status: ${response.status}`);
console.log(`GOAT diagnostic code: ${code}`);
console.log(`GOAT diagnostic error: ${error}`);
console.log(`GOAT diagnostic message: ${message}`);
console.log(`API key length: ${apiKey.length}`);
console.log(`API key contains ampersand: ${apiKey.includes("&")}`);
console.log(`API key contains equals: ${apiKey.includes("=")}`);
console.log("Credential values printed: false");
console.log("Transaction submitted: false");

if (response.status !== 402) process.exit(1);

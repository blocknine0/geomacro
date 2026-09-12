#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { JsonRpcProvider } from "ethers";

const GOAT_TESTNET3_RPC = "https://rpc.testnet3.goat.network";
const MAX_WAIT_MS = 5 * 60_000;
const POLL_MS = 5_000;

const base = (process.env.GEOMACRO_GOAT_PILOT_BASE_URL || "").replace(/\/$/, "");
const accessToken = process.env.GEOMACRO_GOAT_PILOT_ACCESS_TOKEN || "";
const payer = (process.env.GEOMACRO_GOAT_TEST_PAYER_ADDRESS || "").toLowerCase();
const clientRequestId = process.env.GEOMACRO_GOAT_CLIENT_REQUEST_ID || "";
const expectedTx = (process.env.GEOMACRO_GOAT_EXISTING_TX_HASH || "").toLowerCase();
const artifactDir = resolve(process.env.GEOMACRO_GOAT_E2E_ARTIFACT_DIR || "artifacts/goat-testnet3-reconcile");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}
function assert(value, message) { if (!value) fail(message); }
function validAddress(v) { return /^0x[a-f0-9]{40}$/.test(v); }
function validTx(v) { return /^0x[a-f0-9]{64}$/.test(v); }
function redact(value) {
  return JSON.parse(JSON.stringify(value, (k, v) => /secret|private[_-]?key|authorization|access[_-]?token/i.test(k) ? "[REDACTED]" : v));
}
async function save(name, value) {
  await mkdir(artifactDir, { recursive: true });
  const path = resolve(artifactDir, name);
  await writeFile(path, JSON.stringify(redact(value), null, 2) + "\n", "utf8");
  return path;
}
async function post(path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail(`${path} returned non-JSON status ${r.status}`); }
  return { status: r.status, body: parsed };
}

assert(base, "GEOMACRO_GOAT_PILOT_BASE_URL is required");
assert(accessToken.length >= 32, "GEOMACRO_GOAT_PILOT_ACCESS_TOKEN is missing");
assert(validAddress(payer), "GEOMACRO_GOAT_TEST_PAYER_ADDRESS is invalid");
assert(clientRequestId.length >= 4, "GEOMACRO_GOAT_CLIENT_REQUEST_ID is required");
assert(validTx(expectedTx), "GEOMACRO_GOAT_EXISTING_TX_HASH is invalid");
assert(!process.env.GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY, "Private key must not be loaded for reconciliation-only mode");
assert(!process.env.GEOMACRO_GOAT_TESTNET_E2E_ACK, "Payment acknowledgement must not be set for reconciliation-only mode");

console.log("GOAT Testnet3 existing-payment reconciliation");
console.log(`Client request ID: ${clientRequestId}`);
console.log(`Payer: ${payer}`);
console.log(`Expected tx: ${expectedTx}`);
console.log("Payment submission: DISABLED");

const provider = new JsonRpcProvider(GOAT_TESTNET3_RPC);
const receipt = await provider.getTransactionReceipt(expectedTx);
assert(receipt, "Existing transaction receipt is not available on GOAT Testnet3 RPC");
assert(receipt.status === 1, "Existing transaction reverted");
console.log(`✅ Existing on-chain tx confirmed in block ${receipt.blockNumber}`);

const started = Date.now();
let last = null;
let delivered = null;
while (Date.now() - started < MAX_WAIT_MS) {
  const result = await post("/api/goat/pilot/status", { client_request_id: clientRequestId, payer_address: payer });
  last = result;
  const state = result.body?.state;
  const orderStatus = result.body?.order_status;
  console.log(`status=${result.status} state=${state || "?"} order_status=${orderStatus || "?"}`);

  if (result.status === 200 && state === "DELIVERED") {
    delivered = result;
    break;
  }
  if (result.status === 409 || ["FAILED", "EXPIRED", "CANCELLED"].includes(orderStatus)) {
    await save(`${clientRequestId}-terminal.json`, { expected_transaction_hash: expectedTx, receipt: { block_number: receipt.blockNumber, status: receipt.status }, status_result: result });
    fail(`GOAT reconciliation reached terminal non-success state ${orderStatus || state || result.status}`);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

if (!delivered) {
  const path = await save(`${clientRequestId}-still-pending.json`, { expected_transaction_hash: expectedTx, receipt: { block_number: receipt.blockNumber, status: receipt.status }, last_status: last });
  console.error(`Evidence: ${path}`);
  fail("Existing on-chain payment is confirmed, but GOAT still has not advanced to PAYMENT_CONFIRMED/INVOICED. Do not submit another payment.");
}

assert(delivered.body?.payment?.transaction_hash?.toLowerCase() === expectedTx, "Delivered transaction hash does not match existing payment");
assert(delivered.body?.payment?.network === "eip155:48816", "Delivered network mismatch");
assert(delivered.body?.resource?.risk_object, "Delivered response is missing Risk Object");

const verification = await post("/api/risk-object-keys", { risk_object: delivered.body.resource.risk_object });
assert(verification.status === 200 && verification.body?.ok === true, "Risk Object verification endpoint failed");
assert(verification.body?.verification?.valid === true, "Risk Object verification.valid is not true");
assert(verification.body?.verification?.cryptographic_valid === true, "Risk Object cryptographic verification failed");

const path = await save(`${clientRequestId}-reconciled.json`, {
  expected_transaction_hash: expectedTx,
  receipt: { block_number: receipt.blockNumber, status: receipt.status },
  delivered_status: delivered,
  risk_object_verification: verification,
  assertions: {
    no_new_payment_submitted: true,
    existing_transaction_confirmed_onchain: true,
    same_transaction_reconciled: true,
    resource_delivered_after_goat_confirmation: true,
    risk_object_verified: true,
  },
});
console.log(`✅ Existing Testnet3 payment reconciled without a second transfer. Evidence: ${path}`);

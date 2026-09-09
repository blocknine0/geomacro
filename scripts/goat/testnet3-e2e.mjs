#!/usr/bin/env node

import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";
import process from "node:process";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
} from "ethers";

const GOAT_TESTNET3_CHAIN_ID = 48816n;
const GOAT_TESTNET3_RPC = "https://rpc.testnet3.goat.network";
const PAYMENT_ACK = "GOAT_TESTNET3_USDC";
const MAX_JSON_BYTES = 512 * 1024;
const MAX_CONFIRM_WAIT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 4_000;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const base = (process.env.GEOMACRO_GOAT_PILOT_BASE_URL || "").replace(/\/$/, "");
const expectedHost = process.env.GEOMACRO_GOAT_PILOT_EXPECTED_HOST || "";
const accessToken = process.env.GEOMACRO_GOAT_PILOT_ACCESS_TOKEN || "";
const payerAddressEnv = (process.env.GEOMACRO_GOAT_TEST_PAYER_ADDRESS || "").toLowerCase();
const paymentAck = process.env.GEOMACRO_GOAT_TESTNET_E2E_ACK || "";
const artifactDir = resolve(process.env.GEOMACRO_GOAT_E2E_ARTIFACT_DIR || "artifacts/goat-testnet3");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validAddress(value) {
  return /^0x[a-f0-9]{40}$/.test(value);
}

function validTxHash(value) {
  return /^0x[a-f0-9]{64}$/.test(value);
}

function nowIso() {
  return new Date().toISOString();
}

if (!base) fail("GEOMACRO_GOAT_PILOT_BASE_URL is required.");
if (accessToken.length < 32) fail("GEOMACRO_GOAT_PILOT_ACCESS_TOKEN must be configured.");

let baseUrl;
try {
  baseUrl = new URL(base);
} catch {
  fail("GEOMACRO_GOAT_PILOT_BASE_URL must be a valid URL.");
}

if (
  baseUrl.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(baseUrl.hostname)
) {
  fail("GOAT E2E target must use HTTPS except for loopback development.");
}

if (["geomacro.live", "www.geomacro.live"].includes(baseUrl.hostname)) {
  fail("Refusing to run the GOAT Testnet3 payment harness against the public production host. Use isolated staging.");
}

if (expectedHost && baseUrl.hostname !== expectedHost) {
  fail(`Target host mismatch. Expected ${expectedHost}, got ${baseUrl.hostname}.`);
}

async function jsonRequest(path, body, expectedStatuses, auth = true) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      ...(auth ? { authorization: `Bearer ${accessToken}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
  });

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    fail(`${path} returned an oversized response.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(text);
    fail(`${path} returned non-JSON status ${response.status}.`);
  }

  if (!expectedStatuses.includes(response.status)) {
    console.error(JSON.stringify(parsed, null, 2));
    fail(`${path} returned unexpected status ${response.status}.`);
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

function redactedEvidence(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (/secret|private[_-]?key|authorization|access[_-]?token/i.test(key)) {
        return "[REDACTED]";
      }
      return item;
    }),
  );
}

async function saveEvidence(name, value) {
  await mkdir(artifactDir, { recursive: true });
  const path = resolve(artifactDir, name);
  await writeFile(path, `${JSON.stringify(redactedEvidence(value), null, 2)}\n`, "utf8");
  return path;
}

let wallet = null;
let payerAddress = payerAddressEnv;
let provider = null;

if (paymentAck === PAYMENT_ACK) {
  const privateKey = process.env.GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY || "";
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    fail("A dedicated test-wallet private key is required only for the explicitly acknowledged paid stage.");
  }

  provider = new JsonRpcProvider(GOAT_TESTNET3_RPC);
  wallet = new Wallet(privateKey, provider);
  const derived = wallet.address.toLowerCase();

  if (payerAddress && payerAddress !== derived) {
    fail("GEOMACRO_GOAT_TEST_PAYER_ADDRESS does not match the dedicated test private key.");
  }
  payerAddress = derived;
} else if (!validAddress(payerAddress)) {
  fail(
    "Set GEOMACRO_GOAT_TEST_PAYER_ADDRESS for challenge-only mode, or explicitly acknowledge the paid stage and configure the dedicated test private key.",
  );
}

const clientRequestId =
  process.env.GEOMACRO_GOAT_CLIENT_REQUEST_ID ||
  `goat-e2e-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const orderRequest = {
  client_request_id: clientRequestId,
  payer_address: payerAddress,
  subject: {
    type: "corridor",
    origin_country_iso3: "USA",
    destination_country_iso3: "CHN",
  },
  policy_preset: "cautious",
  action_type: "agent_payment",
};

console.log(`GOAT Testnet3 E2E target: ${baseUrl.hostname}`);
console.log(`Client request ID: ${clientRequestId}`);
console.log(`Payer: ${payerAddress}`);
console.log(paymentAck === PAYMENT_ACK ? "Paid stage: EXPLICITLY ENABLED" : "Paid stage: DISABLED (challenge-only)");

const startedAt = nowIso();
const orderResult = await jsonRequest(
  "/api/goat/pilot/order",
  orderRequest,
  [200, 402],
);

if (orderResult.status === 200) {
  assert(orderResult.body?.state === "DELIVERED", "Existing 200 result is not a delivered fulfillment.");
  assert(orderResult.body?.execution_authorized === false, "Delivered replay violated execution boundary.");
  const path = await saveEvidence(`${clientRequestId}-delivered-replay.json`, {
    started_at: startedAt,
    completed_at: nowIso(),
    order_request: orderRequest,
    order_response: orderResult,
  });
  console.log(`✅ Existing delivered result replayed safely. Evidence: ${path}`);
  process.exit(0);
}

const payment = orderResult.body?.payment;
assert(orderResult.body?.state === "PAYMENT_REQUIRED", "402 response did not declare PAYMENT_REQUIRED.");
assert(orderResult.body?.resource_prepared === true, "Resource was not prepared before payment challenge.");
assert(orderResult.body?.resource_delivered === false, "Resource leaked before payment confirmation.");
assert(orderResult.body?.execution_authorized === false, "402 response violated execution boundary.");
assert(orderResult.body?.environment === "testnet3", "E2E is not targeting GOAT Testnet3.");
assert(payment?.commercial_revenue === false, "Testnet3 response must never claim commercial revenue.");
assert(Number(payment?.chain_id) === Number(GOAT_TESTNET3_CHAIN_ID), "Unexpected GOAT Testnet3 chain ID.");
assert(payment?.network === "eip155:48816", "Unexpected GOAT Testnet3 CAIP-2 network.");
assert(payment?.token_symbol === "USDC", "Pilot currently expects merchant-supported USDC.");
assert(validAddress(String(payment?.token_contract || "").toLowerCase()), "Invalid runtime-resolved token contract.");
assert(validAddress(String(payment?.pay_to || "").toLowerCase()), "Invalid GOAT pay_to address.");
assert(/^([1-9][0-9]*)$/.test(String(payment?.amount_atomic || "")), "Invalid positive atomic payment amount.");
assert(payment?.flow === "ERC20_DIRECT", "Unexpected GOAT payment flow.");
assert(payment?.challenge?.order_id === payment?.order_id, "Normalized challenge order ID mismatch.");
assert(payment?.challenge?.amount_wei === payment?.amount_atomic, "Normalized challenge amount mismatch.");
assert(payment?.challenge?.token_contract === payment?.token_contract, "Normalized challenge token mismatch.");
assert(payment?.challenge?.pay_to === payment?.pay_to, "Normalized challenge pay_to mismatch.");
assert(payment?.challenge?.from_address === payerAddress, "Normalized challenge payer mismatch.");
assert(!("raw" in (payment?.challenge || {})), "Unbounded provider raw payload leaked into challenge.");

const challengeEvidencePath = await saveEvidence(`${clientRequestId}-challenge.json`, {
  started_at: startedAt,
  captured_at: nowIso(),
  order_request: orderRequest,
  order_response: orderResult,
});
console.log(`✅ GOAT 402 challenge contract verified. Evidence: ${challengeEvidencePath}`);

if (paymentAck !== PAYMENT_ACK) {
  console.log(`ℹ️ No token transfer submitted. To run the paid Testnet3 stage, set GEOMACRO_GOAT_TESTNET_E2E_ACK=${PAYMENT_ACK} and use a dedicated funded test wallet.`);
  process.exit(0);
}

assert(wallet && provider, "Paid stage wallet/provider was not initialized.");

const network = await provider.getNetwork();
assert(network.chainId === GOAT_TESTNET3_CHAIN_ID, `Connected RPC chain ID is ${network.chainId}, expected ${GOAT_TESTNET3_CHAIN_ID}.`);

const tokenAddress = String(payment.token_contract).toLowerCase();
const payTo = String(payment.pay_to).toLowerCase();
const amountAtomic = BigInt(String(payment.amount_atomic));

const erc20 = new Contract(tokenAddress, ERC20_ABI, wallet);
const balance = BigInt(await erc20.balanceOf(wallet.address));
assert(balance >= amountAtomic, `Dedicated test wallet has insufficient ${payment.token_symbol} balance.`);

console.log(`Submitting one explicitly acknowledged GOAT Testnet3 ${payment.token_symbol} transfer...`);
const transaction = await erc20.transfer(payTo, amountAtomic);
assert(validTxHash(transaction.hash.toLowerCase()), "Wallet returned an invalid transaction hash.");
const submittedTxHash = transaction.hash.toLowerCase();
console.log(`Submitted tx: ${submittedTxHash}`);

const receipt = await transaction.wait(1);
assert(receipt && receipt.status === 1, "GOAT Testnet3 transfer reverted or has no successful receipt.");
assert(receipt.hash.toLowerCase() === submittedTxHash, "Transaction receipt hash mismatch.");

await saveEvidence(`${clientRequestId}-transfer.json`, {
  submitted_at: nowIso(),
  client_request_id: clientRequestId,
  payer_address: payerAddress,
  chain_id: Number(GOAT_TESTNET3_CHAIN_ID),
  token_symbol: payment.token_symbol,
  token_contract: tokenAddress,
  pay_to: payTo,
  amount_atomic: String(amountAtomic),
  transaction_hash: submittedTxHash,
  receipt: {
    block_number: receipt.blockNumber,
    status: receipt.status,
  },
  commercial_revenue: false,
});

const pollStarted = Date.now();
let finalStatus = null;
let lastStatus = null;

while (Date.now() - pollStarted < MAX_CONFIRM_WAIT_MS) {
  const statusResult = await jsonRequest(
    "/api/goat/pilot/status",
    {
      client_request_id: clientRequestId,
      payer_address: payerAddress,
    },
    [200, 202, 409, 503],
  );

  lastStatus = statusResult;
  if (statusResult.status === 200 && statusResult.body?.state === "DELIVERED") {
    finalStatus = statusResult;
    break;
  }

  if (statusResult.status === 409 && statusResult.body?.state === "PAYMENT_NOT_COMPLETED") {
    console.error(JSON.stringify(statusResult.body, null, 2));
    fail("GOAT order reached a terminal non-payment state after the transfer.");
  }

  if (
    statusResult.status === 503 &&
    statusResult.body?.error?.retryable !== true
  ) {
    console.error(JSON.stringify(statusResult.body, null, 2));
    fail("GOAT reconciliation entered a non-retryable state.");
  }

  await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_INTERVAL_MS));
}

if (!finalStatus) {
  console.error(JSON.stringify(lastStatus?.body || null, null, 2));
  fail("Timed out waiting for GOAT server-confirmed paid fulfillment. Do not submit another transfer; reconcile the same order.");
}

assert(finalStatus.body?.execution_authorized === false, "Delivered GOAT response violated execution boundary.");
assert(finalStatus.body?.resource?.risk_gate?.execution_authorized === false, "Delivered Risk Gate violated execution boundary.");
assert(finalStatus.body?.resource?.boundaries?.execution_authorized === false, "Delivered resource boundary violated execution contract.");
assert(finalStatus.body?.payment?.commercial_revenue === false, "Testnet3 delivery must never be counted as commercial revenue.");
assert(finalStatus.body?.payment?.transaction_hash === submittedTxHash, "Server-confirmed payment transaction does not match submitted transfer.");
assert(finalStatus.body?.payment?.network === "eip155:48816", "Delivered payment network mismatch.");
assert(finalStatus.body?.payment?.asset === "USDC", "Delivered payment asset mismatch.");
assert(finalStatus.body?.resource?.risk_object, "Delivered paid intelligence has no Risk Object.");

const verification = await jsonRequest(
  "/api/risk-object-keys",
  { risk_object: finalStatus.body.resource.risk_object },
  [200],
  false,
);
assert(verification.body?.ok === true, "Risk Object verification endpoint did not return ok=true.");
assert(verification.body?.verification?.valid === true, "Delivered Risk Object did not pass public machine verification.");
assert(verification.body?.verification?.cryptographic_valid === true, "Delivered Risk Object signature did not verify cryptographically.");

const completedAt = nowIso();
const finalEvidencePath = await saveEvidence(`${clientRequestId}-complete.json`, {
  started_at: startedAt,
  completed_at: completedAt,
  duration_ms: Date.now() - new Date(startedAt).getTime(),
  order_request: orderRequest,
  challenge: orderResult,
  submitted_transaction_hash: submittedTxHash,
  final_status: finalStatus,
  risk_object_verification: verification,
  assertions: {
    goat_testnet3_chain_id: true,
    server_confirmed_payment: true,
    exact_transaction_reconciled: true,
    resource_hidden_before_payment: true,
    structured_resource_delivered: true,
    risk_object_machine_verified: true,
    execution_authorized_false: true,
    testnet_not_revenue: true,
  },
});

console.log(`✅ GOAT Testnet3 paid-intelligence E2E completed.`);
console.log(`✅ Server-confirmed transaction: ${submittedTxHash}`);
console.log(`✅ Signed Risk Object machine verification passed.`);
console.log(`✅ execution_authorized=false preserved end to end.`);
console.log(`✅ Testnet3 correctly remains non-revenue evidence.`);
console.log(`Evidence: ${finalEvidencePath}`);

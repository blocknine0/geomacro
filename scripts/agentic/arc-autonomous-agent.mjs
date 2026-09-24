#!/usr/bin/env node
import process from "node:process";
import { spawnSync } from "node:child_process";

const base = (process.env.GEOMACRO_X402_BASE_URL || "").replace(/\/$/, "");
const wallet = process.env.GEOMACRO_X402_AGENT_WALLET_ADDRESS || "";
const maxAmount = process.env.GEOMACRO_AGENT_MAX_PAYMENT_USDC || "0.05";
const MAX_PAYMENT_USDC = 0.05;
const parsedMaxAmount = Number(maxAmount);
if (!Number.isFinite(parsedMaxAmount) || parsedMaxAmount <= 0 || parsedMaxAmount > MAX_PAYMENT_USDC) {
  fail(`GEOMACRO_AGENT_MAX_PAYMENT_USDC must be greater than 0 and no more than ${MAX_PAYMENT_USDC}.`);
}
const acknowledge = process.env.GEOMACRO_AGENT_PAYMENT_ACK || "";

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!base) fail("GEOMACRO_X402_BASE_URL is required.");
let target;
try {
  target = new URL(`${base}/api/agent/risk`);
} catch {
  fail("GEOMACRO_X402_BASE_URL must be a valid URL.");
}
if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) {
  fail("Agent target must use HTTPS except for localhost.");
}
if (["geomacro.live", "www.geomacro.live"].includes(target.hostname)) {
  fail("Refusing to spend Testnet USDC against the public production host.");
}
if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
  fail("GEOMACRO_X402_AGENT_WALLET_ADDRESS must be a valid EVM address.");
}
if (acknowledge !== "ARC_TESTNET_USDC") {
  fail("Set GEOMACRO_AGENT_PAYMENT_ACK=ARC_TESTNET_USDC to authorize the bounded Testnet payment.");
}

const payload = {
  subject: {
    type: "corridor",
    origin_country_iso3: process.env.GEOMACRO_AGENT_ORIGIN || "USA",
    destination_country_iso3: process.env.GEOMACRO_AGENT_DESTINATION || "CHN",
  },
  policy_preset: "cautious",
  action_type: "agent_payment",
  amount_usdc: 10000,
  client_request_id: `arc-agent-${Date.now()}`,
};

console.log("Geomacro Autonomous Risk Agent");
console.log(`Target: ${target}`);
console.log("Policy: Arc Testnet only, USDC only, max 0.05 USDC per request.");
console.log("Stage 1: requesting intelligence without payment...");

const unpaid = await fetch(target, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
if (unpaid.status !== 402) {
  const body = await unpaid.text();
  fail(`Expected HTTP 402, received ${unpaid.status}: ${body}`);
}

const required = unpaid.headers.get("payment-required");
if (!required) fail("402 response did not contain PAYMENT-REQUIRED.");

let requirements;
try {
  requirements = JSON.parse(Buffer.from(required, "base64").toString("utf8"));
} catch {
  fail("PAYMENT-REQUIRED was not valid base64 JSON.");
}

const accept = requirements?.accepts?.[0];
if (requirements?.x402Version !== 2) fail("Expected x402 v2.");
if (accept?.network !== "eip155:5042002") fail("Payment network is not Arc Testnet.");
if (accept?.asset?.toLowerCase() !== "0x3600000000000000000000000000000000000000") {
  fail("Payment asset is not Circle Gateway USDC on Arc Testnet.");
}
if (accept?.amount !== "50000") fail("Unexpected paid intelligence price.");
if (accept?.payTo?.toLowerCase() === wallet.toLowerCase()) fail("Agent wallet must not equal the seller address.");

console.log("✅ 402 received and payment policy verified.");
console.log("Stage 2: inspecting the service before authorizing payment...");

const inspected = spawnSync(
  "circle",
  ["services", "inspect", target.toString(), "-X", "POST", "-H", "content-type: application/json", "-d", JSON.stringify(payload), "--output", "json"],
  { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] },
);
if (inspected.error) fail(`Circle CLI could not start for inspect: ${inspected.error.message}`);
if (inspected.status !== 0) {
  console.error(inspected.stderr || inspected.stdout);
  fail(`Circle CLI inspect exited with status ${inspected.status}.`);
}

let inspection;
try {
  inspection = JSON.parse(inspected.stdout.trim());
} catch {
  console.error(inspected.stdout);
  fail("Circle CLI inspect output was not valid JSON.");
}

const inspectedMethod = inspection?.method ?? inspection?.request?.method;
if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(inspectedMethod)) {
  fail("Circle CLI inspect did not return a valid HTTP method.");
}
if (inspectedMethod !== "POST") {
  fail(`Unexpected service method from inspect: ${inspectedMethod}`);
}

console.log(`✅ Circle inspect confirmed ${inspectedMethod} before payment.`);
console.log("Stage 3: estimating the bounded payment before settlement...");

const estimate = spawnSync(
  "circle",
  [
    "services", "pay", target.toString(),
    "--address", wallet,
    "--chain", "ARC-TESTNET",
    "-X", inspectedMethod,
    "--max-amount", maxAmount,
    "--estimate",
    "-H", "content-type: application/json",
    "-d", JSON.stringify(payload),
    "--output", "json",
  ],
  { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] },
);
if (estimate.error) fail(`Circle CLI could not start for estimate: ${estimate.error.message}`);
if (estimate.status !== 0) {
  console.error(estimate.stderr || estimate.stdout);
  fail(`Circle CLI estimate failed with status ${estimate.status}.`);
}
console.log(estimate.stdout.trim());

console.log("Stage 4: authorizing exactly one bounded Circle CLI payment...");

const args = [
  "services", "pay", target.toString(),
  "--address", wallet,
  "--chain", "ARC-TESTNET",
  "-X", inspectedMethod,
  "--max-amount", maxAmount,
  "-H", "content-type: application/json",
  "-d", JSON.stringify(payload),
  "--output", "json",
];
const paid = spawnSync("circle", args, {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
if (paid.error) fail(`Circle CLI could not start: ${paid.error.message}`);
if (paid.status !== 0) {
  console.error(paid.stderr || paid.stdout);
  fail(`Circle CLI exited with status ${paid.status}.`);
}

let result;
try {
  result = JSON.parse(paid.stdout.trim());
} catch {
  console.error(paid.stdout);
  fail("Paid agent response was not valid JSON.");
}

if (result?.ok !== true) fail("Paid agent response was not successful.");
if (result?.payment?.provider !== "circle_gateway_x402") fail("Response did not identify Circle Gateway x402.");
if (result?.payment?.network !== "eip155:5042002") fail("Response did not confirm Arc Testnet.");
if (result?.payment?.asset !== "USDC") fail("Response did not confirm USDC.");
if (result?.risk_object?.verification?.status !== "VERIFIED") {
  fail("Returned Risk Object was not cryptographically verified.");
}
if (result?.risk_gate?.execution_authorized !== false || result?.boundaries?.execution_authorized !== false) {
  fail("Execution boundary was not fail-closed.");
}

console.log(JSON.stringify({
  agent: "geomacro",
  task: "risk_preflight",
  payment: result.payment,
  risk: result.risk_gate?.decision ?? null,
  risk_object: {
    object_id: result.risk_object?.object_id ?? null,
    verification: result.risk_object?.verification?.status ?? null,
  },
  execution_authorized: result.boundaries?.execution_authorized,
}, null, 2));

console.log("✅ Autonomous Arc Testnet agent flow passed.");

#!/usr/bin/env node
import process from "node:process";
import { spawnSync } from "node:child_process";

const base = (process.env.GEOMACRO_X402_BASE_URL || "").replace(/\/$/, "");
const wallet = process.env.GEOMACRO_X402_AGENT_WALLET_ADDRESS || "";
const ack = process.env.GEOMACRO_X402_E2E_ACK || "";
const expectedHost = process.env.GEOMACRO_X402_EXPECTED_HOST || "";

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!base) fail("GEOMACRO_X402_BASE_URL is required.");
let url;
try {
  url = new URL(base);
} catch {
  fail("GEOMACRO_X402_BASE_URL must be a valid URL.");
}
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
  fail("E2E target must use HTTPS except for localhost.");
}
if (["geomacro.live", "www.geomacro.live"].includes(url.hostname)) {
  fail("Refusing to spend test USDC against the public production host. Use isolated staging.");
}
if (expectedHost && url.hostname !== expectedHost) {
  fail(`Target host mismatch. Expected ${expectedHost}, got ${url.hostname}.`);
}

const endpoint = `${base}/api/agent/risk`;
const payload = {
  subject: {
    type: "corridor",
    origin_country_iso3: "USA",
    destination_country_iso3: "CHN",
  },
  policy_preset: "cautious",
  action_type: "agent_payment",
  amount_usdc: 10000,
  client_request_id: `x402-e2e-${Date.now()}`,
};

console.log(`Target: ${endpoint}`);
console.log("Stage 1: checking unpaid x402 contract...");
const unpaid = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const unpaidText = await unpaid.text();
if (unpaid.status !== 402) {
  console.error(unpaidText);
  fail(`Expected HTTP 402, received ${unpaid.status}.`);
}
const required = unpaid.headers.get("payment-required");
if (!required) fail("HTTP 402 did not include PAYMENT-REQUIRED header.");
let requiredJson;
try {
  requiredJson = JSON.parse(Buffer.from(required, "base64").toString("utf8"));
} catch {
  fail("PAYMENT-REQUIRED header was not valid base64 JSON.");
}
const accept = requiredJson?.accepts?.[0];
if (requiredJson?.x402Version !== 2) fail("Unexpected x402 version.");
if (accept?.network !== "eip155:5042002") fail(`Unexpected network: ${accept?.network}`);
if (accept?.asset?.toLowerCase() !== "0x3600000000000000000000000000000000000000") {
  fail(`Unexpected USDC asset: ${accept?.asset}`);
}
if (accept?.amount !== "1000") fail(`Unexpected test price: ${accept?.amount}`);
if (accept?.maxTimeoutSeconds < 604900) fail(`Gateway timeout too short: ${accept?.maxTimeoutSeconds}`);
if (accept?.extra?.verifyingContract?.toLowerCase() !== "0x0077777d7eba4688bdef3e311b846f25870a19b9") {
  fail(`Unexpected Gateway verifying contract: ${accept?.extra?.verifyingContract}`);
}
console.log("✅ Unpaid 402 contract matches Arc Testnet x402 technical-proof policy.");

if (ack !== "ARC_TESTNET_USDC") {
  console.log("ℹ️ Payment stage skipped. Set GEOMACRO_X402_E2E_ACK=ARC_TESTNET_USDC to authorize the 0.001 USDC Arc Testnet call.");
  process.exit(0);
}
if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
  fail("GEOMACRO_X402_AGENT_WALLET_ADDRESS must be a valid EVM address before payment stage.");
}

console.log("Stage 2: invoking Circle CLI for one 0.001 USDC Arc Testnet payment...");
const args = [
  "services",
  "pay",
  endpoint,
  "--address",
  wallet,
  "--chain",
  "ARC-TESTNET",
  "-X",
  "POST",
  "--max-amount",
  "0.001",
  "-H",
  "content-type: application/json",
  "-d",
  JSON.stringify(payload),
  "--output",
  "json",
];
const paid = spawnSync("circle", args, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
if (paid.error) fail(`Circle CLI could not start: ${paid.error.message}`);
if (paid.status !== 0) {
  console.error(paid.stderr || paid.stdout);
  fail(`Circle CLI payment command exited with status ${paid.status}.`);
}
const output = paid.stdout.trim();
console.log(output);
let parsed;
try {
  parsed = JSON.parse(output);
} catch {
  fail("Circle CLI output was not valid JSON.");
}
const serialized = JSON.stringify(parsed);
if (!serialized.includes('"execution_authorized":false')) {
  fail("Paid response did not preserve execution_authorized=false.");
}
if (!serialized.includes("circle_gateway_x402")) {
  fail("Paid response did not identify the Circle Gateway x402 provider.");
}
console.log("✅ Arc Testnet x402 payment and Risk Gate delivery passed.");

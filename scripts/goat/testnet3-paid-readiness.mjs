#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Wallet } from "ethers";

const artifactDir = resolve(
  process.env.GEOMACRO_GOAT_READINESS_ARTIFACT_DIR ||
    "artifacts/goat-testnet3-readiness",
);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const base = (process.env.GEOMACRO_GOAT_PILOT_BASE_URL || "").replace(/\/$/, "");
const expectedHost = (process.env.GEOMACRO_GOAT_PILOT_EXPECTED_HOST || "").trim();
const accessToken = process.env.GEOMACRO_GOAT_PILOT_ACCESS_TOKEN || "";
const privateKey = process.env.GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY || "";
const payerAddressEnv = (process.env.GEOMACRO_GOAT_TEST_PAYER_ADDRESS || "")
  .trim()
  .toLowerCase();

if (!base) fail("GEOMACRO_GOAT_PILOT_BASE_URL is required.");
if (!expectedHost) fail("GEOMACRO_GOAT_PILOT_EXPECTED_HOST is required.");
if (accessToken.length < 32) {
  fail("GEOMACRO_GOAT_PILOT_ACCESS_TOKEN must be configured and at least 32 characters.");
}
if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  fail("GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY must be a dedicated 32-byte EVM test key.");
}

let baseUrl;
try {
  baseUrl = new URL(base);
} catch {
  fail("GEOMACRO_GOAT_PILOT_BASE_URL must be a valid URL.");
}

if (baseUrl.protocol !== "https:") {
  fail("Paid-proof staging must use HTTPS.");
}
if (["geomacro.live", "www.geomacro.live"].includes(baseUrl.hostname)) {
  fail("Refusing the public production host. Configure an isolated staging host.");
}
if (baseUrl.hostname !== expectedHost) {
  fail(`Staging host mismatch. Expected ${expectedHost}, got ${baseUrl.hostname}.`);
}
if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  fail("Paid-proof staging URL must not contain credentials, query parameters, or fragments.");
}

const wallet = new Wallet(privateKey);
const derivedAddress = wallet.address.toLowerCase();

if (payerAddressEnv && !/^0x[a-f0-9]{40}$/.test(payerAddressEnv)) {
  fail("GEOMACRO_GOAT_TEST_PAYER_ADDRESS is not a valid EVM address.");
}
if (payerAddressEnv && payerAddressEnv !== derivedAddress) {
  fail("GEOMACRO_GOAT_TEST_PAYER_ADDRESS does not match the dedicated test private key.");
}

const evidence = {
  evidence_version: "goat-testnet3-paid-readiness-v1",
  captured_at: new Date().toISOString(),
  staging_host: baseUrl.hostname,
  payer_address: derivedAddress,
  assertions: {
    isolated_https_staging: true,
    expected_host_match: true,
    access_token_present: true,
    dedicated_test_key_valid: true,
    payer_address_matches_key: true,
    network_request_executed: false,
    payment_submitted: false,
    commercial_revenue: false,
    execution_authorized: false,
  },
};

await mkdir(artifactDir, { recursive: true });
const artifactPath = resolve(artifactDir, "readiness.json");
await writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log("✅ GOAT Testnet3 paid-proof offline readiness check passed.");
console.log(`Staging host: ${baseUrl.hostname}`);
console.log(`Dedicated payer: ${derivedAddress}`);
console.log("Network request executed: false");
console.log("Payment submitted: false");
console.log("Commercial revenue: false");
console.log(`Evidence: ${artifactPath}`);

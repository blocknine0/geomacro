#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// These static suites asserted the retired public evaluation UI. The underlying
// credential, payment, session, delivery and security contracts remain covered
// by their dedicated runtime/static suites. Public retirement is covered by
// retired-public-evaluation-surface.test.ts instead.
const retiredPublicUiSuites = [
  "src/__tests__/testnet-tester-e2e-contract.test.ts",
  "src/__tests__/testnet-developer-access-static.test.ts",
  "src/__tests__/testnet-wallet-first-auth-static.test.ts",
  "src/__tests__/testnet-api-v12-alignment.test.ts",
  "src/__tests__/testnet-structural-severity-console-static.test.ts",
  "src/__tests__/testnet-oauth-browser-wiring-static.test.ts",
  "src/__tests__/testnet-credential-payment-e2e.test.ts",
  "src/__tests__/testnet-access-market-standard-static.test.ts",
  "src/__tests__/testnet-feedback-e2e-static.test.ts",
  "src/__tests__/testnet-avatar-storage-static.test.ts",
  "src/__tests__/testnet-tester-registration-static.test.ts",
  "src/__tests__/testnet-access-ux-social-static.test.ts",
  "src/__tests__/testnet-wallet-only-registration-static.test.ts",
];

const args = ["x", "vitest", "run", "src"];
for (const path of retiredPublicUiSuites) args.push("--exclude", path);

const result = spawnSync("bun", args, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);

#!/usr/bin/env node
import fs from "node:fs/promises";

const path = "src/lib/coinbase-x402.server.ts";
let source = await fs.readFile(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`SCOPE_FIX_MISSING:${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`SCOPE_FIX_AMBIGUOUS:${label}`);
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

replaceOnce(
  'function payerTelemetryId(payer: string | null | undefined) {',
  `function configuredCoinbaseCommercialEnvironment(): "testnet" | "mainnet" {\n  const raw = String(process.env.COINBASE_X402_ENVIRONMENT ?? "").trim().toLowerCase();\n  if (raw === "testnet") return "testnet";\n  if (raw === "production") return "mainnet";\n  throw new Error("COINBASE_X402_ENVIRONMENT_REQUIRED_FOR_DURABLE_LEDGER");\n}\n\nfunction payerTelemetryId(payer: string | null | undefined) {`,
  "environment-helper",
);

const hardcoded = 'providerEnvironment: "mainnet",';
const count = source.split(hardcoded).length - 1;
if (count !== 3) throw new Error(`SCOPE_FIX_EXPECTED_3_HARDCODED_ENVIRONMENTS_GOT_${count}`);
source = source.replaceAll(hardcoded, "providerEnvironment: configuredCoinbaseCommercialEnvironment(),");

await fs.writeFile(path, source, "utf8");
console.log("Coinbase durable ledger environment scope fixed.");

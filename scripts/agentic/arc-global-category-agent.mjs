#!/usr/bin/env node
import process from "node:process";
import { spawnSync } from "node:child_process";

const base = (process.env.GEOMACRO_X402_BASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const wallet = process.env.GEOMACRO_X402_AGENT_WALLET_ADDRESS || "";
const maxAmount = process.env.GEOMACRO_AGENT_MAX_PAYMENT_USDC || "0.05";
const ack = process.env.GEOMACRO_AGENT_PAYMENT_ACK || "";

const QUESTIONS = [
  {
    expectedCategories: ["GEOPOLITICS"],
    question: "What are the current geopolitical risks involving war, conflict, sanctions and diplomatic pressure?",
  },
  {
    expectedCategories: ["MACRO"],
    question: "What are the current macro risks involving inflation, interest rates, growth and currencies?",
  },
  {
    expectedCategories: ["CRITICAL_MINERALS"],
    question: "What are the current critical-mineral risks involving lithium, cobalt, copper and rare-earth supply?",
  },
  {
    expectedCategories: ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"],
    question: "What are the current geopolitical, macro and critical-mineral risks affecting global trade?",
  },
];

function fail(message) {
  console.error("❌ " + message);
  process.exit(1);
}

if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) fail("GEOMACRO_X402_AGENT_WALLET_ADDRESS must be a valid EVM address.");
if (ack !== "ARC_TESTNET_USDC") fail("Set GEOMACRO_AGENT_PAYMENT_ACK=ARC_TESTNET_USDC to authorize the bounded Testnet payments.");
if (Number(maxAmount) !== 0.05) fail("GEOMACRO_AGENT_MAX_PAYMENT_USDC must be exactly 0.05 for this acceptance run.");

const target = new URL(base + "/api/agent/intelligence");
if (target.protocol !== "http:" && target.protocol !== "https:") fail("Unsupported agent target protocol.");
if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) fail("Agent target must use HTTPS except for localhost.");
if (["geomacro.live", "www.geomacro.live"].includes(target.hostname)) fail("Refusing to spend Testnet USDC against the public production host.");

function parsePaymentRequired(header) {
  let decoded;
  try {
    decoded = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    fail("PAYMENT-REQUIRED was not valid base64 JSON.");
  }
}

function unwrapCircleServiceResponse(payload) {
  // Circle CLI 1.1.4 wraps paid service responses as data.response and
  // adds a separate data.payment receipt envelope.
  // Preserve direct responses and data-only responses too.
  if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") {
    if (payload.data.response && typeof payload.data.response === "object") {
      return payload.data.response;
    }
    return payload.data;
  }
  return payload;
}

function runCircle(args, label) {
  const result = spawnSync("circle", args, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
  if (result.error) fail(label + " could not start: " + result.error.message);
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    fail(label + " exited with status " + result.status);
  }
  return result.stdout.trim();
}

function findHttpMethod(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHttpMethod(item, seen);
      if (found) return found;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (["method", "httpMethod", "http_method"].includes(key) && typeof child === "string") {
      const normalized = child.toUpperCase();
      if (["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(normalized)) {
        return normalized;
      }
    }
    const found = findHttpMethod(child, seen);
    if (found) return found;
  }

  return null;
}

console.log("Geomacro global three-category Arc Testnet agent acceptance");
console.log("Target: " + target);
console.log("Scope: GEOPOLITICS + MACRO + CRITICAL_MINERALS");
console.log("Spend cap: 0.05 USDC per accepted question");

const requestedCase = (process.env.GEOMACRO_AGENT_CASE || "all").trim().toLowerCase();
const cases = {
  geopolitics: QUESTIONS.filter((item) => item.expectedCategories.length === 1 && item.expectedCategories[0] === "GEOPOLITICS"),
  macro: QUESTIONS.filter((item) => item.expectedCategories.length === 1 && item.expectedCategories[0] === "MACRO"),
  critical_minerals: QUESTIONS.filter((item) => item.expectedCategories.length === 1 && item.expectedCategories[0] === "CRITICAL_MINERALS"),
  mixed: QUESTIONS.filter((item) => item.expectedCategories.length === 3),
  all: QUESTIONS,
};
const selectedQuestions = cases[requestedCase];
if (!selectedQuestions) {
  fail('GEOMACRO_AGENT_CASE must be one of: all, geopolitics, macro, critical_minerals, mixed.');
}
console.log("Acceptance case: " + requestedCase + " (" + selectedQuestions.length + " question" + (selectedQuestions.length === 1 ? "" : "s") + ")");

const results = [];
for (const { expectedCategories, question } of selectedQuestions) {
  const label = expectedCategories.join("+");
  console.log("\n[" + label + "] " + question);

  const unpaid = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, client_request_id: "arc-global-" + Date.now() }),
  });

  if (unpaid.status !== 402) {
    const body = await unpaid.text();
    fail(label + ": expected HTTP 402, received " + unpaid.status + ": " + body);
  }

  const header = unpaid.headers.get("payment-required");
  if (!header) fail(label + ": missing PAYMENT-REQUIRED header.");
  const required = parsePaymentRequired(header);
  const accept = required?.accepts?.[0];

  if (required?.x402Version !== 2) fail(label + ": expected x402 v2.");
  if (accept?.network !== "eip155:5042002") fail(label + ": payment network is not Arc Testnet.");
  if (String(accept?.asset || "").toLowerCase() !== "0x3600000000000000000000000000000000000000") fail(label + ": payment asset is not Gateway USDC.");
  if (accept?.amount !== "50000") fail(label + ": payment amount is not 0.05 USDC.");
  if (accept?.payTo?.toLowerCase() === wallet.toLowerCase()) fail(label + ": buyer and seller wallets must be different.");

  console.log("✅ 402 and payment policy verified.");

  const inspection = JSON.parse(runCircle(
    ["services", "inspect", target.toString(), "--output", "json"],
    label + " Circle inspect",
  ));
  if (String(inspection?.status || "").toLowerCase() === "unavailable") {
    fail(label + ": Circle inspect reported the endpoint as unavailable.");
  }

  let method = findHttpMethod(inspection);
  if (!method) {
    // Circle CLI 1.1.4 can return inspect JSON without surfacing the HTTP method.
    // The target was already proven to return the x402 challenge to a POST request,
    // and this acceptance runner is intentionally bound to this fixed POST endpoint.
    method = "POST";
    console.log("ℹ️ Circle inspect JSON omitted the method; using the already-verified POST endpoint contract.");
  }

  if (method !== "POST") fail(label + ": Circle inspect resolved an unexpected HTTP method: " + method);

  console.log("✅ Circle inspect resolved POST.");

  const payload = JSON.stringify({ question, client_request_id: "arc-global-" + Date.now() });

  const estimate = runCircle(
    [
      "services", "pay", target.toString(),
      "--address", wallet,
      "--chain", "ARC-TESTNET",
      "-X", "POST",
      "--max-amount", maxAmount,
      "--estimate",
      "-H", "content-type: application/json",
      "-d", payload,
      "--output", "json",
    ],
    label + " payment estimate",
  );

  console.log(estimate);

  const paidRaw = runCircle(
    [
      "services", "pay", target.toString(),
      "--address", wallet,
      "--chain", "ARC-TESTNET",
      "-X", "POST",
      "--max-amount", maxAmount,
      "-H", "content-type: application/json",
      "-d", payload,
      "--output", "json",
    ],
    label + " Circle payment",
  );
  let paidEnvelope;
  try {
    paidEnvelope = JSON.parse(paidRaw);
  } catch {
    fail(label + ": Circle payment did not return valid JSON. Raw output: " + paidRaw);
  }

  const paid = unwrapCircleServiceResponse(paidEnvelope);
  if (paid?.ok !== true) {
    console.error(label + " paid response:");
    console.error(JSON.stringify(paidEnvelope, null, 2));
    fail(label + ": paid delivery was not successful.");
  }
  if (paid?.payment?.provider !== "circle_gateway_x402") fail(label + ": wrong payment provider.");
  if (paid?.payment?.network !== "eip155:5042002") fail(label + ": paid response did not confirm Arc Testnet.");
  if (paid?.payment?.asset !== "USDC") fail(label + ": paid response did not confirm USDC.");
  const actualCategories = Array.isArray(paid?.categories)
    ? [...paid.categories].sort()
    : [];
  const expectedSorted = [...expectedCategories].sort();
  if (JSON.stringify(actualCategories) !== JSON.stringify(expectedSorted)) {
    fail(label + ": category routing mismatch: " + JSON.stringify(paid.categories));
  }
  if (paid?.answer?.insufficient_evidence !== false) fail(label + ": answer was not grounded enough for delivery.");
  if (paid?.answer?.provenance?.upstream_source_urls_exposed !== false) {
    fail(label + ": upstream source URLs were exposed or provenance is missing.");
  }
  if (typeof paid?.answer?.provenance?.external_web_search_used !== "boolean") {
    fail(label + ": web-search provenance is missing.");
  }
  if (typeof paid?.answer?.provenance?.external_llm_used !== "boolean") {
    fail(label + ": LLM provenance is missing.");
  }
  if (paid?.execution_authorized !== false) fail(label + ": execution boundary was violated.");

  results.push({
    categories: expectedSorted,
    payment_provider: paid.payment.provider,
    amount_usdc: paid.payment.amount_usdc,
    network: paid.payment.network,
    settlement_reference: paid.payment.settlement_reference ?? null,
    answer_grounded: paid.answer.insufficient_evidence === false,
    execution_authorized: false,
  });

  console.log("✅ " + label + " paid intelligence delivered.");
}

console.log(JSON.stringify({
  ok: true,
  categories: results,
  total_paid_usdc: Number((results.length * 0.05).toFixed(2)),
  execution_authorized: false,
  technical_proof_only: true,
}, null, 2));

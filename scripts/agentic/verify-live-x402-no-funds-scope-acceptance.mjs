#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { productionAcceptanceAvailabilityCases } from "../commerce/production-canary-common.mjs";

const BASE = String(process.env.GEOMACRO_LIVE_HOST ?? "https://geomacro.live").replace(/\/$/, "");
const AVAILABILITY = `${BASE}/api/x402/risk/availability`;
const PAID_ENDPOINT = `${BASE}/api/x402/intelligence`;
const OUT = String(
  process.env.GEOMACRO_X402_SCOPE_ACCEPTANCE_OUT ??
    "artifacts/live-x402-no-funds-scope-acceptance.json",
);

if (BASE !== "https://geomacro.live") {
  throw new Error("X402_SCOPE_ACCEPTANCE_MUST_TARGET_PUBLIC_PRODUCTION");
}

function decodeRequired(value) {
  if (!value) throw new Error("PAYMENT_REQUIRED_HEADER_MISSING");
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    throw new Error("PAYMENT_REQUIRED_HEADER_INVALID");
  }
}

function planHashFromChallenge(required) {
  return String(required?.extensions?.geomacro?.info?.query_plan_hash ?? "").toLowerCase();
}

async function jsonResponse(response, label) {
  const text = await response.text();
  try {
    return { body: JSON.parse(text), text };
  } catch {
    throw new Error(`${label}_NON_JSON:HTTP_${response.status}`);
  }
}

async function proveCase(testCase) {
  const serialized = JSON.stringify(testCase.request);
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    "cache-control": "no-cache",
  };

  const availabilityResponse = await fetch(AVAILABILITY, {
    method: "POST",
    headers,
    body: serialized,
    redirect: "error",
    signal: AbortSignal.timeout(25_000),
  });
  const { body: availability } = await jsonResponse(
    availabilityResponse,
    `${testCase.id}_AVAILABILITY`,
  );

  if (
    availabilityResponse.status !== 200 ||
    availability?.ok !== true ||
    availability?.availability?.deliverable !== true ||
    availability?.availability?.code !== "AVAILABLE" ||
    availability?.payment_required_now !== false ||
    availability?.execution_authorized !== false ||
    typeof availability?.query_plan_hash !== "string" ||
    !/^[0-9a-f]{64}$/.test(availability.query_plan_hash)
  ) {
    throw new Error(
      `${testCase.id}_NOT_DELIVERABLE:${availabilityResponse.status}:${availability?.availability?.code ?? "UNKNOWN"}`,
    );
  }

  const challengeResponse = await fetch(PAID_ENDPOINT, {
    method: "POST",
    headers,
    body: serialized,
    redirect: "error",
    signal: AbortSignal.timeout(25_000),
  });
  const { body: challengeBody } = await jsonResponse(
    challengeResponse,
    `${testCase.id}_UNPAID_CHALLENGE`,
  );
  if (challengeResponse.status !== 402) {
    throw new Error(`${testCase.id}_EXPECTED_402_GOT_${challengeResponse.status}`);
  }

  const required = decodeRequired(challengeResponse.headers.get("payment-required"));
  if (JSON.stringify(required) !== JSON.stringify(challengeBody)) {
    throw new Error(`${testCase.id}_PAYMENT_REQUIRED_HEADER_BODY_MISMATCH`);
  }
  if (required?.x402Version !== 2) {
    throw new Error(`${testCase.id}_X402_VERSION_INVALID`);
  }
  if (String(required?.resource?.url ?? "") !== PAID_ENDPOINT) {
    throw new Error(`${testCase.id}_RESOURCE_URL_INVALID`);
  }

  const challengePlanHash = planHashFromChallenge(required);
  if (challengePlanHash !== availability.query_plan_hash) {
    throw new Error(`${testCase.id}_QUERY_PLAN_NOT_BOUND_TO_CHALLENGE`);
  }
  if (required?.extensions?.geomacro?.info?.execution_authorized !== false) {
    throw new Error(`${testCase.id}_EXECUTION_BOUNDARY_INVALID`);
  }
  if (required?.extensions?.geomacro?.info?.raw_data_delivered !== false) {
    throw new Error(`${testCase.id}_RAW_DATA_BOUNDARY_INVALID`);
  }

  const acceptance = Array.isArray(required?.accepts) ? required.accepts[0] : null;
  if (!acceptance || !String(acceptance?.network ?? "").trim()) {
    throw new Error(`${testCase.id}_PAYMENT_REQUIREMENT_INVALID`);
  }
  if (
    availability?.exact_price?.network &&
    acceptance.network !== availability.exact_price.network
  ) {
    throw new Error(`${testCase.id}_NETWORK_MISMATCH`);
  }
  if (
    availability?.exact_price?.amount_atomic &&
    String(acceptance.amount ?? "") !== String(availability.exact_price.amount_atomic)
  ) {
    throw new Error(`${testCase.id}_PRICE_MISMATCH`);
  }

  return {
    id: testCase.id,
    status: "PASS",
    availability_http: availabilityResponse.status,
    unpaid_challenge_http: challengeResponse.status,
    query_plan_hash: availability.query_plan_hash,
    network: acceptance.network,
    amount_atomic: acceptance.amount ?? null,
    payment_signature_sent: false,
    settlement_attempted: false,
    execution_authorized: false,
  };
}

const cases = productionAcceptanceAvailabilityCases();
const expected = new Set([
  "geopolitics-deu",
  "macro-bra",
  "critical-minerals-zaf",
  "country-usa",
  "corridor-usa-chn",
]);
if (cases.length !== expected.size || cases.some((row) => !expected.has(row.id))) {
  throw new Error("X402_SCOPE_CASE_SET_DRIFT");
}

const results = [];
for (const testCase of cases) {
  results.push(await proveCase(testCase));
}

const evidence = {
  schema_version: "geomacro.live-x402-no-funds-scope-acceptance.v1",
  checked_at: new Date().toISOString(),
  host: BASE,
  payment_performed: false,
  real_funds_touched: false,
  payment_signature_sent: false,
  settlement_attempted: false,
  scopes: {
    geopolitics_paid_path: true,
    macro_paid_path: true,
    critical_minerals_paid_path: true,
    country_paid_path_representative: true,
    corridor_paid_path_representative: true,
  },
  results,
};

mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
console.log("PASS: all five #1414 commercial scopes reached a query-plan-bound unpaid x402 challenge without sending payment proof.");

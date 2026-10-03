#!/usr/bin/env node

const host = String(process.env.GEOMACRO_LIVE_HOST ?? "https://geomacro.live").replace(/\/$/, "");
const endpoint = `${host}/api/x402/risk/availability`;

const cases = [
  {
    id: "brazil-structural-macro-fx",
    body: {
      schema_version: "geomacro.agent-query.v1",
      subjects: [{ type: "country", country_iso3: "BRA" }],
      topics: ["macro_risk", "fx_external_risk"],
      evidence: "required",
      detail: "standard",
    },
    expected_modules: ["external_fx", "macro_monetary", "sovereign_fiscal"],
  },
  {
    id: "india-structural-macro-fx",
    body: {
      schema_version: "geomacro.agent-query.v1",
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["macro_risk", "fx_external_risk"],
      evidence: "required",
      detail: "standard",
    },
    expected_modules: ["external_fx", "macro_monetary", "sovereign_fiscal"],
  },
  {
    id: "south-africa-critical-minerals",
    body: {
      schema_version: "geomacro.agent-query.v1",
      subjects: [{ type: "country", country_iso3: "ZAF" }],
      topics: ["critical_minerals"],
      evidence: "required",
      detail: "standard",
    },
    expected_modules: ["critical_minerals"],
  },
  {
    id: "china-critical-minerals",
    body: {
      schema_version: "geomacro.agent-query.v1",
      subjects: [{ type: "country", country_iso3: "CHN" }],
      topics: ["critical_minerals"],
      evidence: "required",
      detail: "standard",
    },
    expected_modules: ["critical_minerals"],
  },
];

async function check(testCase) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(testCase.body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${testCase.id}: availability response was not JSON (${response.status})`);
  }

  if (response.status !== 200) {
    throw new Error(`${testCase.id}: expected HTTP 200, received ${response.status}; ${JSON.stringify({
      code: payload?.availability?.code ?? payload?.error?.code ?? null,
      missing_modules: payload?.availability?.missing_modules ?? null,
      stale_modules: payload?.availability?.stale_modules ?? null,
    })}`);
  }
  if (payload?.ok !== true || payload?.chargeable !== true || payload?.availability?.deliverable !== true) {
    throw new Error(`${testCase.id}: endpoint did not prove a chargeable deliverable product`);
  }
  if (payload?.payment_required_now !== false || payload?.execution_authorized !== false) {
    throw new Error(`${testCase.id}: zero-fund acceptance boundary was not preserved`);
  }
  const required = Array.isArray(payload?.availability?.required_modules)
    ? payload.availability.required_modules
    : testCase.expected_modules;
  for (const forbidden of ["hot_topics", "signed_risk_object", "risk_gate"]) {
    if (required.includes(forbidden)) {
      throw new Error(`${testCase.id}: structural pilot unexpectedly depends on ${forbidden}`);
    }
  }

  return {
    id: testCase.id,
    status: response.status,
    chargeable: true,
    payment_required_now: false,
    execution_authorized: false,
    network: payload?.exact_price?.network ?? null,
    amount_usdc: payload?.exact_price?.amount_usdc ?? null,
    query_plan_hash: payload?.query_plan_hash ?? null,
    available_modules: payload?.availability?.subjects?.[0]?.available_modules ?? [],
    governed_fallback_modules: payload?.availability?.subjects?.[0]?.governed_fallback_modules ?? [],
  };
}

const results = [];
for (const testCase of cases) results.push(await check(testCase));

console.log(JSON.stringify({
  schema_version: "geomacro.x402-pilot-product-lane-zero-fund.v1",
  checked_at: new Date().toISOString(),
  host,
  ok: true,
  payment_performed: false,
  real_funds_touched: false,
  production_activation_changed: false,
  chargeable_case_count: results.length,
  boundaries: {
    structural_products_only: true,
    current_latest_queries_excluded: true,
    risk_gate_excluded: true,
    signed_risk_object_not_required: true,
    hot_topics_not_required: true,
  },
  results,
}, null, 2));

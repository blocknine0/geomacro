#!/usr/bin/env node
const BASE = "https://geomacro.live";
const URL = `${BASE}/api/x402/risk/availability`;

const cases = [
  {
    id: "usa-risk-gate",
    body: {
      schema_version: "geomacro.agent-query.v1",
      question: "Should a treasury payment involving the United States proceed based on the current Geomacro Risk Gate?",
      subjects: [{ type: "country", country_iso3: "USA" }],
      topics: ["risk_object", "risk_gate"],
      evidence: "required",
      detail: "standard",
      risk_gate_context: {
        policy_preset: "balanced",
        action_type: "treasury_payment",
        amount_usdc: 1000,
      },
    },
  },
  {
    id: "india-macro-fx",
    body: {
      schema_version: "geomacro.agent-query.v1",
      question: "What are the current macro and FX risks for India?",
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["macro_risk", "fx_external_risk"],
      evidence: "required",
      detail: "standard",
    },
  },
  {
    id: "usa-china-corridor",
    body: {
      schema_version: "geomacro.agent-query.v1",
      question: "What are the current trade and geopolitical risks for the United States to China corridor?",
      subjects: [{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CHN" }],
      topics: ["trade_corridor", "conflict_geopolitics"],
      evidence: "required",
      detail: "standard",
    },
  },
  {
    id: "china-risk-object",
    body: {
      schema_version: "geomacro.agent-query.v1",
      question: "Give me the current signed Risk Object for China.",
      subjects: [{ type: "country", country_iso3: "CHN" }],
      topics: ["risk_object"],
      evidence: "required",
      detail: "standard",
    },
  },
];

async function main() {
  const discoveryResponse = await fetch(`${BASE}/.well-known/x402.json`, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (discoveryResponse.status !== 200) {
    throw new Error(`x402 discovery: expected HTTP 200, got ${discoveryResponse.status}`);
  }
  const discovery = await discoveryResponse.json();
  if (discovery.status !== "prelaunch") {
    throw new Error(`x402 discovery is not prelaunch: ${discovery.status}`);
  }
  if (discovery.productionFundsAuthorized !== false) {
    throw new Error("x402 discovery productionFundsAuthorized must remain false before launch");
  }
  if (!Array.isArray(discovery.resources) || discovery.resources.length !== 0) {
    throw new Error("x402 discovery must advertise zero payable production resources before launch");
  }

  const results = [];
  let allFailClosed = true;

  for (const testCase of cases) {
    const response = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(testCase.body),
      redirect: "error",
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${testCase.id}: availability response was not JSON: ${text.slice(0, 500)}`);
    }

    const result = {
      id: testCase.id,
      status: response.status,
      product: body.product ?? null,
      network: body.exact_price?.network ?? null,
      amount_usdc: body.exact_price?.amount_usdc ?? null,
      query_plan_hash: body.query_plan_hash ?? null,
      deliverable: body.availability?.deliverable ?? false,
      code: body.availability?.code ?? null,
      missing_modules: body.availability?.missing_modules ?? [],
      stale_modules: body.availability?.stale_modules ?? [],
      ineligible_source_ids: body.availability?.ineligible_source_ids ?? [],
      source_contracts: body.availability?.source_contracts ?? [],
      subjects: body.availability?.subjects ?? [],
      execution_authorized: body.execution_authorized ?? null,
      payment_required_now: body.payment_required_now ?? null,
    };
    results.push(result);

    const failClosed = (
      response.status === 422 &&
      result.deliverable === false &&
      ["NOT_AVAILABLE", "INSUFFICIENT_COVERAGE"].includes(result.code) &&
      body.payment_required_now === false &&
      body.execution_authorized === false &&
      typeof body.query_plan_hash === "string" &&
      /^[0-9a-f]{64}$/.test(body.query_plan_hash)
    );

    if (!failClosed) {
      allFailClosed = false;
    }
  }

  console.log(JSON.stringify({
    schema_version: "geomacro.live-x402-prelaunch-availability.v2",
    checked_at: new Date().toISOString(),
    host: BASE,
    payment_performed: false,
    real_funds_touched: false,
    discovery_prelaunch: true,
    production_funds_authorized: false,
    all_representative_cases_fail_closed: allFailClosed,
    results,
  }, null, 2));

  if (!allFailClosed) process.exit(2);
}
main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

#!/usr/bin/env node

const scenarios = [
  {
    name: "USA>CHN",
    expectedSubject: "USA>CHN",
    body: {
      subject: { type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CHN" },
      policy_preset: "cautious",
      action_type: "agent_payment",
      amount_usdc: 10000,
    },
  },
  {
    name: "CHN>USA",
    expectedSubject: "CHN>USA",
    body: {
      subject: { type: "corridor", origin_country_iso3: "CHN", destination_country_iso3: "USA" },
      policy_preset: "cautious",
      action_type: "agent_payment",
      amount_usdc: 10000,
    },
  },
  {
    name: "USA",
    expectedSubject: "USA",
    body: {
      subject: { type: "country", country_iso3: "USA" },
      policy_preset: "cautious",
      action_type: "agent_payment",
      amount_usdc: 10000,
    },
  },
  {
    name: "CHN",
    expectedSubject: "CHN",
    body: {
      subject: { type: "country", country_iso3: "CHN" },
      policy_preset: "cautious",
      action_type: "agent_payment",
      amount_usdc: 10000,
    },
  },
];

const url = "https://geomacro.live/api/demo/preflight";
const attempts = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probe(scenario) {
  let lastFailure = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "geomacro-public-demo-health/1.0",
        },
        body: JSON.stringify(scenario.body),
        signal: AbortSignal.timeout(20_000),
      });

      let payload = null;
      try { payload = await response.json(); } catch {}

      const subjectId = payload?.risk_object?.subject?.id ?? null;
      const executionAuthorized =
        payload?.risk_gate?.execution_authorized ??
        payload?.boundaries?.execution_authorized ??
        null;

      if (
        response.status === 200 &&
        payload?.ok === true &&
        payload?.mode === "PUBLIC_SANDBOX" &&
        subjectId === scenario.expectedSubject &&
        executionAuthorized === false
      ) {
        return {
          scenario: scenario.name,
          status: response.status,
          object_id: payload?.risk_object?.object_id ?? null,
          expires_at: payload?.risk_object?.expires_at ?? null,
          verification_status: payload?.risk_object?.verification?.status ?? null,
          commercial_eligibility_status: payload?.risk_object?.commercial_eligibility?.status ?? null,
          decision: payload?.risk_gate?.decision ?? null,
          execution_authorized: false,
          attempt,
        };
      }

      lastFailure = {
        attempt,
        status: response.status,
        ok: payload?.ok ?? null,
        mode: payload?.mode ?? null,
        subject_id: subjectId,
        execution_authorized: executionAuthorized,
        code: payload?.code ?? payload?.error ?? null,
      };
    } catch (error) {
      lastFailure = { attempt, error: error instanceof Error ? error.message : String(error) };
    }

    if (attempt < attempts) await sleep(15_000);
  }

  throw new Error(`PUBLIC_DEMO_LIVE_FAILED ${scenario.name}: ${JSON.stringify(lastFailure)}`);
}

async function main() {
  const results = [];
  for (const scenario of scenarios) results.push(await probe(scenario));
  console.log(JSON.stringify({
    ok: true,
    checked_at: new Date().toISOString(),
    endpoint: url,
    scenario_count: results.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env node

const baseUrl = String(process.env.GEOMACRO_COMMERCE_LEDGER_URL ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\//i.test(baseUrl)) {
  throw new Error("COMMERCE_LEDGER_HEALTH_CONFIG_REQUIRED");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const maxAttempts = 12;
let lastSummary = "not_attempted";

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3_000) });
    const payload = await response.json().catch(() => null);
    const valid =
      response.ok &&
      payload?.ok === true &&
      payload?.service === "geomacro-commerce-ledger" &&
      payload?.storage === "durable_objects_sqlite";

    if (valid) {
      console.log(JSON.stringify({
        ok: true,
        schema: "geomacro.commerce-ledger-health-wait.v1",
        attempts: attempt,
        status: response.status,
      }));
      process.exit(0);
    }

    lastSummary = `status=${response.status};ok=${String(payload?.ok)};service=${String(payload?.service)};storage=${String(payload?.storage)}`;
  } catch (error) {
    lastSummary = `fetch_error=${error instanceof Error ? error.name : "unknown"}`;
  }

  if (attempt < maxAttempts) await sleep(1_500);
}

throw new Error(`COMMERCE_LEDGER_HEALTH_PROPAGATION_TIMEOUT:${lastSummary}`);

import process from "node:process";

const ALLOWED_PRODUCTION_ORIGINS = new Set([
  "https://geomacro.live",
  "https://www.geomacro.live",
]);

function required(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeIso3(value: string): string {
  const iso3 = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) throw new Error("COMMERCIAL_ACCEPTANCE_COUNTRY must be ISO3");
  return iso3;
}

type JsonRecord = Record<string, any>;

async function callApi(input: {
  baseUrl: string;
  apiKey: string;
  requestId: string;
  capability: "structural_country_digest" | "structural_country_profile";
  countryIso3: string;
}) {
  const response = await fetch(`${input.baseUrl}/api/commercial/structural`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      request_id: input.requestId,
      capability: input.capability,
      subject: {
        type: "country",
        country_iso3: input.countryIso3,
      },
    }),
    redirect: "error",
  });

  const raw = await response.text();
  let body: JsonRecord;
  try {
    body = JSON.parse(raw) as JsonRecord;
  } catch {
    throw new Error(`Commercial API returned non-JSON HTTP ${response.status}`);
  }
  return { status: response.status, body };
}

function assertBoundary(body: JsonRecord) {
  if (body?.boundaries?.raw_data_included !== false) throw new Error("raw_data_included boundary failed");
  if (body?.boundaries?.private_warehouse_access !== false) throw new Error("private_warehouse_access boundary failed");
  if (body?.boundaries?.execution_authorized !== false) throw new Error("execution_authorized boundary failed");
}

function assertNoRawLeak(body: JsonRecord) {
  const serialized = JSON.stringify(body);
  for (const forbidden of ["service_role", "api_key_hash", "source_url", '"provenance"']) {
    if (serialized.includes(forbidden)) throw new Error(`Forbidden commercial response field detected: ${forbidden}`);
  }
}

async function main() {
  const apiKey = required("COMMERCIAL_PILOT_API_KEY");
  const configuredBase = String(process.env.COMMERCIAL_API_BASE_URL ?? "https://geomacro.live").trim();
  const baseUrl = configuredBase.replace(/\/$/, "");
  const origin = new URL(baseUrl).origin;
  if (!ALLOWED_PRODUCTION_ORIGINS.has(origin) || baseUrl !== origin) {
    throw new Error("Production acceptance refuses any host other than geomacro.live");
  }
  const countryIso3 = normalizeIso3(process.env.COMMERCIAL_ACCEPTANCE_COUNTRY ?? "CHN");
  const requestId = `commercial-accept-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  const first = await callApi({
    baseUrl,
    apiKey,
    requestId,
    capability: "structural_country_digest",
    countryIso3,
  });
  if (first.status !== 200 || first.body?.ok !== true) {
    throw new Error(`Initial commercial request failed: HTTP ${first.status} ${first.body?.error?.code ?? "UNKNOWN"}`);
  }
  assertBoundary(first.body);
  assertNoRawLeak(first.body);
  if (first.body?.boundaries?.structured_delivery_only !== true) throw new Error("structured_delivery_only boundary failed");
  if (first.body?.boundaries?.structural_data_is_gri_v1_2_input !== false) {
    throw new Error("GRI v1.2 structural-data boundary failed");
  }
  if (first.body?.entitlement?.idempotent_replay !== false) throw new Error("First request unexpectedly reported replay");
  if (typeof first.body?.entitlement?.credits_remaining !== "number") throw new Error("Missing credits_remaining");
  if (!first.body?.audit?.response_sha256 || !/^[0-9a-f]{64}$/.test(first.body.audit.response_sha256)) {
    throw new Error("Missing/invalid response SHA-256");
  }

  const replay = await callApi({
    baseUrl,
    apiKey,
    requestId,
    capability: "structural_country_digest",
    countryIso3,
  });
  if (replay.status !== 200 || replay.body?.ok !== true) throw new Error(`Exact replay failed: HTTP ${replay.status}`);
  assertBoundary(replay.body);
  assertNoRawLeak(replay.body);
  if (replay.body?.entitlement?.idempotent_replay !== true) throw new Error("Exact replay did not report idempotent_replay=true");
  if (replay.body?.entitlement?.credits_remaining !== first.body.entitlement.credits_remaining) {
    throw new Error("Exact replay consumed credits twice");
  }

  const conflict = await callApi({
    baseUrl,
    apiKey,
    requestId,
    capability: "structural_country_profile",
    countryIso3,
  });
  if (conflict.status !== 403 || conflict.body?.ok !== false || conflict.body?.error?.code !== "IDEMPOTENCY_CONFLICT") {
    throw new Error(`Mutated replay did not fail closed with IDEMPOTENCY_CONFLICT: HTTP ${conflict.status}`);
  }
  assertBoundary(conflict.body);
  assertNoRawLeak(conflict.body);

  const badAuth = await callApi({
    baseUrl,
    apiKey: `${apiKey}x`,
    requestId: `${requestId}-bad-auth`,
    capability: "structural_country_digest",
    countryIso3,
  });
  if (badAuth.status !== 401 || badAuth.body?.ok !== false) {
    throw new Error(`Invalid API key did not fail closed: HTTP ${badAuth.status}`);
  }
  assertBoundary(badAuth.body);
  assertNoRawLeak(badAuth.body);

  const evidence = {
    schema: "geomacro-commercial-api-production-acceptance-v1",
    accepted_at: new Date().toISOString(),
    host: origin,
    country_iso3: countryIso3,
    request_id: requestId,
    first_request: {
      status: first.status,
      delivery_id: first.body.delivery_id,
      tier: first.body.entitlement?.tier,
      capability: first.body.entitlement?.capability,
      credit_cost: first.body.entitlement?.credit_cost,
      credits_remaining: first.body.entitlement?.credits_remaining,
      idempotent_replay: first.body.entitlement?.idempotent_replay,
      response_sha256: first.body.audit?.response_sha256,
    },
    exact_replay: {
      status: replay.status,
      idempotent_replay: replay.body.entitlement?.idempotent_replay,
      credits_remaining: replay.body.entitlement?.credits_remaining,
      no_double_charge: replay.body.entitlement?.credits_remaining === first.body.entitlement?.credits_remaining,
    },
    mutated_replay: {
      status: conflict.status,
      error_code: conflict.body.error?.code,
      fail_closed: conflict.body.error?.code === "IDEMPOTENCY_CONFLICT",
    },
    invalid_auth: {
      status: badAuth.status,
      fail_closed: badAuth.status === 401,
    },
    boundaries: {
      raw_data_included: false,
      private_warehouse_access: false,
      structured_delivery_only: true,
      execution_authorized: false,
      structural_data_is_gri_v1_2_input: false,
      api_key_logged: false,
    },
  };

  const outputPath = String(process.env.COMMERCIAL_ACCEPTANCE_OUTPUT ?? "").trim();
  if (outputPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(`Commercial API production acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

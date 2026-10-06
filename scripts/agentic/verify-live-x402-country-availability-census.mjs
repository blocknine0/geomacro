#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = String(process.env.GEOMACRO_LIVE_HOST ?? "https://geomacro.live").replace(/\/$/, "");
const AVAILABILITY_URL = `${BASE}/api/x402/risk/availability`;
const BASE_SEPOLIA_NETWORK = "eip155:84532";
const MIN_DELIVERABLE = Math.max(195, Number(process.env.GEOMACRO_X402_MIN_COUNTRY_PATHS ?? 195));
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.GEOMACRO_X402_COUNTRY_CENSUS_CONCURRENCY ?? 2)));\nconst PACING_MS = Math.max(100, Math.min(2_000, Number(process.env.GEOMACRO_X402_COUNTRY_CENSUS_PACING_MS ?? 650)));\nconst ENFORCE = String(process.env.GEOMACRO_X402_COUNTRY_CENSUS_ENFORCE ?? "true").trim().toLowerCase() !== "false";
const OUT = String(process.env.GEOMACRO_X402_COUNTRY_CENSUS_OUT ?? "artifacts/live-x402-country-availability-census.json");
const SAFE_FAIL_CLOSED_CODES = new Set([
  "NOT_AVAILABLE",
  "INSUFFICIENT_COVERAGE",
  "COMMERCIAL_SOURCE_NOT_ELIGIBLE",
]);

const classification = readFileSync(
  new URL("../../src/lib/global-entity-classification.ts", import.meta.url),
  "utf8",
);

function parseSet(name) {
  const startMarker = `const ${name} = new Set([`;
  const start = classification.indexOf(startMarker);
  if (start < 0) throw new Error(`${name}_DECLARATION_MISSING`);
  const end = classification.indexOf("]);", start);
  if (end < 0) throw new Error(`${name}_DECLARATION_END_MISSING`);
  return [
    ...classification
      .slice(start, end)
      .matchAll(/"([A-Z]{3})"/g),
  ].map((match) => match[1]);
}

const groups = {
  SOVEREIGN: parseSet("SOVEREIGN_ISO3"),
  TERRITORY: parseSet("TERRITORY_ISO3"),
  SPECIAL_ENTITY: parseSet("SPECIAL_ENTITY_ISO3"),
};

if (groups.SOVEREIGN.length !== 194) {
  throw new Error(`CANONICAL_SOVEREIGN_COUNT_DRIFT:${groups.SOVEREIGN.length}`);
}
if (groups.TERRITORY.length !== 53) {
  throw new Error(`CANONICAL_TERRITORY_COUNT_DRIFT:${groups.TERRITORY.length}`);
}
if (groups.SPECIAL_ENTITY.length !== 3) {
  throw new Error(`CANONICAL_SPECIAL_COUNT_DRIFT:${groups.SPECIAL_ENTITY.length}`);
}

const entities = Object.entries(groups)
  .flatMap(([scope, iso3s]) => iso3s.map((iso3) => ({ iso3, scope })))
  .sort((a, b) => a.iso3.localeCompare(b.iso3));

if (entities.length !== 250 || new Set(entities.map((row) => row.iso3)).size !== 250) {
  throw new Error("CANONICAL_250_ENTITY_UNIVERSE_INVALID");
}

function requestFor(iso3) {
  return {
    schema_version: "geomacro.agent-query.v1",
    question: `Give me the current signed Risk Object for ${iso3}.`,
    subjects: [{ type: "country", country_iso3: iso3 }],
    topics: ["risk_object"],
    evidence: "required",
    detail: "compact",
  };
}

async function fetchAvailability(entity) {
  const serialized = JSON.stringify(requestFor(entity.iso3));
  let lastError = null;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(AVAILABILITY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "cache-control": "no-cache",
        },
        body: serialized,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();

      if (response.status === 429) {
        lastError = "HTTP_429";
        const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "0");
        if (attempt < 6) {
          const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? Math.min(10_000, retryAfterSeconds * 1000)
            : Math.min(10_000, attempt * 1_500);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return {
          ...entity,
          outcome: "INCOMPLETE",
          status: 429,
          code: "RATE_LIMITED",
          network: null,
          query_plan_hash: null,
        };
      }

      if (response.status >= 500) {
        lastError = `HTTP_${response.status}`;
        if (attempt < 6) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, attempt * 1_500)));
          continue;
        }
        return {
          ...entity,
          outcome: "INCOMPLETE",
          status: response.status,
          code: lastError,
          network: null,
          query_plan_hash: null,
        };
      }

      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return {
          ...entity,
          outcome: "UNSAFE",
          status: response.status,
          code: "NON_JSON_RESPONSE",
          network: null,
          query_plan_hash: null,
        };
      }

      const invariantSafe =
        body?.payment_required_now === false &&
        body?.execution_authorized === false &&
        typeof body?.query_plan_hash === "string" &&
        /^[0-9a-f]{64}$/.test(body.query_plan_hash);

      if (!invariantSafe) {
        return {
          ...entity,
          outcome: "UNSAFE",
          status: response.status,
          code: "PRELAUNCH_BOUNDARY_VIOLATION",
          network: body?.exact_price?.network ?? null,
          query_plan_hash: body?.query_plan_hash ?? null,
        };
      }

      if (
        response.status === 200 &&
        body?.availability?.deliverable === true &&
        body?.availability?.code === "AVAILABLE" &&
        body?.exact_price?.network === BASE_SEPOLIA_NETWORK
      ) {
        return {
          ...entity,
          outcome: "AVAILABLE",
          status: response.status,
          code: "AVAILABLE",
          network: body.exact_price.network,
          query_plan_hash: body.query_plan_hash,
        };
      }

      if (
        response.status === 422 &&
        body?.availability?.deliverable === false &&
        SAFE_FAIL_CLOSED_CODES.has(body?.availability?.code)
      ) {
        return {
          ...entity,
          outcome: "FAIL_CLOSED",
          status: response.status,
          code: body.availability.code,
          network: body?.exact_price?.network ?? null,
          query_plan_hash: body.query_plan_hash,
          missing_modules: Array.isArray(body?.availability?.missing_modules)
            ? body.availability.missing_modules.slice(0, 20)
            : [],
          stale_modules: Array.isArray(body?.availability?.stale_modules)
            ? body.availability.stale_modules.slice(0, 20)
            : [],
        };
      }

      return {
        ...entity,
        outcome: "UNSAFE",
        status: response.status,
        code: body?.availability?.code ?? `UNEXPECTED_HTTP_${response.status}`,
        network: body?.exact_price?.network ?? null,
        query_plan_hash: body?.query_plan_hash ?? null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
        continue;
      }
    }
  }

  return {
    ...entity,
    outcome: "INCOMPLETE",
    status: null,
    code: `REQUEST_FAILED:${String(lastError ?? "unknown").slice(0, 120)}`,
    network: null,
    query_plan_hash: null,
  };
}

async function mapLimit(rows, limit, fn) {
  const output = new Array(rows.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= rows.length) return;
      output[index] = await fn(rows[index]);\n      await new Promise((resolve) => setTimeout(resolve, PACING_MS));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, () => worker()));
  return output;
}

const results = await mapLimit(entities, CONCURRENCY, fetchAvailability);
const available = results.filter((row) => row.outcome === "AVAILABLE");
const failClosed = results.filter((row) => row.outcome === "FAIL_CLOSED");
const unsafe = results.filter((row) => row.outcome === "UNSAFE");\nconst incomplete = results.filter((row) => row.outcome === "INCOMPLETE");

const byScope = Object.fromEntries(
  Object.keys(groups).map((scope) => {
    const rows = results.filter((row) => row.scope === scope);
    return [
      scope,
      {
        total: rows.length,
        available: rows.filter((row) => row.outcome === "AVAILABLE").length,
        fail_closed: rows.filter((row) => row.outcome === "FAIL_CLOSED").length,
        unsafe: rows.filter((row) => row.outcome === "UNSAFE").length,\n        incomplete: rows.filter((row) => row.outcome === "INCOMPLETE").length,
      },
    ];
  }),
);

const unavailableCodes = {};
for (const row of failClosed) {
  unavailableCodes[row.code] = (unavailableCodes[row.code] ?? 0) + 1;
}

const evidence = {
  schema_version: "geomacro.live-x402-country-availability-census.v1",
  checked_at: new Date().toISOString(),
  host: BASE,
  endpoint: AVAILABILITY_URL,
  payment_performed: false,
  real_funds_touched: false,
  execution_authorized: false,
  canonical_entity_count: entities.length,
  canonical_sovereign_count: groups.SOVEREIGN.length,
  canonical_territory_count: groups.TERRITORY.length,
  canonical_special_entity_count: groups.SPECIAL_ENTITY.length,
  required_minimum_deliverable_paths: MIN_DELIVERABLE,
  deliverable_path_count: available.length,
  fail_closed_path_count: failClosed.length,
  unsafe_path_count: unsafe.length,\n  incomplete_path_count: incomplete.length,\n  enforcement_enabled: ENFORCE,
  all_available_paths_testnet_only: available.every((row) => row.network === BASE_SEPOLIA_NETWORK),
  threshold_satisfied: available.length >= MIN_DELIVERABLE,
  by_scope: byScope,
  fail_closed_codes: unavailableCodes,
  unavailable_entities: failClosed.map((row) => ({
    iso3: row.iso3,
    scope: row.scope,
    code: row.code,
    missing_modules: row.missing_modules ?? [],
    stale_modules: row.stale_modules ?? [],
  })),
  unsafe_entities: unsafe,\n  incomplete_entities: incomplete,
  results,
};

mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));

if (unsafe.length > 0) {
  throw new Error(`X402_COUNTRY_CENSUS_UNSAFE_PATHS:${unsafe.length}`);
}
if (ENFORCE && incomplete.length > 0) {
  throw new Error(`X402_COUNTRY_CENSUS_INCOMPLETE_PATHS:${incomplete.length}`);
}
if (ENFORCE && available.length < MIN_DELIVERABLE) {
  throw new Error(
    `X402_COUNTRY_DELIVERABILITY_BELOW_1414_TARGET:required=${MIN_DELIVERABLE}:available=${available.length}`,
  );
}
if (!ENFORCE && (incomplete.length > 0 || available.length < MIN_DELIVERABLE)) {
  console.warn(
    `EVIDENCE_ONLY: live production is not yet at #1414 country threshold; available=${available.length}, incomplete=${incomplete.length}, required=${MIN_DELIVERABLE}`,
  );
}

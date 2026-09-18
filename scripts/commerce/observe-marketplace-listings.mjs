import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const targets = [
  {
    key: "coinbase_bazaar",
    urlEnv: "GEOMACRO_COINBASE_BAZAAR_OBSERVATION_URL",
    authEnv: "GEOMACRO_COINBASE_BAZAAR_OBSERVATION_AUTHORIZATION",
    allowedHosts: (host) =>
      host === "coinbase.com" ||
      host.endsWith(".coinbase.com") ||
      host === "x402.org" ||
      host.endsWith(".x402.org"),
    endpoint: "https://geomacro.live/api/x402/intelligence",
  },
  {
    key: "circle_agent_marketplace",
    urlEnv: "GEOMACRO_CIRCLE_MARKETPLACE_OBSERVATION_URL",
    authEnv: "GEOMACRO_CIRCLE_MARKETPLACE_OBSERVATION_AUTHORIZATION",
    allowedHosts: (host) => host === "circle.com" || host.endsWith(".circle.com"),
    endpoint: "https://geomacro.live/api/x402/circle/intelligence",
  },
  {
    key: "nevermined_registry",
    urlEnv: "GEOMACRO_NEVERMINED_REGISTRY_OBSERVATION_URL",
    authEnv: "GEOMACRO_NEVERMINED_REGISTRY_OBSERVATION_AUTHORIZATION",
    allowedHosts: (host) =>
      host === "nevermined.app" ||
      host.endsWith(".nevermined.app") ||
      host === "nevermined.ai" ||
      host.endsWith(".nevermined.ai"),
    endpoint: "https://geomacro.live/api/x402/nevermined/intelligence",
  },
];

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function boundedText(response, label) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    fail(`${label} response is larger than the observation limit`);
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    fail(`${label} response exceeded the observation limit`);
  }
  return body;
}

function normalizedSearchBody(body) {
  // JSON escapes slashes/URLs inconsistently across registries. Decode valid JSON
  // before searching while retaining raw text as fallback.
  try {
    return JSON.stringify(JSON.parse(body));
  } catch {
    return body;
  }
}

async function observe(target) {
  const raw = required(target.urlEnv);
  const url = new URL(raw);
  if (url.protocol !== "https:") fail(`${target.key} observation URL must use HTTPS`);
  if (url.username || url.password || url.hash) {
    fail(`${target.key} observation URL must not contain credentials or fragments`);
  }
  const host = url.hostname.toLowerCase();
  if (!target.allowedHosts(host)) {
    fail(`${target.key} observation host is not on the approved provider domain allowlist: ${host}`);
  }

  const headers = {
    Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    "User-Agent": "GeomacroMarketplaceObservation/1.0",
    "Cache-Control": "no-cache",
  };
  const authorization = String(process.env[target.authEnv] ?? "").trim();
  if (authorization) headers.Authorization = authorization;

  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 200) {
    fail(`${target.key} observation returned HTTP ${response.status}`);
  }

  const body = await boundedText(response, target.key);
  const searchable = normalizedSearchBody(body);
  const serviceObserved =
    searchable.includes("Geomacro Risk Intelligence") ||
    searchable.includes('"Geomacro"') ||
    searchable.includes(">Geomacro<");
  const endpointObserved =
    searchable.includes(target.endpoint) ||
    searchable.includes(target.endpoint.replaceAll("/", "\\/"));

  if (!serviceObserved) fail(`${target.key} response did not expose Geomacro service identity`);
  if (!endpointObserved) fail(`${target.key} response did not expose the exact canonical Geomacro endpoint`);

  return {
    marketplace: target.key,
    observed: true,
    observation_host: host,
    observation_path: url.pathname,
    observation_query_sha256: url.search ? sha256(url.search) : null,
    response_sha256: sha256(body),
    content_type: response.headers.get("content-type") || null,
    canonical_endpoint: target.endpoint,
    exact_endpoint_observed: true,
    service_identity_observed: true,
    authorization_header_used: Boolean(authorization),
    authorization_header_persisted: false,
    response_body_persisted: false,
  };
}

async function main() {
  const canonicalSha = required("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA").toLowerCase();
  if (!SHA.test(canonicalSha)) fail("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA must be a full SHA");

  const observations = [];
  for (const target of targets) observations.push(await observe(target));

  const result = {
    schema_version: "geomacro.marketplace-observation-acceptance.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: canonicalSha,
    observations,
    gates: {
      coinbase_bazaar_observed: observations.some((x) => x.marketplace === "coinbase_bazaar"),
      circle_agent_marketplace_observed: observations.some(
        (x) => x.marketplace === "circle_agent_marketplace",
      ),
      nevermined_registry_observed: observations.some(
        (x) => x.marketplace === "nevermined_registry",
      ),
      exact_canonical_endpoint_observed_for_all: observations.every(
        (x) => x.exact_endpoint_observed === true,
      ),
      listing_claim_may_not_be_inferred_from_payment: true,
    },
    listing_submission_performed_by_this_script: false,
    public_marketing_performed_by_this_script: false,
    result: "PASS",
  };

  const output =
    process.env.GEOMACRO_MARKETPLACE_OBSERVATION_OUTPUT?.trim() ||
    "artifacts/marketplace-observation/initial-cohort-observed.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("PASS: Coinbase Bazaar + Circle Agent Marketplace + Nevermined registry visibility observed.");
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

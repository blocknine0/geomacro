import process from "node:process";

const baseUrl = (process.env.GEOMACRO_LIVE_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const expectedHost = process.env.GEOMACRO_LIVE_EXPECTED_HOST || "geomacro.live";
const expectedSha = String(process.env.GEOMACRO_EXPECTED_DEPLOYED_SHA || "").trim().toLowerCase();
const timeoutMs = Number(process.env.GEOMACRO_LIVE_SMOKE_TIMEOUT_MS || "10000");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const parsed = new URL(baseUrl);
assert(parsed.protocol === "https:", "Live build probe requires HTTPS");
assert(parsed.hostname === expectedHost, `Refusing unexpected live host ${parsed.hostname}`);
assert(/^[0-9a-f]{40}$/.test(expectedSha), "GEOMACRO_EXPECTED_DEPLOYED_SHA must be a full 40-character commit SHA");

const response = await fetch(`${baseUrl}/.well-known/geomacro-build.json`, {
  method: "GET",
  redirect: "follow",
  headers: {
    accept: "application/json",
    "cache-control": "no-cache",
    "user-agent": "GeomacroBuildAlignment/1.0",
  },
  signal: AbortSignal.timeout(timeoutMs),
});

assert(response.status === 200, `Live build marker expected 200, got ${response.status}`);
assert((response.headers.get("content-type") || "").includes("application/json"), "Live build marker did not return JSON");

const build = await response.json();
const deployedSha = String(build?.canonical_main_sha || "").trim().toLowerCase();
assert(build?.schema_version === "geomacro.deployment-build.v1", "Deployment marker schema is missing or incompatible");
assert(build?.canonical_repository === "blocknine0/geomacro", "Deployment marker points to an unexpected canonical repository");
assert(build?.production_activation_performed === false, "Deployment marker must not authorize production activation");
assert(/^[0-9a-f]{40}$/.test(deployedSha), "Deployment marker does not contain a full canonical main SHA");
assert(
  deployedSha === expectedSha,
  `Live deployment SHA ${deployedSha} does not match expected canonical SHA ${expectedSha}`,
);

console.log(`PASS: geomacro.live is published from canonical SHA ${deployedSha}.`);
console.log("BOUNDARY: read-only deployment evidence check; no mutation, payment, mainnet activation, or load test performed.");

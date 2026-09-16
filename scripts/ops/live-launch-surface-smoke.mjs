import fs from "node:fs";
import process from "node:process";

const baseUrl = (process.env.GEOMACRO_LIVE_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const expectedHost = process.env.GEOMACRO_LIVE_EXPECTED_HOST || "geomacro.live";
const timeoutMs = Number(process.env.GEOMACRO_LIVE_SMOKE_TIMEOUT_MS || "10000");
const expectedDeployedSha = String(process.env.GEOMACRO_EXPECTED_DEPLOYED_SHA || "").trim().toLowerCase();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const parsed = new URL(baseUrl);
assert(parsed.protocol === "https:", "Live smoke requires HTTPS");
assert(parsed.hostname === expectedHost, `Refusing unexpected live host ${parsed.hostname}`);
if (expectedDeployedSha) {
  assert(/^[0-9a-f]{40}$/.test(expectedDeployedSha), "GEOMACRO_EXPECTED_DEPLOYED_SHA must be a full 40-character commit SHA");
}

async function get(path, accept = "*/*") {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "follow",
    headers: {
      accept,
      "user-agent": "GeomacroLaunchAcceptance/1.1",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  return {
    path,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    elapsedMs: Number((performance.now() - started).toFixed(2)),
    response,
    text,
  };
}

const htmlPaths = [
  "/",
  "/risk-gate",
  "/data-api",
  "/research",
  "/institutional",
  "/about",
  "/onchain",
];

const requiredDiscoveryPaths = [
  "/.well-known/x402.json",
  "/.well-known/geomacro-commerce.json",
  "/.well-known/geomacro-agent.json",
  "/.well-known/geomacro-build.json",
  "/openapi-x402.json",
  "/llms.txt",
];

const optionalCompatibilityAliases = ["/.well-known/x402"];

const evidence = {
  schema_version: "geomacro.live-launch-surface-smoke.v2",
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  expected_deployed_sha: expectedDeployedSha || null,
  deployed_sha: null,
  payment_performed: false,
  production_activation_performed: false,
  routes: [],
  machine_discovery: {},
  compatibility_aliases: {},
  result: "RUNNING",
};

function persistEvidence() {
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/live-launch-surface-smoke.json", `${JSON.stringify(evidence, null, 2)}\n`);
}

function assertPrelaunchDiscovery(discovery, label) {
  assert(discovery?.x402Version === 2, `${label} must advertise x402Version=2`);
  assert(discovery?.status === "prelaunch", `${label} must remain prelaunch before owner-authorized launch`);
  assert(discovery?.productionFundsAuthorized === false, `${label} must not authorize production funds`);
  assert(Array.isArray(discovery?.resources) && discovery.resources.length === 0, `${label} must not advertise paid production resources while prelaunch`);
  assert(discovery?.boundaries?.execution_authorized === false, `${label} must remain non-executing`);
}

try {
  for (const path of htmlPaths) {
    const result = await get(path, "text/html");
    evidence.routes.push({ path, status: result.status, elapsed_ms: result.elapsedMs });
    assert(result.status === 200, `${path} expected 200, got ${result.status}`);
    assert(result.contentType.includes("text/html"), `${path} did not return HTML`);
    assert(result.text.length > 500, `${path} returned an unexpectedly small document`);
    assert(!/Internal Server Error|Application error|ReferenceError:\s|TypeError:\s/i.test(result.text), `${path} exposed an application failure marker`);
    if (path === "/onchain") {
      assert(result.text.includes("Arc Testnet"), "/onchain missing Arc Testnet boundary");
      assert(result.text.includes("Mainnet remains disabled"), "/onchain missing explicit mainnet-disabled boundary");
    }
  }

  for (const path of requiredDiscoveryPaths) {
    const result = await get(path);
    evidence.machine_discovery[path] = {
      status: result.status,
      content_type: result.contentType,
      elapsed_ms: result.elapsedMs,
    };
    assert(result.status === 200, `${path} expected 200, got ${result.status}`);
    assert(result.text.length > 20, `${path} returned empty discovery content`);
  }

  // Some static/SSR hosts do not expose extensionless files below .well-known.
  // Keep the route/source as a compatibility alias, but make the portable JSON
  // resource the required machine-discovery contract. A 404 alias is recorded,
  // not converted into a false launch failure.
  for (const path of optionalCompatibilityAliases) {
    const result = await get(path, "application/json");
    evidence.compatibility_aliases[path] = {
      status: result.status,
      content_type: result.contentType,
      elapsed_ms: result.elapsedMs,
      required: false,
    };
    assert(result.status === 200 || result.status === 404, `${path} compatibility alias returned unexpected HTTP ${result.status}`);
    if (result.status === 200) {
      assert(result.text.length > 20, `${path} compatibility alias returned empty content`);
      assertPrelaunchDiscovery(JSON.parse(result.text), path);
    }
  }

  const x402Response = await get("/.well-known/x402.json", "application/json");
  const discovery = JSON.parse(x402Response.text);
  assertPrelaunchDiscovery(discovery, "/.well-known/x402.json");

  const buildResponse = await get("/.well-known/geomacro-build.json", "application/json");
  const build = JSON.parse(buildResponse.text);
  const deployedSha = String(build?.canonical_main_sha || "").trim().toLowerCase();
  assert(build?.schema_version === "geomacro.deployment-build.v1", "Deployment marker schema is missing or incompatible");
  assert(/^[0-9a-f]{40}$/.test(deployedSha), "Deployment marker does not contain a full canonical main SHA");
  assert(build?.canonical_repository === "blocknine0/geomacro", "Deployment marker points to an unexpected canonical repository");
  assert(build?.production_activation_performed === false, "Deployment marker must not authorize production activation");
  evidence.deployed_sha = deployedSha;
  if (expectedDeployedSha) {
    assert(deployedSha === expectedDeployedSha, `Live deployment SHA ${deployedSha} does not match expected canonical SHA ${expectedDeployedSha}`);
  }

  const commerceResponse = await get("/.well-known/geomacro-commerce.json", "application/json");
  const commerce = JSON.parse(commerceResponse.text);
  assert(commerce?.service?.status === "prelaunch", "Commerce discovery must remain prelaunch");
  assert(commerce?.service?.execution_authorized === false, "Commerce discovery must remain non-executing");
  assert(commerce?.commercial_contract?.production_funds_authorized === false, "Commerce discovery must not authorize production funds");
  assert(commerce?.discovery?.x402 === `${baseUrl}/.well-known/x402.json`, "Commerce discovery must point to the host-compatible canonical x402 JSON resource");
  for (const [name, provider] of Object.entries(commerce?.offers?.[0]?.providers || {})) {
    assert(provider?.production_enabled === false, `${name} unexpectedly has production_enabled=true`);
  }

  const agentResponse = await get("/.well-known/geomacro-agent.json", "application/json");
  const agent = JSON.parse(agentResponse.text);
  assert(JSON.stringify(agent).length > 50, "Agent discovery JSON is unexpectedly empty");

  const openApiResponse = await get("/openapi-x402.json", "application/json");
  const openapi = JSON.parse(openApiResponse.text);
  assert(typeof openapi?.openapi === "string", "OpenAPI document missing version");
  assert(openapi?.paths && Object.keys(openapi.paths).length > 0, "OpenAPI document has no paths");

  evidence.result = "PASS";
  persistEvidence();
  console.log(`PASS: live launch surface smoke passed for ${htmlPaths.length} public routes and ${requiredDiscoveryPaths.length} required discovery resources.`);
  console.log(`DEPLOYED_SHA: ${deployedSha}`);
  console.log("BOUNDARY: no payment, settlement, mainnet activation, mutation, or load test was performed.");
} catch (error) {
  evidence.result = "FAIL";
  evidence.failure = error instanceof Error ? error.message : String(error);
  persistEvidence();
  console.error(`FAIL: ${evidence.failure}`);
  console.error("BOUNDARY: no payment, settlement, mainnet activation, mutation, or load test was performed.");
  throw error;
}

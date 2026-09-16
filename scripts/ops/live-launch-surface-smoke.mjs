import fs from "node:fs";
import process from "node:process";

const baseUrl = (process.env.GEOMACRO_LIVE_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const expectedHost = process.env.GEOMACRO_LIVE_EXPECTED_HOST || "geomacro.live";
const timeoutMs = Number(process.env.GEOMACRO_LIVE_SMOKE_TIMEOUT_MS || "10000");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const parsed = new URL(baseUrl);
assert(parsed.protocol === "https:", "Live smoke requires HTTPS");
assert(parsed.hostname === expectedHost, `Refusing unexpected live host ${parsed.hostname}`);

async function get(path, accept = "*/*") {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    redirect: "follow",
    headers: {
      accept,
      "user-agent": "GeomacroLaunchAcceptance/1.0",
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

const evidence = {
  schema_version: "geomacro.live-launch-surface-smoke.v1",
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  payment_performed: false,
  production_activation_performed: false,
  routes: [],
  machine_discovery: {},
};

for (const path of htmlPaths) {
  const result = await get(path, "text/html");
  assert(result.status === 200, `${path} expected 200, got ${result.status}`);
  assert(result.contentType.includes("text/html"), `${path} did not return HTML`);
  assert(result.text.length > 500, `${path} returned an unexpectedly small document`);
  assert(!/Internal Server Error|Application error|ReferenceError:\s|TypeError:\s/i.test(result.text), `${path} exposed an application failure marker`);
  if (path === "/onchain") {
    assert(result.text.includes("Arc Testnet"), "/onchain missing Arc Testnet boundary");
    assert(result.text.includes("Mainnet remains disabled"), "/onchain missing explicit mainnet-disabled boundary");
  }
  evidence.routes.push({ path, status: result.status, elapsed_ms: result.elapsedMs });
}

const discoveryPaths = [
  "/.well-known/x402",
  "/.well-known/x402.json",
  "/.well-known/geomacro-commerce.json",
  "/.well-known/geomacro-agent.json",
  "/openapi-x402.json",
  "/llms.txt",
];

for (const path of discoveryPaths) {
  const result = await get(path);
  assert(result.status === 200, `${path} expected 200, got ${result.status}`);
  assert(result.text.length > 20, `${path} returned empty discovery content`);
  evidence.machine_discovery[path] = {
    status: result.status,
    content_type: result.contentType,
    elapsed_ms: result.elapsedMs,
  };
}

const commerceResponse = await get("/.well-known/geomacro-commerce.json", "application/json");
const commerce = JSON.parse(commerceResponse.text);
assert(commerce?.service?.status === "prelaunch", "Commerce discovery must remain prelaunch");
assert(commerce?.service?.execution_authorized === false, "Commerce discovery must remain non-executing");
assert(commerce?.commercial_contract?.production_funds_authorized === false, "Commerce discovery must not authorize production funds");
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

fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/live-launch-surface-smoke.json", `${JSON.stringify(evidence, null, 2)}\n`);

console.log(`PASS: live launch surface smoke passed for ${htmlPaths.length} public routes and ${discoveryPaths.length} discovery resources.`);
console.log("BOUNDARY: no payment, settlement, mainnet activation, mutation, or load test was performed.");

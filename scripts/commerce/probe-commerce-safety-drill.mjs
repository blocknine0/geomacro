import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const PUBLIC_HOSTS = new Set(["geomacro.live", "www.geomacro.live"]);
const MODES = new Set([
  "normal",
  "global_freeze",
  "quarantine_coinbase_x402",
  "quarantine_circle_gateway_x402",
  "quarantine_nevermined",
]);
const providerPaths = {
  coinbase_x402: "/api/x402/intelligence",
  circle_gateway_x402: "/api/x402/circle/intelligence",
  nevermined: "/api/x402/nevermined/intelligence",
};

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

async function json(response, label) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} did not return JSON`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function get(base, pathname, label) {
  const response = await fetch(new URL(pathname, base), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "User-Agent": "GeomacroCommerceSafetyDrill/1.0",
    },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  return { response, body: await json(response, label) };
}

async function main() {
  const mode = required("GEOMACRO_COMMERCE_SAFETY_DRILL_MODE");
  if (!MODES.has(mode)) fail(`Unsupported safety drill mode: ${mode}`);

  const base = new URL(required("GEOMACRO_PRODUCTION_CANARY_BASE_URL"));
  const expectedHost = required("GEOMACRO_PRODUCTION_CANARY_EXPECTED_HOST").toLowerCase();
  const expectedSha = required("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA").toLowerCase();

  if (!SHA.test(expectedSha)) fail("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA must be a full SHA");
  if (base.protocol !== "https:") fail("Safety drill canary must use HTTPS");
  if (base.hostname.toLowerCase() !== expectedHost) fail("Safety drill host mismatch");
  if (PUBLIC_HOSTS.has(expectedHost)) fail("Safety drill may not target the public production host");
  if (base.username || base.password || base.search || base.hash) fail("Safety drill URL contains unsafe components");

  const build = await get(base, "/.well-known/geomacro-build.json", "build marker");
  if (build.response.status !== 200) fail(`Build marker HTTP ${build.response.status}`);
  if (
    build.body?.schema_version !== "geomacro.deployment-build.v1" ||
    String(build.body?.canonical_main_sha ?? "").toLowerCase() !== expectedSha
  ) {
    fail("Safety drill target is not the exact accepted canonical SHA");
  }

  const discovery = await get(base, "/.well-known/x402.json", "x402 discovery");
  if (discovery.response.status !== 200) fail(`x402 discovery HTTP ${discovery.response.status}`);

  const advertised = new Set(
    Array.isArray(discovery.body?.resources)
      ? discovery.body.resources.map((row) => String(row?.provider ?? ""))
      : [],
  );
  const runtime = discovery.body?.runtimeSafety ?? {};
  const expectedProviders = new Set(Object.keys(providerPaths));

  const providerChecks = {};
  for (const [provider, pathname] of Object.entries(providerPaths)) {
    const result = await get(base, pathname, `${provider} status`);
    providerChecks[provider] = {
      status: result.response.status,
      configured: result.body?.configured ?? null,
      ok: result.body?.ok ?? null,
      response_sha256: sha256(JSON.stringify(result.body)),
    };
  }

  if (mode === "normal") {
    if (
      discovery.body?.status !== "production" ||
      discovery.body?.productionFundsAuthorized !== true ||
      runtime?.coordinated_launch_authorized !== true ||
      runtime?.emergency_freeze_active !== false
    ) {
      fail("Normal safety-drill phase is not an authorized, unfrozen canary runtime");
    }
    if (Array.isArray(runtime?.quarantined_providers) && runtime.quarantined_providers.length > 0) {
      fail("Normal safety-drill phase unexpectedly has quarantined providers");
    }
    for (const provider of expectedProviders) {
      if (!advertised.has(provider)) fail(`Normal phase discovery missing ${provider}`);
      if (providerChecks[provider].status !== 200 || providerChecks[provider].ok !== true) {
        fail(`Normal phase provider status is unhealthy: ${provider}`);
      }
    }
  } else if (mode === "global_freeze") {
    if (
      runtime?.emergency_freeze_active !== true ||
      runtime?.coordinated_launch_authorized !== false ||
      discovery.body?.productionFundsAuthorized !== false ||
      advertised.size !== 0
    ) {
      fail("Global freeze did not remove all payable discovery resources");
    }
    for (const provider of expectedProviders) {
      if (providerChecks[provider].status !== 503) {
        fail(`Global freeze did not fail closed for ${provider}`);
      }
    }
  } else {
    const quarantined = mode.replace("quarantine_", "");
    const list = Array.isArray(runtime?.quarantined_providers)
      ? runtime.quarantined_providers.map(String)
      : [];
    if (!list.includes(quarantined)) fail(`Runtime does not report ${quarantined} as quarantined`);
    if (runtime?.emergency_freeze_active !== false) fail("Provider quarantine phase must not use global freeze");
    if (advertised.has(quarantined)) fail(`Quarantined provider ${quarantined} is still advertised`);
    if (providerChecks[quarantined]?.status !== 503) {
      fail(`Quarantined provider ${quarantined} did not fail closed`);
    }

    for (const provider of expectedProviders) {
      if (provider === quarantined) continue;
      if (!advertised.has(provider)) fail(`Healthy provider ${provider} disappeared during single-provider quarantine`);
      if (providerChecks[provider].status !== 200 || providerChecks[provider].ok !== true) {
        fail(`Healthy provider ${provider} became unavailable during ${quarantined} quarantine`);
      }
    }
  }

  const evidence = {
    schema_version: "geomacro.commerce-safety-drill-phase.v1",
    generated_at: new Date().toISOString(),
    mode,
    canonical_sha: expectedSha,
    canary_host: expectedHost,
    public_production_host_used: false,
    discovery_status: discovery.body?.status ?? null,
    production_funds_authorized: discovery.body?.productionFundsAuthorized ?? null,
    runtime_safety: {
      coordinated_launch_authorized: runtime?.coordinated_launch_authorized ?? null,
      emergency_freeze_active: runtime?.emergency_freeze_active ?? null,
      quarantined_providers: runtime?.quarantined_providers ?? [],
    },
    advertised_providers: [...advertised].sort(),
    provider_checks: providerChecks,
    payment_performed: false,
    settlement_performed: false,
    runtime_mutation_performed_by_this_probe: false,
    result: "PASS",
  };

  const outputDir =
    process.env.GEOMACRO_COMMERCE_SAFETY_DRILL_OUTPUT_DIR?.trim() ||
    "artifacts/commerce-safety-drill";
  await mkdir(outputDir, { recursive: true });
  const output = path.join(outputDir, `${mode}.json`);
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  console.log(`PASS: commerce safety drill phase ${mode}`);
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

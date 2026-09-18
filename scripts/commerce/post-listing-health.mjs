import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
const BASE_MAINNET = "eip155:8453";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const MAX_BODY_BYTES = 1024 * 1024;

const providers = [
  {
    key: "coinbase",
    id: "coinbase_x402",
    path: "/api/x402/intelligence",
    expectedScheme: "exact",
    expectedNetwork: BASE_MAINNET,
    expectedAsset: BASE_USDC,
  },
  {
    key: "circle",
    id: "circle_gateway_x402",
    path: "/api/x402/circle/intelligence",
    expectedScheme: "exact",
    expectedNetwork: BASE_MAINNET,
    expectedAsset: BASE_USDC,
  },
  {
    key: "nevermined",
    id: "nevermined",
    path: "/api/x402/nevermined/intelligence",
    expectedScheme: null,
    expectedNetwork: null,
    expectedAsset: null,
  },
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function base64Json(value, label) {
  if (!value) fail(`${label} header is missing`);
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail(`${label} is not a JSON object`);
    }
    return parsed;
  } catch (error) {
    fail(`${label} is not valid base64 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function boundedJson(response, label) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) fail(`${label} response is too large`);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) fail(`${label} response exceeded size limit`);
  try {
    return { body: JSON.parse(text), text };
  } catch {
    fail(`${label} did not return JSON`);
  }
}

function atomicFromUsdc(value) {
  const raw = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(raw)) fail(`Invalid USDC decimal ${raw}`);
  const [whole, fraction = ""] = raw.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6))).toString();
}

function adaptiveRequest() {
  const country = String(process.env.GEOMACRO_POST_LISTING_COUNTRY_ISO3 ?? "USA")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(country)) fail("GEOMACRO_POST_LISTING_COUNTRY_ISO3 must be ISO3");
  return {
    schema_version: "geomacro.agent-query.v1",
    question: `What are the current Geomacro risk signals and Risk Gate context for ${country}?`,
    subjects: [{ type: "country", country_iso3: country }],
    topics: ["risk_object", "risk_gate"],
    evidence: "required",
    detail: "standard",
    risk_gate_context: {
      policy_preset: "balanced",
      action_type: "treasury_payment",
      amount_usdc: 1000,
    },
    client_request_id: `post-listing-health-${Date.now()}`,
  };
}

function validateRequirement(provider, required, base, getBody, availability) {
  if (required?.x402Version !== 2) fail(`${provider.key} challenge must be x402 v2`);
  const expectedResource = new URL(provider.path, base).toString();
  if (String(required?.resource?.url ?? "") !== expectedResource) {
    fail(`${provider.key} challenge resource URL mismatch`);
  }
  if (!Array.isArray(required.accepts) || required.accepts.length < 1) {
    fail(`${provider.key} challenge has no accepted payment requirement`);
  }
  const acceptance = required.accepts[0];

  if (provider.key === "coinbase") {
    if (acceptance.scheme !== "exact" || acceptance.network !== BASE_MAINNET) {
      fail("Coinbase public 402 is not Base-mainnet exact");
    }
    if (String(acceptance.asset ?? "").toLowerCase() !== BASE_USDC.toLowerCase()) {
      fail("Coinbase public 402 advertises the wrong USDC asset");
    }
    if (!EVM.test(String(acceptance.payTo ?? ""))) fail("Coinbase public 402 payTo is invalid");
    const amount = String(acceptance.amount ?? "");
    if (!/^[1-9]\d*$/.test(amount)) fail("Coinbase public 402 amount is invalid");
    if (amount !== String(availability?.exact_price?.amount_atomic ?? "")) {
      fail("Coinbase unpaid 402 price differs from free availability price");
    }
    if (getBody?.network !== BASE_MAINNET || getBody?.asset !== "USDC") {
      fail("Coinbase GET status metadata differs from unpaid 402");
    }
    if (atomicFromUsdc(getBody?.exact_price_usdc) !== amount) {
      fail("Coinbase GET price differs from unpaid 402");
    }
  } else if (provider.key === "circle") {
    if (acceptance.scheme !== "exact" || acceptance.network !== BASE_MAINNET) {
      fail("Circle public 402 is not Base-mainnet exact");
    }
    if (String(acceptance.asset ?? "").toLowerCase() !== BASE_USDC.toLowerCase()) {
      fail("Circle public 402 advertises the wrong USDC asset");
    }
    if (!EVM.test(String(acceptance.payTo ?? ""))) fail("Circle public 402 payTo is invalid");
    const amount = String(acceptance.amount ?? "");
    if (!/^[1-9]\d*$/.test(amount)) fail("Circle public 402 amount is invalid");
    if (getBody?.network !== BASE_MAINNET || getBody?.asset?.toLowerCase() !== BASE_USDC.toLowerCase()) {
      fail("Circle GET status metadata differs from unpaid 402");
    }
    if (atomicFromUsdc(getBody?.price_usdc) !== amount) {
      fail("Circle GET price differs from unpaid 402");
    }
  } else {
    if (!["nvm:erc4337", "nvm:card-delegation"].includes(acceptance.scheme)) {
      fail("Nevermined live 402 scheme is not approved");
    }
    if (!String(acceptance.network ?? "").trim()) fail("Nevermined live 402 network is missing");
    if (!String(acceptance.planId ?? "").trim()) fail("Nevermined live 402 planId is missing");
    if (getBody?.environment !== "live") fail("Nevermined GET metadata is not live");
    if (getBody?.scheme !== acceptance.scheme || getBody?.network !== acceptance.network) {
      fail("Nevermined GET status metadata differs from unpaid 402");
    }
    if (getBody?.commercial_revenue !== false) {
      fail("Nevermined runtime must not classify an unpaid challenge as commercial revenue");
    }
  }

  return {
    provider: provider.id,
    endpoint: expectedResource,
    scheme: acceptance.scheme,
    network: acceptance.network,
    asset: acceptance.asset ?? null,
    amount_atomic: acceptance.amount ?? null,
    recipient_sha256:
      typeof acceptance.payTo === "string" ? sha256(acceptance.payTo.toLowerCase()) : null,
    plan_id_sha256:
      typeof acceptance.planId === "string" ? sha256(acceptance.planId) : null,
    challenge_hash: sha256(JSON.stringify(required)),
  };
}

async function main() {
  const base = new URL(
    String(process.env.GEOMACRO_PUBLIC_PRODUCTION_BASE_URL ?? "https://geomacro.live"),
  );
  if (base.protocol !== "https:" || base.hostname !== "geomacro.live" || base.pathname !== "/") {
    fail("Post-listing health is pinned to https://geomacro.live/");
  }
  const expectedSha = String(process.env.GEOMACRO_PRODUCTION_ACCEPTANCE_SHA ?? "")
    .trim()
    .toLowerCase();
  if (!SHA.test(expectedSha)) fail("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA must be a full SHA");

  const buildResponse = await fetch(new URL("/.well-known/geomacro-build.json", base), {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (buildResponse.status !== 200) fail(`Live build marker HTTP ${buildResponse.status}`);
  const { body: build } = await boundedJson(buildResponse, "Live build marker");
  if (build?.schema_version !== "geomacro.deployment-build.v1") fail("Live build marker schema mismatch");
  if (String(build?.canonical_main_sha ?? "").toLowerCase() !== expectedSha) {
    fail("Public production is not the exact accepted canonical SHA");
  }

  const request = adaptiveRequest();
  const serialized = JSON.stringify(request);
  const headers = { "Content-Type": "application/json", Accept: "application/json" };

  const availabilityResponse = await fetch(new URL("/api/x402/risk/availability", base), {
    method: "POST",
    headers,
    body: serialized,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const { body: availability } = await boundedJson(
    availabilityResponse,
    "Public no-charge availability",
  );
  if (availabilityResponse.status !== 200 || availability?.ok !== true || availability?.chargeable !== true) {
    fail(`Public no-charge availability is not deliverable: HTTP ${availabilityResponse.status}`);
  }
  if (availability?.execution_authorized !== false || availability?.payment_required_now !== false) {
    fail("Public availability boundary is invalid");
  }

  const health = [];
  for (const provider of providers) {
    const getResponse = await fetch(new URL(provider.path, base), {
      method: "GET",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    const { body: getBody } = await boundedJson(getResponse, `${provider.key} GET status`);
    if (getResponse.status !== 200 || getBody?.ok !== true || getBody?.execution_authorized !== false) {
      fail(`${provider.key} GET status is not healthy production metadata`);
    }

    const response = await fetch(new URL(provider.path, base), {
      method: "POST",
      headers,
      body: serialized,
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
    const { body } = await boundedJson(response, `${provider.key} unpaid POST`);
    if (response.status !== 402) fail(`${provider.key} unpaid POST expected 402, got ${response.status}`);
    const paymentHeader = response.headers.get("PAYMENT-REQUIRED");
    const required = base64Json(paymentHeader, `${provider.key} PAYMENT-REQUIRED`);
    if (JSON.stringify(required) !== JSON.stringify(body)) {
      fail(`${provider.key} PAYMENT-REQUIRED header/body mismatch`);
    }
    health.push(validateRequirement(provider, required, base, getBody, availability));
  }

  const discoveryResponse = await fetch(new URL("/.well-known/x402.json", base), {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const { body: discovery } = await boundedJson(discoveryResponse, "Public x402 discovery");
  if (discoveryResponse.status !== 200 || discovery?.status !== "production") {
    fail("Public x402 discovery is not production");
  }
  if (discovery?.productionFundsAuthorized !== true) {
    fail("Public x402 discovery does not truthfully report production funds authorization");
  }
  if (discovery?.boundaries?.execution_authorized !== false) {
    fail("Public x402 discovery execution boundary is invalid");
  }

  const advertisedProviders = new Set(
    Array.isArray(discovery?.resources)
      ? discovery.resources.map((row) => String(row?.provider ?? ""))
      : [],
  );
  for (const id of ["coinbase_x402", "circle_gateway_x402", "nevermined"]) {
    if (!advertisedProviders.has(id)) fail(`Public x402 discovery is missing active provider ${id}`);
  }

  const result = {
    schema_version: "geomacro.post-listing-health.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: expectedSha,
    public_origin: "https://geomacro.live",
    build_marker_match: true,
    no_charge_availability_status: availabilityResponse.status,
    providers: health,
    discovery_status: discovery.status,
    production_funds_authorized: discovery.productionFundsAuthorized,
    gates: {
      same_exact_sha_public: true,
      no_charge_deliverability_passed: true,
      coinbase_unpaid_402_passed: true,
      circle_unpaid_402_passed: true,
      nevermined_unpaid_402_passed: true,
      runtime_price_network_asset_recipient_or_plan_validated: true,
      all_initial_paid_providers_present_in_runtime_discovery: true,
      execution_authorized: false,
    },
    payment_performed_by_this_check: false,
    settlement_performed_by_this_check: false,
    result: "PASS",
  };

  const output =
    process.env.GEOMACRO_POST_LISTING_HEALTH_OUTPUT?.trim() ||
    "artifacts/post-listing-health/post-listing-health.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("PASS: exact-SHA public production unpaid x402 health passed for Coinbase, Circle and Nevermined.");
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

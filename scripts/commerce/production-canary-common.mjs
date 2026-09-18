import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const ISO3 = /^[A-Z]{3}$/;
const PRODUCTION_HOSTS = new Set(["geomacro.live", "www.geomacro.live"]);

export function fail(message) {
  throw new Error(message);
}

export function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

export function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function decodeBase64Json(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export async function readJson(response, label = response.url) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} did not return JSON: ${text.slice(0, 280)}`);
  }
}

export function requireHash(value, label) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${label} must be a sha256 hex digest`);
  return value.toLowerCase();
}

export function canaryContext() {
  const baseRaw = required("GEOMACRO_PRODUCTION_CANARY_BASE_URL");
  const expectedHost = required("GEOMACRO_PRODUCTION_CANARY_EXPECTED_HOST").toLowerCase();
  const expectedSha = required("GEOMACRO_EXPECTED_DEPLOYED_SHA").toLowerCase();

  if (!SHA.test(expectedSha)) fail("GEOMACRO_EXPECTED_DEPLOYED_SHA must be a full 40-character SHA");

  const base = new URL(baseRaw);
  if (base.protocol !== "https:") fail("Production canary target must use HTTPS");
  if (base.username || base.password || base.search || base.hash) {
    fail("Production canary base URL must not contain credentials/query/fragment");
  }
  if (base.pathname !== "/" && base.pathname !== "") fail("Production canary base URL must not contain a path");
  if (base.hostname.toLowerCase() !== expectedHost) fail("Production canary host does not match the approved expected host");
  if (PRODUCTION_HOSTS.has(base.hostname.toLowerCase())) {
    fail("Refusing to run production canary against the public Geomacro production hostname");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(base.hostname.toLowerCase())) {
    fail("Refusing local production canary target");
  }

  return { base, expectedHost, expectedSha };
}

export async function verifyCanaryBuild(context) {
  const response = await fetch(new URL("/.well-known/geomacro-build.json", context.base), {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200) fail(`Canary build marker returned HTTP ${response.status}`);
  const marker = await readJson(response, "Canary build marker");
  if (marker?.schema_version !== "geomacro.deployment-build.v1") fail("Canary build marker schema mismatch");
  if (String(marker?.canonical_main_sha ?? "").toLowerCase() !== context.expectedSha) {
    fail("Canary deployment is not the exact reviewed canonical SHA");
  }
  return marker;
}

export function productionAdaptiveRequest(prefix = "prod-canary") {
  const country = String(process.env.GEOMACRO_CANARY_COUNTRY_ISO3 ?? "USA").trim().toUpperCase();
  if (!ISO3.test(country)) fail("GEOMACRO_CANARY_COUNTRY_ISO3 must be an ISO3 code");
  const clientRequestId =
    String(process.env.GEOMACRO_CANARY_CLIENT_REQUEST_ID ?? "").trim() ||
    `${prefix}-${randomUUID()}`;

  return {
    request: {
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
      client_request_id: clientRequestId,
    },
    country,
    clientRequestId,
  };
}

export function assertAdaptiveProduct(body, label = "Paid response") {
  if (!body || typeof body !== "object") fail(`${label} is not a JSON object`);
  if (body.execution_authorized !== false) fail(`${label} violated execution_authorized=false`);
  if (body.product !== "geomacro_adaptive_risk_intelligence_v1") fail(`${label} returned an unexpected product`);
  requireHash(body.query_plan_hash, `${label} query_plan_hash`);
  requireHash(body.delivered_product_hash, `${label} delivered_product_hash`);
  if (!Array.isArray(body.signed_risk_objects) || body.signed_risk_objects.length < 1) {
    fail(`${label} did not deliver a signed Risk Object`);
  }
  if (!Array.isArray(body.risk_gate) || body.risk_gate.length < 1) {
    fail(`${label} did not deliver Risk Gate output`);
  }
  for (const row of body.risk_gate) {
    if (
      row?.result?.context?.execution_authorized !== false ||
      row?.result?.response?.execution_authorized !== false
    ) {
      fail(`${label} Risk Gate execution boundary was violated`);
    }
  }
}

export async function assertAvailability(base, serializedBody, expectedProvider) {
  const response = await fetch(new URL("/api/x402/risk/availability", base), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: serializedBody,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await readJson(response, "Canary availability");
  if (response.status !== 200 || body?.ok !== true || body?.chargeable !== true) {
    fail(`No-charge canary availability failed: HTTP ${response.status}`);
  }
  if (body.payment_required_now !== false) fail("Availability endpoint unexpectedly requires payment");
  if (expectedProvider && body?.payment?.provider && body.payment.provider !== expectedProvider) {
    fail("Availability endpoint provider mismatch");
  }
  return { response, body };
}

export async function writeEvidence({
  provider,
  evidence,
  handoff,
}) {
  const artifactDir =
    String(process.env.GEOMACRO_PRODUCTION_CANARY_ARTIFACT_DIR ?? "").trim() ||
    "artifacts/production-canary";
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `${provider}-${Date.now()}.json`);
  await writeFile(artifactPath, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });

  const handoffPath =
    String(process.env.GEOMACRO_PRODUCTION_CANARY_HANDOFF_PATH ?? "").trim() ||
    path.join("/tmp", `geomacro-${provider}-production-canary-handoff.json`);
  await writeFile(handoffPath, JSON.stringify(handoff, null, 2) + "\n", { mode: 0o600 });

  console.log(`PASS: ${provider} production canary completed`);
  console.log(`Sanitized evidence: ${artifactPath}`);
  console.log(`Private reconciliation handoff written: ${handoffPath}`);
  return { artifactPath, handoffPath };
}

export function centsToAtomic(maxUsdc) {
  const raw = String(maxUsdc).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(raw)) fail("USDC cap must be a decimal with up to 6 places");
  const [whole, fraction = ""] = raw.split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}

import { inspectWebCandidateThreeCategoryHealth } from "./web-candidate-three-category-health-gate.mjs";
import { pathToFileURL } from "node:url";

const BASE = process.env.GEOMACRO_WEB_STAGING_URL ??
  "https://geomacro-web-production-staging.daspallab202391.workers.dev";
const EXPECTED_SHA = process.env.EXPECTED_CANONICAL_MAIN_SHA;
const timeout = 30_000;
const PAGE_PATHS = ["/", "/intelligence", "/ask-geomacro", "/data-api",
  "/institutional", "/contact", "/pricing", "/auth"];

async function request(path, options = {}) {
  try {
    return await fetch(new URL(path, BASE), {
      redirect: "manual", signal: AbortSignal.timeout(timeout), ...options,
    });
  } catch {
    return null;
  }
}

async function jsonProbe(path) {
  const response = await request(path, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!response) return { status: 0, body: null };
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

export function diagnoseWebStagingHealth({ legacy, publicHealth, liveStructured, baseline }) {
  const source = inspectWebCandidateThreeCategoryHealth(liveStructured.status, liveStructured.body);
  const baselineBody = baseline.body;
  const baselineCount = baselineBody?.schema === "geomacro.product-scoped-verified-baseline-health.v1" &&
    Number.isSafeInteger(baselineBody.verified_baseline_product_count)
    ? baselineBody.verified_baseline_product_count : 0;
  const b2ReadAvailable = baseline.status === 200 && baselineBody?.ok === true && baselineCount > 0;
  const signedReady = legacy.status === 200 && legacy.body?.ok === true &&
    publicHealth.status === 200 && publicHealth.body?.ok === true;
  return {
    three_category_source_health: {
      status: source.ready ? "PASS" : "BLOCKED",
      http_status: source.http_status,
      categories: source.categories,
      gate: source.ready ? "SOURCE_OBSERVATIONS_AVAILABLE" : "THREE_CATEGORY_SOURCE_ACCEPTANCE_FAILED",
    },
    b2: {
      read_availability: {
        status: b2ReadAvailable ? "PASS" : "BLOCKED",
        http_status: baseline.status,
        verified_baseline_product_count: baselineCount,
        gate: b2ReadAvailable ? "VERIFIED_BASELINE_READABLE" : "VERIFIED_BASELINE_READ_UNAVAILABLE",
      },
      quota_authorized_access: {
        status: "BLOCKED",
        gate: "B2_QUOTA_AUTHORIZATION_PROOF_UNAVAILABLE",
      },
    },
    signed_product_readiness: {
      status: signedReady ? "PASS" : "BLOCKED",
      legacy_http_status: legacy.status,
      public_http_status: publicHealth.status,
      legacy_ok: legacy.body?.ok === true,
      public_ok: publicHealth.body?.ok === true,
      gate: signedReady ? "SIGNED_PRODUCT_READINESS_ACCEPTED" : "SIGNED_PRODUCT_HEALTH_NOT_ACCEPTED",
    },
  };
}

async function main() {
if (!/^https:\/\/geomacro-web-production-staging\.daspallab202391\.workers\.dev$/u.test(BASE)) {
  throw Error("WEB_STAGING_URL_OUTSIDE_ISOLATED_WORKERS_DEV_HOST");
}
if (!/^[a-f0-9]{40}$/u.test(EXPECTED_SHA ?? "")) {
  throw Error("WEB_STAGING_EXPECTED_SHA_REQUIRED");
}
const failures = [];
const assets = new Set();
const markerResponse = await request("/.well-known/geomacro-build.json", {
  headers: { Accept: "application/json", "Cache-Control": "no-cache" },
});
const marker = markerResponse?.status === 200 ? await markerResponse.json().catch(() => null) : null;
const exactBuild = marker?.schema_version === "geomacro.deployment-build.v1" &&
  marker?.canonical_repository === "blocknine0/geomacro" &&
  marker?.canonical_main_sha === EXPECTED_SHA &&
  marker?.production_activation_performed === false &&
  marker?.deployment_mode === "production-capable-staging-no-funds";
if (!exactBuild) failures.push("EXACT_BUILD_SHA_OR_STAGING_MARKER_INVALID");

let ssrPages = 0;
let securityHeadersVerified = true;
for (const path of PAGE_PATHS) {
  const response = await request(path, { headers: { Accept: "text/html" } });
  if (!response || response.status !== 200 || !(response.headers.get("content-type") ?? "").includes("text/html")) {
    await response?.body?.cancel();
    failures.push("SSR_PAGE_UNAVAILABLE");
    continue;
  }
  const headers = response.headers;
  if (headers.get("x-robots-tag") !== "noindex, nofollow" ||
      headers.get("x-frame-options") !== "DENY" ||
      headers.get("x-content-type-options") !== "nosniff" ||
      headers.get("x-geomacro-security-version") === null) securityHeadersVerified = false;
  const html = await response.text();
  if (html.length > 1_000_000 || !/<title\b/iu.test(html) || !/<h1\b/iu.test(html) ||
      !/<meta[^>]+name=["']viewport["']/iu.test(html)) {
    failures.push("SSR_DOCUMENT_INCOMPLETE");
    continue;
  }
  ssrPages += 1;
  for (const match of html.matchAll(/\b(?:src|href)=["'](\/[^"']+)["']/giu)) {
    const pathname = match[1].split(/[?#]/u)[0];
    if (/\.(?:js|css|woff2?|svg|png|webp|avif)$/iu.test(pathname)) assets.add(pathname);
  }
}
if (!securityHeadersVerified) failures.push("SECURITY_HEADERS_INVALID");

let assetsChecked = 0;
for (const path of [...assets].slice(0, 100)) {
  const response = await request(path, { method: "HEAD", headers: { Accept: "*/*" } });
  if (!response || response.status !== 200) failures.push("STATIC_ASSET_UNAVAILABLE");
  else assetsChecked += 1;
  await response?.body?.cancel();
}
if (assets.size === 0) failures.push("STATIC_ASSET_REFERENCES_NOT_FOUND");
if (assets.size > 100) failures.push("STATIC_ASSET_PROBE_BOUND_EXCEEDED");

const healthResults = diagnoseWebStagingHealth({
  legacy: await jsonProbe("/api/health?deep=1"),
  publicHealth: await jsonProbe("/api/public-production-health"),
  liveStructured: await jsonProbe("/api/health?deep=1&profile=live-structured"),
  baseline: await jsonProbe("/api/health?deep=1&profile=verified-baseline"),
});
if (healthResults.three_category_source_health.status !== "PASS") failures.push("THREE_CATEGORY_SOURCE_HEALTH_BLOCKED");
if (healthResults.b2.read_availability.status !== "PASS") failures.push("B2_READ_AVAILABILITY_BLOCKED");
if (healthResults.b2.quota_authorized_access.status !== "PASS") failures.push("B2_QUOTA_AUTHORIZATION_BLOCKED");
if (healthResults.signed_product_readiness.status !== "PASS") failures.push("SIGNED_PRODUCT_READINESS_BLOCKED");

const pricing = await request("/api/v1/pricing", { headers: { Accept: "application/json" } });
if (!pricing || pricing.status !== 200) failures.push("PRICING_API_UNAVAILABLE");
await pricing?.body?.cancel();
for (const path of ["/api/v1/agent", "/api/v1/intelligence/query"]) {
  const response = await request(path, { headers: { Accept: "application/json" } });
  if (!response || response.status !== 200) failures.push("MACHINE_DISCOVERY_ROUTE_UNAVAILABLE");
  await response?.body?.cancel();
}

const backend = await jsonProbe("/api/risk-gate-readiness");
const backendContractValid = [200, 503].includes(backend.status) &&
  backend.body?.authority === "cloudflare-d1" && backend.body?.execution_authorized === false &&
  backend.body?.paid_launch_approved === false &&
  (backend.status !== 503 || backend.body?.status === "not_ready") &&
  (backend.status !== 200 || backend.body?.status === "ready");
if (!backendContractValid) failures.push("CONTROL_PLANE_FAIL_CLOSED_CONTRACT_INVALID");

const customer = await request("/api/v1/customer/account", {
  headers: { Accept: "application/json", "Cache-Control": "no-cache" },
});
const customerAuthValid = customer && [401, 403].includes(customer.status);
if (!customerAuthValid) failures.push("CUSTOMER_AUTH_BOUNDARY_INVALID");
await customer?.body?.cancel();

const ask = await request("/api/ask/v2/turn", {
  method: "POST",
  headers: { Accept: "text/event-stream", "Content-Type": "application/json", Origin: BASE },
  body: JSON.stringify({ question: "What verified official evidence is available about copper markets?" }),
});
let askAccepted = false;
if (ask?.status === 200 && (ask.headers.get("content-type") ?? "").includes("text/event-stream")) {
  const askBody = await ask.text();
  const answerFrame = askBody.split("\n\n").find(frame => frame.startsWith("event: answer\n"));
  const answerData = answerFrame?.split("\n").find(line => line.startsWith("data: "))?.slice(6);
  try {
    const answer = JSON.parse(answerData ?? "null");
    askAccepted = answer?.ok === true && !!answer?.data && typeof answer.data === "object";
  } catch { /* Malformed live response remains blocked. */ }
}
if (!askAccepted) failures.push("ASK_POST_FLOW_UNAVAILABLE");

const dataApi = await request("/data-api", { method: "HEAD" });
const dataApiAccepted = dataApi && [200, 301, 302, 307, 308].includes(dataApi.status);
if (!dataApiAccepted) failures.push("DATA_API_ROUTE_UNAVAILABLE");
await dataApi?.body?.cancel();

const uniqueFailures = [...new Set(failures)];
const report = {
  schema: "geomacro.web-production-staging-diagnostics.v1",
  canonical_main_sha: EXPECTED_SHA,
  exact_sha_verified: exactBuild,
  website_ssr_and_static_assets: {
    status: ssrPages === PAGE_PATHS.length && securityHeadersVerified && assets.size > 0 &&
      assetsChecked === assets.size ? "PASS" : "BLOCKED",
    ssr_pages_http_200: ssrPages,
    ssr_pages_expected: PAGE_PATHS.length,
    static_assets_checked: assetsChecked,
    static_assets_discovered: assets.size,
    security_headers_verified: securityHeadersVerified,
  },
  ...healthResults,
  ask_geomacro_post: { status: askAccepted ? "PASS" : "BLOCKED" },
  pricing_and_machine_discovery: { status: pricing?.status === 200 ? "PASS" : "BLOCKED" },
  control_plane_route_contract: { status: backendContractValid ? "PASS" : "BLOCKED", paid_launch_approved: false },
  customer_unauthenticated_boundary: { status: customerAuthValid ? "PASS" : "BLOCKED" },
  failures: uniqueFailures,
  staging_acceptance: uniqueFailures.length === 0 ? "PASS" : "BLOCKED",
  production_domains_or_routes_changed: false,
  payment_attempts: 0,
};
console.log(JSON.stringify(report));
if (uniqueFailures.length) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();

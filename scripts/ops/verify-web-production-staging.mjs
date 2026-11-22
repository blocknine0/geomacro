import { inspectWebCandidateThreeCategoryHealth } from "./web-candidate-three-category-health-gate.mjs";

const BASE = process.env.GEOMACRO_WEB_STAGING_URL ??
  "https://geomacro-web-production-staging.daspallab202391.workers.dev";
const EXPECTED_SHA = process.env.EXPECTED_CANONICAL_MAIN_SHA;
const timeout = 30_000;

if (!/^https:\/\/geomacro-web-production-staging\.daspallab202391\.workers\.dev$/u.test(BASE)) {
  throw Error("WEB_STAGING_URL_OUTSIDE_ISOLATED_WORKERS_DEV_HOST");
}
if (!/^[a-f0-9]{40}$/u.test(EXPECTED_SHA ?? "")) {
  throw Error("WEB_STAGING_EXPECTED_SHA_REQUIRED");
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(new URL(path, BASE), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
      ...options,
    });
  } catch {
    throw Error("WEB_STAGING_REQUEST_FAILED:" + path);
  }
  return response;
}

const markerResponse = await request("/.well-known/geomacro-build.json", {
  headers: { Accept: "application/json", "Cache-Control": "no-cache" },
});
if (markerResponse.status !== 200) throw Error("WEB_STAGING_BUILD_MARKER_UNAVAILABLE");
const marker = await markerResponse.json().catch(() => null);
if (marker?.schema_version !== "geomacro.deployment-build.v1" ||
    marker?.canonical_repository !== "blocknine0/geomacro" ||
    marker?.canonical_main_sha !== EXPECTED_SHA ||
    marker?.production_activation_performed !== false ||
    marker?.deployment_mode !== "production-capable-staging-no-funds") {
  throw Error("WEB_STAGING_EXACT_BUILD_MARKER_MISMATCH");
}

const pagePaths = ["/", "/intelligence", "/ask-geomacro", "/data-api",
  "/institutional", "/contact", "/pricing"];
for (const path of pagePaths) {
  const response = await request(path, { headers: { Accept: "text/html" } });
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").includes("text/html")) {
    await response.body?.cancel();
    throw Error("WEB_STAGING_PAGE_UNAVAILABLE:" + path);
  }
  const headers = response.headers;
  if (headers.get("x-robots-tag") !== "noindex, nofollow" ||
      headers.get("x-frame-options") !== "DENY" ||
      headers.get("x-content-type-options") !== "nosniff" ||
      headers.get("x-geomacro-security-version") === null) {
    await response.body?.cancel();
    throw Error("WEB_STAGING_SECURITY_HEADERS_INVALID:" + path);
  }
  const html = await response.text();
  if (html.length > 1_000_000 || !/<title\b/iu.test(html) || !/<h1\b/iu.test(html) ||
      !/<meta[^>]+name=["']viewport["']/iu.test(html)) {
    throw Error("WEB_STAGING_SSR_DOCUMENT_INCOMPLETE:" + path);
  }
}

const pricing = await request("/api/v1/pricing", { headers: { Accept: "application/json" } });
if (pricing.status !== 200) throw Error("WEB_STAGING_PRICING_API_UNAVAILABLE");
await pricing.body?.cancel();

for (const path of ["/api/v1/agent", "/api/v1/intelligence/query"]) {
  const response = await request(path, { headers: { Accept: "application/json" } });
  if (response.status !== 200) throw Error("WEB_STAGING_MACHINE_DISCOVERY_UNAVAILABLE:" + path);
  await response.body?.cancel();
}

for (const path of ["/api/health?deep=1", "/api/public-production-health"]) {
  const response = await request(path, { headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw Error("WEB_STAGING_PRODUCTION_HEALTH_NOT_ACCEPTED:" + path + ":" + response.status);
  }
  const body = await response.json().catch(() => null);
  if (body?.ok !== true) throw Error("WEB_STAGING_PRODUCTION_HEALTH_BODY_INVALID:" + path);
}

const scopedHealth = await request("/api/health?deep=1&profile=live-structured", {
  headers: { Accept: "application/json", "Cache-Control": "no-cache" },
});
const scopedBody = await scopedHealth.json().catch(() => null);
const scopedAcceptance = inspectWebCandidateThreeCategoryHealth(scopedHealth.status, scopedBody);
if (!scopedAcceptance.ready) throw Error("WEB_STAGING_THREE_CATEGORY_SOURCE_HEALTH_NOT_ACCEPTED");

const backend = await request("/api/risk-gate-readiness", {
  headers: { Accept: "application/json", "Cache-Control": "no-cache" },
});
if (![200, 503].includes(backend.status)) throw Error("WEB_STAGING_CONTROL_PLANE_ROUTE_STATUS_INVALID");
const backendBody = await backend.json().catch(() => null);
if (backendBody?.authority !== "cloudflare-d1" || backendBody?.execution_authorized !== false ||
    backendBody?.paid_launch_approved !== false ||
    (backend.status === 503 && backendBody?.status !== "not_ready") ||
    (backend.status === 200 && backendBody?.status !== "ready")) {
  throw Error("WEB_STAGING_CONTROL_PLANE_FAIL_CLOSED_CONTRACT_INVALID");
}

const customer = await request("/api/v1/customer/account", {
  headers: { Accept: "application/json", "Cache-Control": "no-cache" },
});
if (![401, 403].includes(customer.status)) {
  await customer.body?.cancel();
  throw Error("WEB_STAGING_CUSTOMER_AUTH_BOUNDARY_INVALID");
}
await customer.body?.cancel();

const ask = await request("/api/ask/v2/turn", {
  method: "POST",
  headers: {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    Origin: BASE,
  },
  body: JSON.stringify({ question: "What verified official evidence is available about copper markets?" }),
});
if (ask.status !== 200 || !(ask.headers.get("content-type") ?? "").includes("text/event-stream")) {
  await ask.body?.cancel();
  throw Error("WEB_STAGING_ASK_POST_FLOW_UNAVAILABLE");
}
const askBody = await ask.text();
const answerFrame = askBody.split("\n\n").find(frame => frame.startsWith("event: answer\n"));
if (!answerFrame) {
  const errorFrame = askBody.split("\n\n").find(frame => frame.startsWith("event: error\n"));
  const dataLine = errorFrame?.split("\n").find(line => line.startsWith("data: "));
  const code = dataLine?.match(/"code":"([A-Z0-9_]{3,80})"/u)?.[1] ?? "NO_ANSWER_FRAME";
  throw Error("WEB_STAGING_ASK_RESPONSE_NOT_ACCEPTED:" + code);
}
const answerData = answerFrame.split("\n").find(line => line.startsWith("data: "))?.slice(6);
const answer = JSON.parse(answerData ?? "null");
if (answer?.ok !== true || !answer?.data || typeof answer.data !== "object") {
  throw Error("WEB_STAGING_ASK_RESPONSE_SCHEMA_INVALID");
}

const dataApi = await request("/data-api", { method: "HEAD" });
if (![200, 301, 302, 307, 308].includes(dataApi.status)) {
  await dataApi.body?.cancel();
  throw Error("WEB_STAGING_DATA_API_ROUTE_UNAVAILABLE");
}
await dataApi.body?.cancel();

console.log(JSON.stringify({
  schema: "geomacro.web-production-staging-acceptance.v1",
  canonical_main_sha: EXPECTED_SHA,
  exact_sha_verified: true,
  ssr_pages_http_200: pagePaths.length,
  three_category_intelligence_route: true,
  control_plane_worker_contract_verified: true,
  paid_risk_gate_still_gated: backendBody.paid_launch_approved === false,
  pricing_and_machine_discovery_verified: true,
  customer_unauthenticated_boundary_verified: true,
  ask_same_origin_post_answer_verified: true,
  legacy_and_public_production_health_http_200: true,
  security_headers_verified: true,
  mobile_viewport_metadata_present: true,
  deployment_mode: "production-capable-staging-no-funds",
  production_domains_or_routes_changed: false,
  payment_attempts: 0,
}));

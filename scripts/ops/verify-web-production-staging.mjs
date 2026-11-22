import { inspectWebCandidateThreeCategoryHealth } from "./web-candidate-three-category-health-gate.mjs";
import { pathToFileURL } from "node:url";

const BASE = process.env.GEOMACRO_WEB_STAGING_URL ??
  "https://geomacro-web-production-staging.daspallab202391.workers.dev";
const EXPECTED_SHA = process.env.EXPECTED_CANONICAL_MAIN_SHA;
const timeout = 30_000;
export const PAGE_PATHS = ["/", "/intelligence", "/ask-geomacro", "/risk-gate",
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

function isFreshUtcTimestamp(value, now, maxAgeMs = 15 * 60_000) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= now + 5_000 && now - at <= maxAgeMs;
}

/**
 * Accept only a recent, independently returned D1 reservation ticket for the
 * staging archive-read workflow. A readable B2 baseline is not a quota ticket.
 */
export function inspectB2QuotaAuthorizationProof(proof, { now = Date.now() } = {}) {
  const reservation = proof?.reservation;
  const valid = proof?.workflow_id === "private_archive_read" &&
    isFreshUtcTimestamp(proof?.checked_at, now) &&
    reservation?.ok === true &&
    reservation?.schema === "geomacro.b2-account-request-reservation.v1" &&
    reservation?.reserved === true &&
    reservation?.kind === "GET" &&
    reservation?.day_utc === new Date(now).toISOString().slice(0, 10) &&
    reservation?.b2_operation_performed === false &&
    reservation?.chargeable === false;
  return Object.freeze({
    status: valid ? "PASS" : "NOT_PROVEN",
    gate: valid ? "FRESH_PRIVATE_ARCHIVE_GET_RESERVATION_VERIFIED" :
      !proof ? "B2_QUOTA_AUTHORIZATION_PROOF_NOT_AVAILABLE" :
        "B2_QUOTA_AUTHORIZATION_PROOF_INVALID_OR_STALE",
  });
}

/**
 * Read back only bounded categorical evidence flags already returned by the
 * existing verified-baseline GET. Never log raw source data, credentials, or
 * infer that a readable baseline is a quota reservation or signed publication.
 */
export function summarizeVerifiedBaselineProbe({ status, body }) {
  const schemaAccepted = body?.schema === "geomacro.product-scoped-verified-baseline-health.v1";
  const productKeys = ["intelligence", "global_risk", "risk_indices"];
  const flags = field => Object.fromEntries(productKeys.map(key => [
    key, schemaAccepted && typeof body?.[field]?.[key] === "boolean"
      ? body[field][key] : null,
  ]));
  return {
    profile_http_status: status,
    profile_response: status === 400 && body?.error === "HEALTH_PROFILE_INVALID"
      ? "QUERY_REJECTED"
      : status === 0 ? "NETWORK_UNAVAILABLE"
        : schemaAccepted ? "VERIFIED_BASELINE_SCHEMA" : "UNRECOGNIZED_RESPONSE",
    verified_baseline_products: flags("verified_baseline_products"),
    current_signed_live_products: flags("current_signed_live_products"),
  };
}

export function diagnoseWebStagingHealth({ legacy, publicHealth, liveStructured, baseline, now = Date.now() }) {
  const source = inspectWebCandidateThreeCategoryHealth(liveStructured.status, liveStructured.body, { now });
  const baselineBody = baseline.body;
  const baselineCount = baselineBody?.schema === "geomacro.product-scoped-verified-baseline-health.v1" &&
    Number.isSafeInteger(baselineBody.verified_baseline_product_count)
    ? baselineBody.verified_baseline_product_count : 0;
  const b2ReadAvailable = baseline.status === 200 && baselineBody?.ok === true && baselineCount > 0;
  const quotaProof = inspectB2QuotaAuthorizationProof(
    baselineBody?.b2_quota_authorization_proof, { now });
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
        evidence_diagnostics: summarizeVerifiedBaselineProbe(baseline),
        gate: b2ReadAvailable ? "VERIFIED_BASELINE_READABLE" : "VERIFIED_BASELINE_READ_UNAVAILABLE",
      },
      quota_authorized_access: {
        ...quotaProof,
        proof_http_status: baseline.status,
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

export function deriveWebAcceptanceOutcomes({
  exactShaVerified,
  isolatedWorkerVerified,
  website,
  requiredPublicApis,
  askPost,
  health,
  authenticatedCustomerVerified = false,
  productionDomainsVerified = false,
}) {
  const stagingBlockers = [];
  if (exactShaVerified !== true) stagingBlockers.push("EXACT_BUILD_SHA_NOT_VERIFIED");
  if (isolatedWorkerVerified !== true) stagingBlockers.push("STAGING_WORKER_ISOLATION_NOT_VERIFIED");
  if (website !== true) stagingBlockers.push("STAGING_SSR_ASSETS_OR_SECURITY_FAILED");
  if (requiredPublicApis !== true) stagingBlockers.push("REQUIRED_PUBLIC_API_FUNCTIONALITY_FAILED");
  if (askPost !== true) stagingBlockers.push("ASK_POST_FLOW_FAILED");

  const cutoverBlockers = [];
  if (health?.three_category_source_health?.status !== "PASS") cutoverBlockers.push("THREE_CATEGORY_SOURCE_HEALTH_NOT_ACCEPTED");
  if (health?.b2?.read_availability?.status !== "PASS") cutoverBlockers.push("B2_READ_AVAILABILITY_NOT_VERIFIED");
  if (health?.b2?.quota_authorized_access?.status !== "PASS") {
    cutoverBlockers.push(health?.b2?.quota_authorized_access?.gate ?? "B2_QUOTA_AUTHORIZATION_NOT_PROVEN");
  }
  if (health?.signed_product_readiness?.status !== "PASS") cutoverBlockers.push("SIGNED_PRODUCT_READINESS_NOT_ACCEPTED");
  if (authenticatedCustomerVerified !== true) cutoverBlockers.push("AUTHENTICATED_CUSTOMER_FLOW_NOT_VERIFIED");
  if (productionDomainsVerified !== true) cutoverBlockers.push("PRODUCTION_DOMAIN_DNS_TLS_AND_ROUTE_ACCEPTANCE_NOT_VERIFIED");
  return Object.freeze({
    staging_deployment_acceptance: Object.freeze({
      status: stagingBlockers.length === 0 ? "PASS" : "BLOCKED",
      blockers: stagingBlockers,
    }),
    production_cutover_readiness: Object.freeze({
      status: cutoverBlockers.length === 0 ? "READY" : "BLOCKED",
      blockers: cutoverBlockers,
    }),
  });
}

async function main() {
  if (!/^https:\/\/geomacro-web-production-staging\.daspallab202391\.workers\.dev$/u.test(BASE)) {
    throw Error("WEB_STAGING_URL_OUTSIDE_ISOLATED_WORKERS_DEV_HOST");
  }
  if (!/^[a-f0-9]{40}$/u.test(EXPECTED_SHA ?? "")) {
    throw Error("WEB_STAGING_EXPECTED_SHA_REQUIRED");
  }

  const markerResponse = await request("/.well-known/geomacro-build.json", {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  const marker = markerResponse?.status === 200 ? await markerResponse.json().catch(() => null) : null;
  const exactBuild = marker?.schema_version === "geomacro.deployment-build.v1" &&
    marker?.canonical_repository === "blocknine0/geomacro" &&
    marker?.canonical_main_sha === EXPECTED_SHA &&
    marker?.production_activation_performed === false &&
    marker?.deployment_mode === "production-capable-staging-no-funds";

  let ssrPages = 0;
  let securityHeadersVerified = true;
  const assets = new Set();
  for (const path of PAGE_PATHS) {
    const response = await request(path, { headers: { Accept: "text/html" } });
    if (!response || response.status !== 200 || !(response.headers.get("content-type") ?? "").includes("text/html")) {
      await response?.body?.cancel();
      continue;
    }
    const headers = response.headers;
    if (headers.get("x-robots-tag") !== "noindex, nofollow" ||
        headers.get("x-frame-options") !== "DENY" ||
        headers.get("x-content-type-options") !== "nosniff" ||
        headers.get("x-geomacro-security-version") === null) securityHeadersVerified = false;
    const html = await response.text();
    if (html.length > 1_000_000 || !/<title\b/iu.test(html) || !/<h1\b/iu.test(html) ||
        !/<meta[^>]+name=["']viewport["']/iu.test(html)) continue;
    ssrPages += 1;
    for (const match of html.matchAll(/\b(?:src|href)=["'](\/[^"']+)["']/giu)) {
      const pathname = match[1].split(/[?#]/u)[0];
      if (/\.(?:js|css|woff2?|svg|png|webp|avif)$/iu.test(pathname)) assets.add(pathname);
    }
  }

  let assetsChecked = 0;
  let assetsAvailable = true;
  for (const path of [...assets].slice(0, 100)) {
    const response = await request(path, { method: "HEAD", headers: { Accept: "*/*" } });
    if (!response || response.status !== 200) assetsAvailable = false;
    else assetsChecked += 1;
    await response?.body?.cancel();
  }
  const websiteAccepted = ssrPages === PAGE_PATHS.length && securityHeadersVerified &&
    assets.size > 0 && assets.size <= 100 && assetsAvailable && assetsChecked === assets.size;

  const health = diagnoseWebStagingHealth({
    legacy: await jsonProbe("/api/health?deep=1"),
    publicHealth: await jsonProbe("/api/public-production-health"),
    liveStructured: await jsonProbe("/api/health?deep=1&profile=live-structured"),
    baseline: await jsonProbe("/api/health?deep=1&profile=verified-baseline"),
  });

  const pricing = await request("/api/v1/pricing", { headers: { Accept: "application/json" } });
  let publicApisAccepted = Boolean(pricing && pricing.status === 200);
  await pricing?.body?.cancel();
  let machineDiscoveryAccepted = true;
  for (const path of ["/api/v1/agent", "/api/v1/intelligence/query"]) {
    const response = await request(path, { headers: { Accept: "application/json" } });
    if (!response || response.status !== 200) {
      publicApisAccepted = false;
      machineDiscoveryAccepted = false;
    }
    await response?.body?.cancel();
  }

  const backend = await jsonProbe("/api/risk-gate-readiness");
  const backendContractValid = [200, 503].includes(backend.status) &&
    backend.body?.authority === "cloudflare-d1" && backend.body?.execution_authorized === false &&
    backend.body?.paid_launch_approved === false &&
    (backend.status !== 503 || backend.body?.status === "not_ready") &&
    (backend.status !== 200 || backend.body?.status === "ready");
  if (!backendContractValid) publicApisAccepted = false;

  const customer = await request("/api/v1/customer/account", {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  const customerAuthBoundaryVerified = Boolean(customer && [401, 403].includes(customer.status));
  if (!customerAuthBoundaryVerified) publicApisAccepted = false;
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

  const dataApi = await request("/data-api", { method: "HEAD" });
  if (!dataApi || ![200, 301, 302, 307, 308].includes(dataApi.status)) publicApisAccepted = false;
  await dataApi?.body?.cancel();

  const isolatedWorkerVerified = process.env.WEB_STAGING_ISOLATION_VERIFIED === "true";
  const outcomes = deriveWebAcceptanceOutcomes({
    exactShaVerified: exactBuild,
    isolatedWorkerVerified,
    website: websiteAccepted,
    requiredPublicApis: publicApisAccepted,
    askPost: askAccepted,
    health,
  });
  const report = {
    schema: "geomacro.web-production-staging-diagnostics.v2",
    canonical_main_sha: EXPECTED_SHA,
    exact_sha_verified: exactBuild,
    isolated_worker_verified: isolatedWorkerVerified,
    website_ssr_and_static_assets: {
      status: websiteAccepted ? "PASS" : "BLOCKED",
      ssr_pages_http_200: ssrPages,
      ssr_pages_expected: PAGE_PATHS.length,
      static_assets_checked: assetsChecked,
      static_assets_discovered: assets.size,
      security_headers_verified: securityHeadersVerified,
    },
    required_public_api_functionality: {
      status: publicApisAccepted ? "PASS" : "BLOCKED",
      pricing_api_http_status: pricing?.status ?? 0,
      machine_discovery_verified: machineDiscoveryAccepted,
      customer_unauthenticated_boundary_verified: customerAuthBoundaryVerified,
      control_plane_fail_closed_contract_verified: backendContractValid,
    },
    three_category_source_health: health.three_category_source_health,
    b2: health.b2,
    signed_product_readiness: health.signed_product_readiness,
    ask_geomacro_post: { status: askAccepted ? "PASS" : "BLOCKED" },
    ...outcomes,
    authenticated_customer_flow: {
      status: "NOT_PROVEN",
      gate: "AUTHENTICATED_CUSTOMER_FLOW_NOT_VERIFIED",
    },
    production_domain_acceptance: {
      status: "NOT_PROVEN",
      gate: "PRODUCTION_DOMAIN_DNS_TLS_AND_ROUTE_ACCEPTANCE_NOT_VERIFIED",
    },
    production_domains_or_routes_changed: false,
    payment_attempts: 0,
  };
  console.log(JSON.stringify(report));
  if (outcomes.staging_deployment_acceptance.status !== "PASS") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();

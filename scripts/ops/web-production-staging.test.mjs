import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareWebProduction } from "./prepare-web-production.mjs";
import {
  allowedStagingBinding,
  hasUnexpectedWorkerRoute,
  verifyWorkerBindings,
} from "./verify-web-production-bindings.mjs";
import {
  deriveWebAcceptanceOutcomes,
  diagnoseWebStagingHealth,
  inspectB2QuotaAuthorizationProof,
  summarizeVerifiedBaselineProbe,
  PAGE_PATHS,
} from "./verify-web-production-staging.mjs";
import { productionWebsite } from "../../workers/web-production/entry.mjs";

test("production-capable build config is workers.dev-only with no private bindings or routes", t => {
  const root = mkdtempSync(join(tmpdir(), "geomacro-web-production-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".output/server"), { recursive: true });
  mkdirSync(join(root, ".output/public"), { recursive: true });
  mkdirSync(join(root, "workers/web-production"), { recursive: true });
  copyFileSync(new URL("../../workers/web-production/entry.mjs", import.meta.url),
    join(root, "workers/web-production/entry.mjs"));
  writeFileSync(join(root, ".output/server/wrangler.json"), JSON.stringify({
    main: "index.mjs", no_bundle: true, compatibility_date: "2026-11-22",
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: { directory: "../public", binding: "ASSETS" },
  }));
  writeFileSync(join(root, ".output/server/index.mjs"), "export default {};\n");
  const result = prepareWebProduction({ root, sha: "a".repeat(40) });
  const config = JSON.parse(readFileSync(join(root, result.config), "utf8"));
  const marker = JSON.parse(readFileSync(join(root, ".output/public/.well-known/geomacro-build.json"), "utf8"));
  assert.equal(config.name, "geomacro-web-production-staging");
  assert.equal(config.main, "production.mjs");
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.GEOMACRO_SUPABASE_RUNTIME_MODE, "standby");
  assert.equal(config.routes, undefined);
  assert.equal(config.d1_databases, undefined);
  assert.equal(config.durable_objects, undefined);
  assert.equal(config.r2_buckets, undefined);
  assert.equal(marker.canonical_main_sha, "a".repeat(40));
  assert.equal(marker.production_activation_performed, false);
  assert.equal(result.payment_authorized, false);

  const productionResult = prepareWebProduction({ root, sha: "a".repeat(40), target: "production" });
  const productionConfig = JSON.parse(readFileSync(join(root, ".output/server/production-wrangler.json"), "utf8"));
  const productionMarker = JSON.parse(readFileSync(join(root, ".output/public/.well-known/geomacro-build.json"), "utf8"));
  assert.equal(productionConfig.name, "geomacro-web-production");
  assert.equal(productionConfig.workers_dev, false);
  assert.equal(productionConfig.preview_urls, false);
  assert.deepEqual(productionConfig.routes, [
    { pattern: "geomacro.live", custom_domain: true },
    { pattern: "www.geomacro.live", custom_domain: true },
  ]);
  assert.equal(productionMarker.production_activation_performed, true);
  assert.equal(productionMarker.deployment_mode, "production");
  assert.equal(productionResult.schema, "geomacro.web-production-build.v1");
});

test("production deployment workflow is manual-only and requires explicit confirmation", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy-web-production.yml", import.meta.url), "utf8");
  const triggers = workflow.split("\npermissions:", 1)[0];
  assert.match(triggers, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(triggers, /^\s+(?:push|schedule|pull_request):/mu);
  assert.match(triggers, /confirmation:[\s\S]*?required: true/u);
  assert.match(workflow, /inputs\.confirmation == 'DEPLOY_GEOMACRO_WEB_PRODUCTION'/u);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /permissions:\n  contents: read/u);
});

test("staging SSR paths include public Risk Gate and omit the redirecting data API route", () => {
  assert.ok(PAGE_PATHS.includes("/risk-gate"));
  assert.ok(!PAGE_PATHS.includes("/data-api"));
});

test("deployment entry forwards authorized POSTs to the app and preserves response status", async () => {
  let seen;
  const app = { fetch: async request => {
    seen = request;
    return Response.json({ ok: false, error: "PAYMENT_GATE_CLOSED" }, { status: 503 });
  } };
  const worker = productionWebsite(app);
  const request = new Request("https://geomacro-web-production-staging.daspallab202391.workers.dev/api/ask/v2/turn", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://geomacro-web-production-staging.daspallab202391.workers.dev" },
    body: JSON.stringify({ question: "actual user question" }),
  });
  const response = await worker.fetch(request, {}, {});
  assert.equal(seen, request);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("x-geomacro-deployment-mode"), "production-capable-staging-no-funds");
  assert.equal((await response.json()).error, "PAYMENT_GATE_CLOSED");
});

test("deployment entry forwards HEAD and preserves the application response headers", async () => {
  let method;
  const worker = productionWebsite({ fetch: async request => {
    method = request.method;
    return new Response(null, { status: 204, headers: { "x-app-head": "preserved" } });
  } });
  const response = await worker.fetch(new Request("https://geomacro-web-production-staging.daspallab202391.workers.dev/", {
    method: "HEAD",
  }), {}, {});
  assert.equal(method, "HEAD");
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("x-app-head"), "preserved");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("production-health URL aliases the existing deep-health check without fabricating success", async () => {
  let seen;
  const worker = productionWebsite({ fetch: async request => {
    seen = new URL(request.url);
    return Response.json({ ok: false }, { status: 503 });
  } });
  const response = await worker.fetch(new Request("https://geomacro-web-production-staging.daspallab202391.workers.dev/api/public-production-health"), {}, {});
  assert.equal(seen.pathname, "/api/health");
  assert.equal(seen.search, "?deep=1");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
});

test("staging accepts only the designated fingerprint secret and detects Worker routes", () => {
  assert.equal(allowedStagingBinding({ type: "secret_text", name: "GEOMACRO_SECURITY_FINGERPRINT_PEPPER" }), true);
  assert.equal(allowedStagingBinding({ type: "secret_text", name: "CONTROL_PLANE_TOKEN" }), false);
  assert.equal(hasUnexpectedWorkerRoute([{ pattern: "*.example.test/*", script: "other-worker" }]), false);
  assert.equal(hasUnexpectedWorkerRoute([{ pattern: "geomacro.live/*", script: "geomacro-web-production-staging" }]), true);
  assert.equal(hasUnexpectedWorkerRoute(null), true);
});

test("binding verification accepts bare route arrays and rejects unexpected or malformed routes", async () => {
  const zoneId = "a".repeat(32);
  const env = {
    CLOUDFLARE_ACCOUNT_ID: "b".repeat(32),
    CLOUDFLARE_API_TOKEN: "synthetic-cloudflare-token-not-a-secret",
  };
  const fetchWithRoutes = routeResponse => async input => {
    const url = String(input);
    if (url.endsWith("/workers/scripts/geomacro-web-production-staging/settings")) {
      return Response.json({ success: true, result: { bindings: [
        { type: "assets", name: "ASSETS" },
        { type: "plain_text", name: "GEOMACRO_SUPABASE_RUNTIME_MODE", text: "standby" },
      ] } });
    }
    if (url.endsWith("/workers/scripts/geomacro-web-production-staging/subdomain")) {
      return Response.json({ success: true, result: { enabled: true, previews_enabled: false } });
    }
    if (url.includes("/workers/domains?service=")) {
      return Response.json({ success: true, result: [] });
    }
    if (url.includes("/zones?account.id=")) {
      return Response.json({ success: true, result: [{ id: zoneId }], result_info: { total_pages: 1 } });
    }
    if (url.includes(`/zones/${zoneId}/workers/routes?`)) {
      return Response.json(routeResponse);
    }
    throw Error("UNEXPECTED_CLOUDFLARE_TEST_REQUEST");
  };

  const report = await verifyWorkerBindings({
    env,
    fetchImpl: fetchWithRoutes({ success: true, result: [] }),
  });
  assert.match(report, /NO_WORKER_ROUTES;ZONES_CHECKED=1;ROUTES_CHECKED=0/u);

  await assert.rejects(verifyWorkerBindings({
    env,
    fetchImpl: fetchWithRoutes({ success: true, result: [
      { pattern: "example.test/*", script: "geomacro-web-production-staging" },
    ] }),
  }), /WEB_STAGING_WORKER_ROUTE_ALREADY_ATTACHED/u);

  await assert.rejects(verifyWorkerBindings({
    env,
    fetchImpl: fetchWithRoutes({ success: true, result: { id: "not-an-array" } }),
  }), /WEB_STAGING_WORKER_ROUTE_INVENTORY_INVALID/u);
});

test("health diagnostics preserve real 503 statuses and leave missing B2 quota proof not proven", () => {
  const result = diagnoseWebStagingHealth({
    legacy: { status: 503, body: { ok: false } },
    publicHealth: { status: 503, body: { ok: false } },
    liveStructured: { status: 503, body: { ok: false } },
    baseline: { status: 503, body: { ok: false } },
  });
  assert.equal(result.signed_product_readiness.status, "BLOCKED");
  assert.equal(result.signed_product_readiness.legacy_http_status, 503);
  assert.equal(result.signed_product_readiness.public_http_status, 503);
  assert.equal(result.three_category_source_health.http_status, 503);
  assert.equal(result.b2.read_availability.http_status, 503);
  assert.equal(result.b2.quota_authorized_access.status, "NOT_PROVEN");
  assert.equal(result.b2.quota_authorized_access.gate, "B2_QUOTA_AUTHORIZATION_PROOF_NOT_AVAILABLE");
});

test("verified-baseline diagnostics distinguish query rejection from real 503 without exposing evidence", () => {
  const invalid = summarizeVerifiedBaselineProbe({
    status: 400,
    body: { ok: false, error: "HEALTH_PROFILE_INVALID", secret: "must-not-be-logged" },
  });
  assert.equal(invalid.profile_response, "QUERY_REJECTED");
  assert.equal(invalid.profile_http_status, 400);
  assert.equal(invalid.verified_baseline_products.intelligence, null);
  assert.ok(!JSON.stringify(invalid).includes("must-not-be-logged"));

  const unavailable = summarizeVerifiedBaselineProbe({
    status: 503,
    body: {
      schema: "geomacro.product-scoped-verified-baseline-health.v1",
      ok: false, status: "NO_VERIFIED_BASELINE",
      verified_baseline_products: { intelligence: false, global_risk: false, risk_indices: false },
      current_signed_live_products: { intelligence: false, global_risk: false, risk_indices: false },
    },
  });
  assert.equal(unavailable.profile_response, "VERIFIED_BASELINE_SCHEMA");
  assert.equal(unavailable.profile_http_status, 503);
  assert.deepEqual(unavailable.verified_baseline_products,
    { intelligence: false, global_risk: false, risk_indices: false });

  const unknown = summarizeVerifiedBaselineProbe({ status: 503, body: { ok: false } });
  assert.equal(unknown.profile_response, "UNRECOGNIZED_RESPONSE");
  assert.equal(unknown.verified_baseline_products.intelligence, null);

  const health = diagnoseWebStagingHealth({
    legacy: { status: 503, body: { ok: false } },
    publicHealth: { status: 503, body: { ok: false } },
    liveStructured: { status: 503, body: { ok: false } },
    baseline: {
      status: 200,
      body: {
        schema: "geomacro.product-scoped-verified-baseline-health.v1",
        ok: true, verified_baseline_product_count: 1,
        verified_baseline_products: { intelligence: true, global_risk: false, risk_indices: false },
        current_signed_live_products: { intelligence: false, global_risk: false, risk_indices: false },
      },
    },
  });
  assert.equal(health.b2.read_availability.status, "PASS");
  assert.deepEqual(health.b2.read_availability.evidence_diagnostics.verified_baseline_products,
    { intelligence: true, global_risk: false, risk_indices: false });
  assert.equal(health.b2.quota_authorized_access.status, "NOT_PROVEN");
  assert.equal(health.signed_product_readiness.status, "BLOCKED");
});

test("fresh independently returned D1 GET reservation proves only quota authorization", () => {
  const now = Date.parse("2026-11-23T12:00:00.000Z");
  const valid = {
    workflow_id: "private_archive_read",
    checked_at: new Date(now).toISOString(),
    reservation: {
      ok: true,
      schema: "geomacro.b2-account-request-reservation.v1",
      reserved: true,
      kind: "GET",
      day_utc: new Date(now).toISOString().slice(0, 10),
      b2_operation_performed: false,
      chargeable: false,
    },
  };
  assert.deepEqual(inspectB2QuotaAuthorizationProof(valid, { now }), {
    status: "PASS", gate: "FRESH_PRIVATE_ARCHIVE_GET_RESERVATION_VERIFIED",
  });
  assert.equal(inspectB2QuotaAuthorizationProof({
    ...valid, reservation: { ...valid.reservation, reserved: false },
  }, { now }).status, "NOT_PROVEN");
  const health = diagnoseWebStagingHealth({
    legacy: { status: 503, body: { ok: false } },
    publicHealth: { status: 503, body: { ok: false } },
    liveStructured: { status: 503, body: { ok: false } },
    baseline: {
      status: 200,
      body: {
        schema: "geomacro.product-scoped-verified-baseline-health.v1",
        ok: true,
        verified_baseline_product_count: 1,
        b2_quota_authorization_proof: valid,
      },
    },
    now,
  });
  assert.equal(health.b2.quota_authorized_access.status, "PASS");
  assert.equal(health.signed_product_readiness.status, "BLOCKED");
});

test("a readable B2 baseline never substitutes for an independent quota ticket", () => {
  const result = diagnoseWebStagingHealth({
    legacy: { status: 503, body: { ok: false } },
    publicHealth: { status: 503, body: { ok: false } },
    liveStructured: { status: 503, body: { ok: false } },
    baseline: {
      status: 200,
      body: {
        schema: "geomacro.product-scoped-verified-baseline-health.v1",
        ok: true,
        verified_baseline_product_count: 1,
      },
    },
  });
  assert.equal(result.b2.read_availability.status, "PASS");
  assert.equal(result.b2.quota_authorized_access.status, "NOT_PROVEN");
  assert.equal(result.b2.quota_authorized_access.gate, "B2_QUOTA_AUTHORIZATION_PROOF_NOT_AVAILABLE");
});

test("staging functionality failures block staging acceptance", () => {
  const result = deriveWebAcceptanceOutcomes({
    exactShaVerified: true,
    isolatedWorkerVerified: true,
    website: true,
    requiredPublicApis: true,
    askPost: false,
    health: {},
  });
  assert.equal(result.staging_deployment_acceptance.status, "BLOCKED");
  assert.ok(result.staging_deployment_acceptance.blockers.includes("ASK_POST_FLOW_FAILED"));
});

test("isolated staging can pass while 503 health, missing quota proof, and cutover gates remain blocked", () => {
  const health = diagnoseWebStagingHealth({
    legacy: { status: 503, body: { ok: false } },
    publicHealth: { status: 503, body: { ok: false } },
    liveStructured: { status: 503, body: { ok: false } },
    baseline: { status: 503, body: { ok: false } },
  });
  const result = deriveWebAcceptanceOutcomes({
    exactShaVerified: true,
    isolatedWorkerVerified: true,
    website: true,
    requiredPublicApis: true,
    askPost: true,
    health,
  });
  assert.equal(result.staging_deployment_acceptance.status, "PASS");
  assert.equal(result.production_cutover_readiness.status, "BLOCKED");
  assert.ok(result.production_cutover_readiness.blockers.includes("SIGNED_PRODUCT_READINESS_NOT_ACCEPTED"));
  assert.ok(result.production_cutover_readiness.blockers.includes("B2_QUOTA_AUTHORIZATION_PROOF_NOT_AVAILABLE"));
  assert.ok(result.production_cutover_readiness.blockers.includes("AUTHENTICATED_CUSTOMER_FLOW_NOT_VERIFIED"));
  assert.ok(result.production_cutover_readiness.blockers.includes("PRODUCTION_DOMAIN_DNS_TLS_AND_ROUTE_ACCEPTANCE_NOT_VERIFIED"));
  assert.equal(health.signed_product_readiness.legacy_http_status, 503);
});

test("staging deployment provisions its own pepper once and verifies it after deployment", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy-web-production-staging.yml", import.meta.url), "utf8");
  assert.match(workflow, /randomBytes\(32\)\.toString\("base64url"\)/u);
  assert.match(workflow, /secret put GEOMACRO_SECURITY_FINGERPRINT_PEPPER/u);
  assert.match(workflow, /fingerprint_pepper_present=true/u);
  assert.match(workflow, /WEB_STAGING_REQUIRE_FINGERPRINT_PEPPER: 'true'/u);
  assert.doesNotMatch(workflow, /geomacro-web-candidate-isolated.*(?:secret|pepper)/iu);
});

test("workflow passes verified isolation into the two-outcome acceptance report", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy-web-production-staging.yml", import.meta.url), "utf8");
  assert.match(workflow, /id: isolation[\s\S]*?echo 'verified=true' >> "\$GITHUB_OUTPUT"/u);
  assert.match(workflow, /WEB_STAGING_ISOLATION_VERIFIED: \$\{\{ steps\.isolation\.outputs\.verified \}\}/u);
  assert.match(workflow, /Verify staging deployment acceptance and report production cutover readiness independently/u);
});

test("www canonical redirect is reversible by routing and retains query parameters", async () => {
  const worker = productionWebsite({ fetch: async () => { throw Error("APP_SHOULD_NOT_RUN"); } });
  const response = await worker.fetch(new Request("https://www.geomacro.live/intelligence?q=copper"), {}, {});
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://geomacro.live/intelligence?q=copper");
});

test("exact canonical main SHA is mandatory before producing a deployment", t => {
  const root = mkdtempSync(join(tmpdir(), "geomacro-web-production-sha-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".output/server"), { recursive: true });
  mkdirSync(join(root, "workers/web-production"), { recursive: true });
  copyFileSync(new URL("../../workers/web-production/entry.mjs", import.meta.url),
    join(root, "workers/web-production/entry.mjs"));
  writeFileSync(join(root, ".output/server/wrangler.json"), JSON.stringify({
    main: "index.mjs", no_bundle: true, compatibility_date: "2026-11-22",
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: { directory: "../public", binding: "ASSETS" },
  }));
  assert.throws(() => prepareWebProduction({ root, sha: "not-a-sha" }), /WEB_PRODUCTION_EXACT_SHA_REQUIRED/u);
});

import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareWebProduction } from "./prepare-web-production.mjs";
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

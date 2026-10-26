import test from "node:test";
import assert from "node:assert/strict";
import { backendOnlyPath, classifyLiveWebSourceDelta } from "./verify-live-web-source-marker.mjs";

const observed = "a".repeat(40);
const expected = "b".repeat(40);

test("exact canonical build marker is accepted", () => {
  const result = classifyLiveWebSourceDelta({
    expectedSha: observed, observedSha: observed, isAncestor: true, changedPaths: [],
  });
  assert.equal(result.status, "exact");
  assert.equal(result.live_web_source_verified, true);
  assert.equal(result.publish_required, false);
});

test("backend, workflow, operations, documentation and tests-only delta does not require Lovable publish", () => {
  const changedPaths = [
    "workers/control-plane/src/website-derived-intelligence.mjs",
    "scripts/ops/verify-live-web-source-marker.mjs",
    ".github/workflows/production-website-health.yml",
    "src/__tests__/website-derived-news-continuity.test.ts",
    "docs/ops/production-health.md",
  ];
  assert.ok(changedPaths.every(backendOnlyPath));
  const result = classifyLiveWebSourceDelta({
    expectedSha: expected, observedSha: observed, isAncestor: true, changedPaths,
  });
  assert.equal(result.status, "backend_only_compatible");
  assert.equal(result.website_input_change_count, 0);
  assert.equal(result.live_web_source_verified, true);
  assert.equal(result.publish_required, false);
});

test("any website source, public asset, build config, dependency or product config change still requires publish", () => {
  for (const path of [
    "src/routes/intelligence.tsx",
    "src/lib/public-derived-news-client.ts",
    "src/components/home/commercial-home.tsx",
    "public/llms.txt",
    "index.html",
    "vite.config.ts",
    "package.json",
    "bun.lock",
    "config/commercial-route-disposition.json",
    "src/lib/shared-utility.ts",
  ]) {
    const result = classifyLiveWebSourceDelta({
      expectedSha: expected, observedSha: observed, isAncestor: true, changedPaths: [path],
    });
    assert.equal(result.status, "publish_required", path);
    assert.equal(result.live_web_source_verified, false, path);
    assert.equal(result.publish_required, true, path);
  }
});

test("a published build SHA not in canonical-main ancestry is rejected", () => {
  const result = classifyLiveWebSourceDelta({
    expectedSha: expected, observedSha: observed, isAncestor: false,
    changedPaths: ["workers/control-plane/src/website-derived-intelligence.mjs"],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "PUBLISHED_SHA_NOT_MAIN_ANCESTOR");
});

test("malformed hashes and invalid diff input fail closed", () => {
  assert.equal(classifyLiveWebSourceDelta({
    expectedSha: "bad", observedSha: observed,
  }).status, "invalid");
  assert.equal(classifyLiveWebSourceDelta({
    expectedSha: expected, observedSha: observed, isAncestor: true,
    changedPaths: [""],
  }).status, "invalid");
});

test("an empty delta between distinct ancestor commits is safe because the website tree is unchanged", () => {
  const result = classifyLiveWebSourceDelta({
    expectedSha: expected, observedSha: observed, isAncestor: true, changedPaths: [],
  });
  assert.equal(result.status, "backend_only_compatible");
  assert.equal(result.changed_file_count, 0);
  assert.equal(result.live_web_source_verified, true);
});

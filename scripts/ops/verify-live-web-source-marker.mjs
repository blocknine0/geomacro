#!/usr/bin/env node
/**
 * Verify whether the published website bundle still matches the website-facing
 * source tree at canonical main. Backend-only monorepo commits do not change the
 * built UI and therefore must not require a wasteful Lovable republish.
 *
 * Any changed UI, static asset, build config, package/dependency or product
 * content file stays fail-closed and requires an exact live publish marker.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[a-f0-9]{40}$/u;
const SCHEMA = "geomacro.live-web-source-marker-check.v1";

export function backendOnlyPath(path) {
  return /^(?:workers\/|scripts\/(?:ops|lib|tests)\/|\.github\/|docs\/|src\/__tests__\/)/u.test(path) ||
    /^(?:README|CONTRIBUTING|CHANGELOG|SECURITY)\.md$/iu.test(path) ||
    /^LICENSE(?:\.|$)/u.test(path);
}

export function classifyLiveWebSourceDelta({
  expectedSha,
  observedSha,
  isAncestor,
  changedPaths = [],
}) {
  const expected = String(expectedSha ?? "").trim().toLowerCase();
  const observed = String(observedSha ?? "").trim().toLowerCase();
  if (!SHA.test(expected) || !SHA.test(observed)) {
    return { schema: SCHEMA, status: "invalid", reason: "SHA_FORMAT_INVALID",
      live_web_source_verified: false };
  }
  if (observed === expected) {
    return { schema: SCHEMA, status: "exact", reason: "EXACT_CANONICAL_MAIN",
      expected_sha: expected, published_sha: observed, changed_file_count: 0,
      live_web_source_verified: true, publish_required: false };
  }
  if (isAncestor !== true) {
    return { schema: SCHEMA, status: "invalid", reason: "PUBLISHED_SHA_NOT_MAIN_ANCESTOR",
      expected_sha: expected, published_sha: observed, live_web_source_verified: false };
  }
  if (!Array.isArray(changedPaths) || changedPaths.some(path => typeof path !== "string" || !path)) {
    return { schema: SCHEMA, status: "invalid", reason: "SOURCE_DIFF_INVALID",
      expected_sha: expected, published_sha: observed, live_web_source_verified: false };
  }
  const webChanges = changedPaths.filter(path => !backendOnlyPath(path));
  if (webChanges.length > 0) {
    return { schema: SCHEMA, status: "publish_required", reason: "WEBSITE_BUILD_INPUT_CHANGED",
      expected_sha: expected, published_sha: observed, changed_file_count: changedPaths.length,
      website_input_change_count: webChanges.length, live_web_source_verified: false,
      publish_required: true };
  }
  return { schema: SCHEMA, status: "backend_only_compatible",
    reason: "NO_WEBSITE_BUILD_INPUT_CHANGED", expected_sha: expected, published_sha: observed,
    changed_file_count: changedPaths.length, website_input_change_count: 0,
    live_web_source_verified: true, publish_required: false };
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function main() {
  const [observedSha, expectedSha] = process.argv.slice(2);
  if (!SHA.test(String(observedSha ?? "")) || !SHA.test(String(expectedSha ?? ""))) {
    console.log(JSON.stringify(classifyLiveWebSourceDelta({ observedSha, expectedSha })));
    process.exitCode = 11;
    return;
  }
  if (observedSha.toLowerCase() === expectedSha.toLowerCase()) {
    console.log(JSON.stringify(classifyLiveWebSourceDelta({ observedSha, expectedSha })));
    return;
  }
  if (git(["cat-file", "-e", observedSha + "^{commit}"]).status !== 0 ||
      git(["cat-file", "-e", expectedSha + "^{commit}"]).status !== 0) {
    console.log(JSON.stringify({ schema: SCHEMA, status: "invalid",
      reason: "SOURCE_COMMIT_NOT_AVAILABLE", live_web_source_verified: false }));
    process.exitCode = 11;
    return;
  }
  if (git(["merge-base", "--is-ancestor", observedSha, expectedSha]).status !== 0) {
    console.log(JSON.stringify(classifyLiveWebSourceDelta({
      observedSha, expectedSha, isAncestor: false,
    })));
    process.exitCode = 11;
    return;
  }
  const diff = git(["diff", "--name-only", observedSha + ".." + expectedSha]);
  if (diff.status !== 0) {
    console.log(JSON.stringify({ schema: SCHEMA, status: "invalid",
      reason: "SOURCE_DIFF_UNAVAILABLE", live_web_source_verified: false }));
    process.exitCode = 11;
    return;
  }
  const changedPaths = diff.stdout.split(/\r?\n/u).filter(Boolean);
  const decision = classifyLiveWebSourceDelta({
    observedSha, expectedSha, isAncestor: true, changedPaths,
  });
  console.log(JSON.stringify(decision));
  if (decision.status === "publish_required") process.exitCode = 10;
  else if (decision.status === "invalid") process.exitCode = 11;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}

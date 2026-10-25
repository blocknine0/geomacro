import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { deriveControlPlaneRootToken } from "../ops/derive-control-plane-root-token.mjs";

const workflow = readFileSync(new URL("../../.github/workflows/resync-control-plane-root-token.yml", import.meta.url), "utf8");

test("derives the existing domain-separated Control Plane token deterministically", () => {
  const root = "example-root-secret-material-with-at-least-32-chars";
  const expected = createHmac("sha256", root).update("geomacro-control-plane-v1").digest("hex");
  const actual = deriveControlPlaneRootToken(root);
  assert.equal(actual, expected);
  assert.match(actual, /^[a-f0-9]{64}$/u);
  assert.notEqual(actual, root);
});

test("normalizes surrounding whitespace consistently with existing publisher code", () => {
  const root = "example-root-secret-material-with-at-least-32-chars";
  assert.equal(deriveControlPlaneRootToken("  " + root + "\n"), deriveControlPlaneRootToken(root));
});

test("short or missing root material fails with a fixed non-sensitive code", () => {
  for (const value of [undefined, null, "", "x".repeat(31), "  ".repeat(20)]) {
    assert.throws(() => deriveControlPlaneRootToken(value), { message: "CONTROL_PLANE_ROOT_TOKEN_REQUIRED" });
  }
});

test("live job can run only by exact manual approval on canonical main", () => {
  assert.match(workflow, /workflow_dispatch:[\s\S]*RESYNC_CONTROL_PLANE_TOKEN_ONLY_NO_PREDGE_CHANGE/u);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(workflow, /environment: production/u);
});

test("workflow may update only CONTROL_PLANE_TOKEN and cannot deploy or alter Predge", () => {
  const secretPuts = [...workflow.matchAll(/secret put\s+([A-Z0-9_]+)/gu)].map((match) => match[1]);
  assert.deepEqual(secretPuts, ["CONTROL_PLANE_TOKEN"]);
  assert.doesNotMatch(workflow, /wrangler[^\n]*\bdeploy\b/u);
  assert.doesNotMatch(workflow, /secrets\.PREDGE_[A-Z0-9_]+/u);
  assert.doesNotMatch(workflow, /d1\s+(?:create|execute|migrations\s+apply)\b/iu);
  assert.doesNotMatch(workflow, /(?:COINBASE_API_KEY|COINBASE_X402_MAINNET_ACK|GEOMACRO_COMMERCIAL_LAUNCH_ACK):\s*\$\{\{\s*secrets\./u);
  assert.match(workflow, /node scripts\/ops\/verify-private-handoff-production\.mjs/u);
});

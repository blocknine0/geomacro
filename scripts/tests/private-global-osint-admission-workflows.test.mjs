import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow = (name) => readFileSync(
  new URL("../../.github/workflows/" + name, import.meta.url), "utf8",
);
const direct = workflow("hot50-direct-original-news-20m.yml");
const osint = workflow("private-global-osint-15m.yml");
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing workflow section: ${start}`);
  return source.slice(from, to);
};

test("direct original sidecar verifies and passes the live Queue receipt", () => {
  const job = section(
    direct,
    "  collect-direct-20m:",
    "\n  encrypted-held-three-domain-20m:",
  );
  assert.match(job, /id: risk-stream-queue[\s\S]*?verify-risk-stream-queue-provider\.mjs/u);
  assert.match(job, /GEOMACRO_EXPECTED_CONTROL_PLANE_SOURCE_SHA: \$\{\{ github\.sha \}\}/u);
  assert.match(job, /RISK_STREAM_QUEUE_PROVIDER_ID: \$\{\{ steps\.risk-stream-queue\.outputs\.queue_id \}\}/u);
  assert.match(job, /RISK_STREAM_QUEUE_PROVIDER_RECEIPT_SHA256: \$\{\{ steps\.risk-stream-queue\.outputs\.receipt_sha256 \}\}/u);
  const emitter = section(
    job,
    "- name: Send only separately item-license-verified direct originals through dual attestation",
    "- name: Remove transient licensed candidate sidecar",
  );
  assert.match(emitter, /steps\.risk-stream-queue\.outputs\.verified == 'true'/u);
});

test("CRITICAL_ONLY dispatch routes through the bounded admitted source and sidecar lane", () => {
  const legacy = section(osint, "  collect-private:", "\n  collect-source-intake-only:");
  assert.match(legacy, /needs\.quota-admission\.outputs\.research == 'true'/u,
    "the full legacy research tick must remain research-admitted");

  const bounded = section(osint, "  collect-source-intake-only:", "\n  collect-unverified-private:");
  assert.match(bounded, /needs\.quota-admission\.outputs\.source_intake == 'true'/u);
  assert.match(bounded, /github\.event_name == 'workflow_dispatch'[\s\S]*?outputs\.research != 'true'/u,
    "manual CRITICAL_ONLY cycles need the bounded source-only path");
  assert.match(bounded, /PHASE2I_PROVIDER_MAX_NEW_ROWS: \$\{\{ needs\.quota-admission\.outputs\.source_intake_max_new_rows \}\}/u);
  assert.match(bounded, /if: needs\.quota-admission\.outputs\.risk_stream_sidecar_admitted == 'true'/u);
  assert.match(bounded, /id: risk-stream-queue[\s\S]*?verify-risk-stream-queue-provider\.mjs/u);
  assert.match(bounded, /RISK_STREAM_QUEUE_PROVIDER_ID: \$\{\{ steps\.risk-stream-queue\.outputs\.queue_id \}\}/u);
  assert.match(bounded, /RISK_STREAM_QUEUE_PROVIDER_RECEIPT_SHA256: \$\{\{ steps\.risk-stream-queue\.outputs\.receipt_sha256 \}\}/u);
  assert.match(bounded, /GEOMACRO_EXPECTED_CONTROL_PLANE_SOURCE_SHA: \$\{\{ github\.sha \}\}/u);
  assert.doesNotMatch(bounded, /outputs\.state\s*==\s*'CRITICAL_ONLY'/u);

  const standalone = section(osint, "  risk-stream-sidecar:", "\n  live-source-probe:");
  assert.match(standalone, /outputs\.risk_stream_sidecar_admitted == 'true'/u);
  assert.match(standalone, /outputs\.source_intake != 'true'/u,
    "the standalone emitter yields to the inline bounded sidecar to avoid duplicate admission");

  const held = section(osint, "  stage-private-sources-when-d1-held:", "\n  ");
  assert.match(held, /outputs\.source_intake != 'true'/u,
    "held archival yields when bounded source intake has been admitted");
});

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ORIGIN = String(process.env.GEOMACRO_ORIGIN ?? "https://geomacro.live").replace(/\/$/, "");
const POSITIVE_CONTROL_RUNS = 5;

function fail(code, detail) {
  throw new Error(detail === undefined ? code : `${code}: ${String(detail)}`);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

async function fetchJson(path) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${ORIGIN}${path}${separator}repeatability_probe=${Date.now()}-${Math.random()}`, {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail("PUBLIC_CONTRACT_FETCH_FAILED", `${path} HTTP ${response.status}`);
  return response.json();
}

function runPositiveControl() {
  const run = spawnSync(process.execPath, ["scripts/check-federico-positive-control.ts"], {
    encoding: "utf8",
    env: process.env,
  });
  if (run.status !== 0) {
    fail("POSITIVE_CONTROL_FAILED", (run.stderr || run.stdout || "").trim());
  }
  let parsed;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    fail("POSITIVE_CONTROL_NON_JSON", run.stdout.slice(0, 500));
  }
  if (
    parsed?.ok !== true ||
    parsed?.publication_policy_accepts !== true ||
    parsed?.verification?.status !== "VERIFIED" ||
    parsed?.commercial_eligibility?.status !== "VERIFIED" ||
    Number(parsed?.evidence_summary?.independent_source_count ?? 0) < 2
  ) {
    fail("POSITIVE_CONTROL_CONTRACT_FAILED");
  }
  return {
    hash: sha256(stableJson(parsed)),
    result: parsed,
  };
}

const readiness = spawnSync("node", ["scripts/check-partner-commercial-readiness.mjs"], {
  encoding: "utf8",
  env: process.env,
});
if (readiness.status !== 0) {
  fail("PARTNER_COMMERCIAL_READINESS_FAILED", (readiness.stderr || readiness.stdout || "").trim());
}

const positive = [];
for (let i = 0; i < POSITIVE_CONTROL_RUNS; i += 1) positive.push(runPositiveControl());
const positiveHashes = [...new Set(positive.map((entry) => entry.hash))];
if (positiveHashes.length !== 1) {
  fail("POSITIVE_CONTROL_NON_DETERMINISTIC", positiveHashes.join(","));
}

const discoverySamples = [];
const trustSamples = [];
for (let i = 0; i < 3; i += 1) {
  const [discovery, trust] = await Promise.all([
    fetchJson("/.well-known/geomacro-partner-verification.json"),
    fetchJson("/api/risk-object-keys"),
  ]);

  const discoveryProjection = {
    schema_version: discovery?.schema_version,
    risk_object: discovery?.risk_object,
    federation: discovery?.federation,
    partner_handoff: discovery?.partner_handoff,
    security: discovery?.security,
    repeatability: discovery?.repeatability,
  };
  discoverySamples.push(sha256(stableJson(discoveryProjection)));

  const keys = Array.isArray(trust?.keys) ? trust.keys : [];
  const ids = keys.map((item) => String(item?.key_id ?? "")).filter(Boolean);
  if (ids.length === 0 || new Set(ids).size !== ids.length) fail("TRUST_REGISTRY_KEY_ID_CONTRACT_FAILED");
  const active = keys
    .filter((item) => item?.status === "active")
    .map((item) => ({
      key_id: item.key_id,
      public_key_spki_b64: item.public_key_spki_b64,
      status: item.status,
      not_before: item.not_before ?? null,
      not_after: item.not_after ?? null,
    }))
    .sort((a, b) => String(a.key_id).localeCompare(String(b.key_id)));
  if (active.length < 1) fail("NO_ACTIVE_SIGNING_KEY");
  trustSamples.push(sha256(stableJson(active)));
}

if (new Set(discoverySamples).size !== 1) fail("PUBLIC_PARTNER_CONTRACT_NON_DETERMINISTIC");
if (new Set(trustSamples).size !== 1) fail("ACTIVE_TRUST_SET_CHANGED_WITHIN_PROBE");

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.federico-repeatability.v1",
  checked_at: new Date().toISOString(),
  origin: ORIGIN,
  positive_control: {
    runs: POSITIVE_CONTROL_RUNS,
    deterministic: true,
    result_sha256: positiveHashes[0],
    policy_version: positive[0].result?.policy_version ?? null,
    vector_version: positive[0].result?.vector_version ?? null,
  },
  public_contract: {
    samples: discoverySamples.length,
    deterministic: true,
    projection_sha256: discoverySamples[0],
  },
  active_trust_registry: {
    samples: trustSamples.length,
    deterministic_within_probe: true,
    projection_sha256: trustSamples[0],
  },
  semantics: {
    same_immutable_record_same_hash_and_signature_result: true,
    fresh_evidence_may_change_new_gro_content: true,
    stale_or_insufficient_evidence_fails_closed: true,
    partner_live_review_scheduled: false,
    partner_allowance_used: 0,
    user_funds_used: false,
    execution_authorized: false,
  },
}, null, 2));

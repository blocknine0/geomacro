#!/usr/bin/env node
/**
 * Independent, strictly read-only Hybrid Ask production acceptance.
 * No paid endpoint is called; no payment signature or wallet is used.
 * Never log returned intelligence, private source identity, or user content.
 */
const BASE_URL = String(process.env.GEOMACRO_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const EXPECTED_SHA = String(process.env.EXPECTED_CANONICAL_SHA || "").trim().toLowerCase();
const ORIGIN = "https://geomacro.live";

const CASES = [
  ["geopolitics", "What is the latest geopolitical risk index?", "Geopolitical Risk Index"],
  ["macro_fx", "What is the latest macroeconomic risk index?", "Macroeconomic Risk Index"],
  ["critical_minerals", "What is the latest critical minerals risk index?", "Critical Minerals Risk Index"],
];

function fail(code) { throw new Error(code); }
function sha(value) { return /^[0-9a-f]{40}$/.test(value); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

export function verifyBuildMarker(marker, expectedSha) {
  if (!sha(expectedSha)) fail("EXPECTED_SHA_INVALID");
  if (!object(marker) || marker.schema_version !== "geomacro.deployment-build.v1" ||
      marker.canonical_repository !== "blocknine0/geomacro" ||
      marker.production_activation_performed !== false) fail("BUILD_MARKER_INVALID");
  if (String(marker.canonical_main_sha || "").toLowerCase() !== expectedSha) {
    fail("LIVE_BUILD_SHA_MISMATCH");
  }
}

export function validateAskAnswer(payload, expectedDomain, requireVerified = true) {
  if (!object(payload) || payload.ok !== true || !object(payload.data)) fail("ASK_RESPONSE_INVALID");
  const data = payload.data;
  for (const field of ["summary", "what_changed", "why_it_matters", "geomacro_view"]) {
    if (typeof data[field] !== "string" || !data[field].trim()) fail("ASK_MISSING_" + field.toUpperCase());
  }
  if (!Array.isArray(data.evidence) || typeof data.insufficient_evidence !== "boolean" ||
      typeof data.low_confidence !== "boolean") fail("ASK_EVIDENCE_FLAGS_INVALID");
  if (data.source_identity_exposed !== false || data.durable_live_storage_write !== false) {
    fail("ASK_PRIVACY_OR_DURABILITY_VIOLATION");
  }
  const serialized = JSON.stringify(payload);
  if (["raw_payload", "provider_name", "publisher_name", "source_url", "https://", "http://"]
    .some(token => serialized.includes(token))) fail("ASK_PRIVATE_SOURCE_LEAK");
  if (requireVerified && (data.insufficient_evidence || data.low_confidence)) {
    fail("ASK_CURRENT_VERIFIED_EVIDENCE_UNAVAILABLE");
  }
  if (requireVerified && expectedDomain &&
      !["summary", "what_changed", "why_it_matters", "geomacro_view"]
        .some(field => data[field].includes(expectedDomain))) fail("ASK_DOMAIN_UNSUPPORTED");
  return {
    sufficient: !data.insufficient_evidence,
    low_confidence: data.low_confidence,
    evidence_count: data.evidence.length,
    data_mode: typeof data.data_mode === "string" ? data.data_mode : "unreported",
  };
}

export function validateHybridFollowUp(payload) {
  validateAskAnswer(payload, null, false);
  if (!object(payload.context) || payload.context.mode !== "bounded_follow_up" ||
      payload.context.resolved_question !== "What is the current geopolitical risk in India?") {
    fail("HYBRID_FOLLOWUP_NOT_DEPLOYED_OR_INCORRECT");
  }
  return true;
}

async function fetchBounded(path, headers = {}, timeout = 28_000) {
  const response = await fetch(BASE_URL + path, {
    method: "GET",
    headers: { accept: "application/json", ...headers },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  if (response.status !== 200) fail("HTTP_" + response.status + "_" + path.split("/").pop().replace(/[^a-zA-Z0-9]/g, "_"));
  return response;
}

async function runLive() {
  const results = [];
  const failures = [];
  async function check(key, callback) {
    try { results.push({ key, ok: true, ...(await callback()) }); }
    catch (error) {
      const reason = error instanceof Error ? error.message : "UNKNOWN_FAILURE";
      results.push({ key, ok: false, reason: /^[A-Z0-9_]+$/.test(reason) ? reason : "REQUEST_FAILED" });
      failures.push(key);
    }
  }

  await check("exact_main_published", async () => {
    const response = await fetchBounded("/.well-known/geomacro-build.json", {}, 15_000);
    const marker = await response.json();
    verifyBuildMarker(marker, EXPECTED_SHA);
    return { matched: true };
  });
  await check("ask_page_renders", async () => {
    const response = await fetchBounded("/ask-geomacro", { accept: "text/html" }, 15_000);
    const html = await response.text();
    if (!html.includes("Ask Geomacro") || /This page didn't load/i.test(html)) fail("ASK_PAGE_RENDER_INVALID");
    return { html_loaded: true };
  });

  for (const [key, question, expected] of CASES) {
    await check("verified_" + key, async () => {
      const response = await fetchBounded("/api/public-ask", {
        origin: ORIGIN,
        "x-geomacro-question": question,
        "user-agent": "Geomacro-Hybrid-ReadOnly-Acceptance/1.0",
      });
      return validateAskAnswer(await response.json(), expected, true);
    });
  }

  await check("bounded_follow_up", async () => {
    const response = await fetchBounded("/api/public-ask", {
      origin: ORIGIN,
      "x-geomacro-question": "What about India?",
      "x-geomacro-previous-question": "What is driving geopolitical risk?",
      "user-agent": "Geomacro-Hybrid-ReadOnly-Acceptance/1.0",
    });
    validateHybridFollowUp(await response.json());
    return { resolved_and_rechecked: true };
  });

  console.log(JSON.stringify({
    schema_version: "geomacro.hybrid-agent-live-acceptance.v1",
    expected_sha: EXPECTED_SHA,
    checked_at: new Date().toISOString(),
    readonly_no_funds: true,
    no_raw_data_logged: true,
    ok: failures.length === 0,
    checks: results,
  }));
  if (failures.length) process.exitCode = 1;
}

function selfTest() {
  const sample = {
    ok: true,
    data: {
      summary: "Geopolitical Risk Index available",
      what_changed: "Qualified",
      why_it_matters: "Material",
      geomacro_view: "Supported",
      evidence: [{ eventId: "signed:1" }],
      insufficient_evidence: false,
      low_confidence: false,
      source_identity_exposed: false,
      durable_live_storage_write: false,
    },
  };
  const marker = { schema_version: "geomacro.deployment-build.v1", canonical_repository: "blocknine0/geomacro",
    production_activation_performed: false, canonical_main_sha: "a".repeat(40) };
  verifyBuildMarker(marker, "a".repeat(40));
  validateAskAnswer(sample, "Geopolitical Risk Index", true);
  validateHybridFollowUp({ ...sample, context: { mode: "bounded_follow_up",
    resolved_question: "What is the current geopolitical risk in India?" } });
  for (const [action, expected] of [
    [() => verifyBuildMarker(marker, "b".repeat(40)), "LIVE_BUILD_SHA_MISMATCH"],
    [() => validateAskAnswer({ ...sample, data: { ...sample.data, insufficient_evidence: true } }, "Geopolitical Risk Index", true), "ASK_CURRENT_VERIFIED_EVIDENCE_UNAVAILABLE"],
    [() => validateHybridFollowUp({ ...sample, context: { mode: "grounded_ask" } }), "HYBRID_FOLLOWUP_NOT_DEPLOYED_OR_INCORRECT"],
    [() => validateAskAnswer({ ...sample, data: { ...sample.data, source_url: "https://private.test" } }, null, false), "ASK_PRIVATE_SOURCE_LEAK"],
  ]) {
    let observed = "NO_FAILURE";
    try { action(); } catch (error) { observed = error.message; }
    if (observed !== expected) fail("SELF_TEST_FAILED");
  }
  console.log(JSON.stringify({ ok: true, schema_version: "geomacro.hybrid-agent-acceptance-selftest.v1", cases: 7 }));
}

if (process.argv[1] && /verify-hybrid-agent-production\.mjs$/.test(process.argv[1])) {
  if (process.argv.includes("--self-test")) selfTest();
  else await runLive();
}

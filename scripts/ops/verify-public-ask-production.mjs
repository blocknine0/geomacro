#!/usr/bin/env node

const BASE_URL = String(process.env.GEOMACRO_BASE_URL ?? "https://geomacro.live").replace(/\/$/, "");
const ORIGIN = "https://geomacro.live";

const CASES = [
  {
    key: "geopolitics",
    question: "What is the latest geopolitical risk index?",
    expected: "Geopolitical Risk Index",
  },
  {
    key: "macro",
    question: "What is the latest macroeconomic risk index?",
    expected: "Macroeconomic Risk Index",
  },
  {
    key: "critical_minerals",
    question: "What is the latest critical minerals risk index?",
    expected: "Critical Minerals Risk Index",
  },
];

function assertAskResponse(body, expected) {
  const data = body?.data;
  if (body?.ok !== true || !data || typeof data !== "object") {
    throw new Error("ASK_RESPONSE_NOT_OK");
  }

  for (const field of ["summary", "what_changed", "why_it_matters", "geomacro_view"]) {
    if (typeof data[field] !== "string" || data[field].trim().length === 0) {
      throw new Error(`ASK_FIELD_INVALID:${field}`);
    }
  }

  if (!Array.isArray(data.evidence)) throw new Error("ASK_EVIDENCE_ARRAY_REQUIRED");
  if (typeof data.insufficient_evidence !== "boolean") throw new Error("ASK_INSUFFICIENT_FLAG_REQUIRED");
  if (typeof data.low_confidence !== "boolean") throw new Error("ASK_CONFIDENCE_FLAG_REQUIRED");
  if (!(typeof data.mean_relevance === "number" || data.mean_relevance === null)) {
    throw new Error("ASK_MEAN_RELEVANCE_REQUIRED");
  }
  if (data.source_identity_exposed !== false) throw new Error("ASK_SOURCE_IDENTITY_EXPOSED");
  if (data.durable_live_storage_write !== false) throw new Error("ASK_DURABLE_LIVE_WRITE_FORBIDDEN");
  if (data.insufficient_evidence !== false || data.low_confidence !== false) {
    throw new Error("ASK_VERIFIED_INDEX_NOT_ANSWERED_CONFIDENTLY");
  }

  const text = [
    data.summary,
    data.what_changed,
    data.why_it_matters,
    data.geomacro_view,
  ].join(" ");
  if (!text.includes(expected)) throw new Error(`ASK_EXPECTED_DOMAIN_MISSING:${expected}`);

  const serialized = JSON.stringify(body);
  for (const forbidden of ["raw_payload", "provider_name", "publisher_name", "source_url", "https://", "http://"]) {
    if (serialized.includes(forbidden)) throw new Error(`ASK_PRIVATE_SOURCE_LEAK:${forbidden}`);
  }

  return {
    data_mode: data.data_mode ?? null,
    cache_status: data.cache_status ?? null,
    evidence_count: data.evidence.length,
    mean_relevance: data.mean_relevance,
    low_confidence: data.low_confidence,
    insufficient_evidence: data.insufficient_evidence,
  };
}

const results = [];
for (const testCase of CASES) {
  const response = await fetch(`${BASE_URL}/api/public-ask`, {
    headers: {
      accept: "application/json",
      origin: ORIGIN,
      "x-geomacro-question": testCase.question,
      "user-agent": "Geomacro-Ask-Production-Acceptance/1.0",
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (response.status !== 200) {
    throw new Error(`ASK_HTTP_${testCase.key}_${response.status}`);
  }
  const body = await response.json();
  results.push({
    key: testCase.key,
    expected: testCase.expected,
    ...assertAskResponse(body, testCase.expected),
  });
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.ask-production-acceptance.v1",
  checked_at: new Date().toISOString(),
  domain_count: results.length,
  shared_canonical_answer_contract: true,
  raw_source_identity_exposed: false,
  durable_live_storage_write: false,
  results,
}));

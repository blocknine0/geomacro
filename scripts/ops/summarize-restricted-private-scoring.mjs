#!/usr/bin/env node
// Safe to upload to GitHub Actions: aggregate bounded counters, never article
// bodies, headlines, source URLs, provider secrets or candidate rows.
import { readFileSync, writeFileSync } from "node:fs";
import {
  PRIVATE_SCORING_DIAGNOSTIC_SCHEMA,
  sanitizedDiagnosticSummary,
} from "../lib/restricted-private-scoring-diagnostics.mjs";

const DIR = "artifacts/restricted-current-scoring";
const MAX_FILE_BYTES = 80 * 1024;
const domains = ["geopolitics", "macro", "rare_earth"];
const diagnostics = [];

for (const domain of domains) {
  const bytes = readFileSync(`${DIR}/${domain}.json`);
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("PRIVATE_SCORING_DIAGNOSTIC_INPUT_TOO_LARGE");
  }
  const data = JSON.parse(bytes.toString("utf8"));
  if (data?.schema !== "geomacro.private-scoring-candidates.v1" ||
      data?.category !== domain || data?.private_only !== true ||
      !Array.isArray(data?.records) ||
      data?.diagnostics?.schema !== PRIVATE_SCORING_DIAGNOSTIC_SCHEMA ||
      data?.diagnostics?.domain !== domain ||
      data?.diagnostics?.private_staged_count !== data.records.length) {
    throw new Error("PRIVATE_SCORING_DIAGNOSTIC_SOURCE_INVALID");
  }
  // Whitelist exact counter keys. No unknown fields leave the private runner.
  const item = data.diagnostics;
  const counts = ["discovered_candidate_count", "classifier_attempted_count",
    "classifier_returned_count", "classifier_failed_batch_count",
    "canonical_gate_pass_count", "discovery_failure_count", "private_staged_count"];
  for (const name of counts) {
    if (!Number.isSafeInteger(item[name]) || item[name] < 0) {
      throw new Error("PRIVATE_SCORING_DIAGNOSTIC_COUNTER_INVALID");
    }
  }
  if (item.private_staged_count > item.canonical_gate_pass_count ||
      item.canonical_gate_pass_count > item.classifier_returned_count ||
      item.classifier_returned_count > item.classifier_attempted_count ||
      item.classifier_attempted_count > item.discovered_candidate_count) {
    throw new Error("PRIVATE_SCORING_DIAGNOSTIC_COUNTER_INCONSISTENT");
  }
  const safeReasons = (candidate, regex, limit = item.classifier_attempted_count) => {
    if (!candidate || typeof candidate !== "object" ||
        Array.isArray(candidate) || Object.keys(candidate).length > 20) {
      throw new Error("PRIVATE_SCORING_DIAGNOSTIC_REASON_INVALID");
    }
    const safe = {};
    for (const [key, value] of Object.entries(candidate)) {
      if (!regex.test(key) || !Number.isSafeInteger(value) || value < 1 ||
          value > limit) {
        throw new Error("PRIVATE_SCORING_DIAGNOSTIC_REASON_INVALID");
      }
      safe[key] = value;
    }
    return safe;
  };
  diagnostics.push({
    schema: PRIVATE_SCORING_DIAGNOSTIC_SCHEMA,
    domain,
    ...Object.fromEntries(counts.map(x => [x, item[x]])),
    preclassification_rejections: safeReasons(item.preclassification_rejections,
      /^(?:publisher_url_invalid|publisher_domain_mismatch|publisher_title_missing|publisher_time_unavailable)$/u, 64),
    gate_rejections: safeReasons(item.gate_rejections, /^[a-z_]{3,45}$/u),
    private_stage_rejections: safeReasons(item.private_stage_rejections,
      /^(?:private_scoring_[a-z_]{2,65}|private_stage_rejected_unknown)$/u),
    public_published: false,
    supabase_writes: 0,
  });
}
const summary = sanitizedDiagnosticSummary(diagnostics, {
  runId: process.env.GITHUB_RUN_ID,
});
writeFileSync(`${DIR}/diagnostics-summary.json`,
  JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(summary));
if (summary.qualified_private_rows === 0) {
  console.error("PRIVATE_SCORING_ZERO_QUALIFIED_CANDIDATES: independent current scored evidence unavailable");
  process.exitCode = 78; // intentional fail-closed; never fake B2/D1 success
}

// Codes only: no upstream headlines, URLs, provider tokens or article text.
// These counters explain why a PRIVATE scoring canary had no qualified rows.
export const PRIVATE_SCORING_DIAGNOSTIC_SCHEMA =
  "geomacro.private-scoring-diagnostic.v1";

const GATE_FAMILIES = Object.freeze([
  ["category_mismatch", /^category mismatch/u],
  ["invalid_category", /^(?:invalid fetch bucket|bad category)/u],
  ["not_relevant", /^llm relevant=false/u],
  ["stale", /^stale\s/u],
  ["global_deny", /^global deny$/u],
  ["domain_deny", /^(?:geopolitics|macro|rare_earth) deny$/u],
  ["no_domain_anchor", /^(?:geopolitics|macro|rare_earth) anchor miss$/u],
  ["cross_category", /^cross-category conflict/u],
  ["low_confidence", /^low confidence/u],
  ["low_severity", /^low severity/u],
]);

export function safeGateReasonCode(reason) {
  const message = String(reason ?? "");
  for (const [code, expression] of GATE_FAMILIES) {
    if (expression.test(message)) return code;
  }
  return "unclassified_rejection";
}

export function emptyPrivateScoringDiagnostic(domain) {
  if (!["geopolitics", "macro", "rare_earth"].includes(domain)) {
    throw new Error("PRIVATE_SCORING_DIAGNOSTIC_DOMAIN_INVALID");
  }
  return {
    schema: PRIVATE_SCORING_DIAGNOSTIC_SCHEMA,
    domain,
    discovered_candidate_count: 0,
    classifier_attempted_count: 0,
    classifier_returned_count: 0,
    classifier_failed_batch_count: 0,
    canonical_gate_pass_count: 0,
    gate_rejections: {},
    preclassification_rejections: {},
    private_stage_rejections: {},
    discovery_failure_count: 0,
    private_staged_count: 0,
    public_published: false,
    supabase_writes: 0,
  };
}

export function addDiagnosticCount(counter, key) {
  if (!counter || typeof counter !== "object" ||
      !/^[a-z][a-z0-9_]{0,63}$/u.test(String(key ?? ""))) {
    throw new Error("PRIVATE_SCORING_DIAGNOSTIC_KEY_INVALID");
  }
  counter[key] = (Number(counter[key]) || 0) + 1;
}

export function safePrivateStageErrorCode(error) {
  const code = String(error?.message ?? "");
  const allowed = new Set([
    "PRIVATE_SCORING_CANONICAL_ADMISSION_INVALID",
    "PRIVATE_SCORING_SCORE_INVALID",
    "PRIVATE_SCORING_CLASSIFIER_PROVENANCE_INVALID",
    "PRIVATE_SCORING_ORIGINAL_PUBLISH_TIME_INVALID",
    "PRIVATE_SCORING_SOURCE_URL_INVALID",
    "PRIVATE_SCORING_ORIGINAL_PUBLISHER_UNVERIFIED",
    "PRIVATE_SCORING_SOURCE_TITLE_MISSING",
    "PRIVATE_SCORING_DERIVED_TEXT_INVALID",
  ]);
  return allowed.has(code) ? code.toLowerCase() : "private_stage_rejected_unknown";
}

export function sanitizedDiagnosticSummary(diagnostics, {
  runId = "unknown",
} = {}) {
  if (!Array.isArray(diagnostics) || diagnostics.length !== 3) {
    throw new Error("PRIVATE_SCORING_DIAGNOSTIC_CATEGORY_SET_INVALID");
  }
  const expected = ["geopolitics", "macro", "rare_earth"];
  if (expected.some((domain, index) =>
    diagnostics[index]?.domain !== domain ||
    diagnostics[index]?.schema !== PRIVATE_SCORING_DIAGNOSTIC_SCHEMA
  )) throw new Error("PRIVATE_SCORING_DIAGNOSTIC_CATEGORY_SET_INVALID");
  const total = diagnostics.reduce(
    (sum, result) => sum + result.private_staged_count, 0,
  );
  const classified = diagnostics.reduce(
    (sum, result) => sum + result.classifier_returned_count, 0,
  );
  return {
    schema: "geomacro.private-scoring-diagnostic-summary.v1",
    workflow_run_id: String(runId).replace(/[^0-9]/gu, "").slice(0, 24) || "unknown",
    status: total > 0 ? "PRIVATE_ELIGIBLE_STAGE_PENDING_B2_PROOF" :
      "BLOCKED_NO_QUALIFIED_CANONICAL_SCORES",
    current_production_readiness: false,
    public_published: false,
    supabase_writes: 0,
    qualified_private_rows: total,
    classifier_returned_rows: classified,
    all_three_domains_qualified: diagnostics.every(x => x.private_staged_count > 0),
    domains: diagnostics,
  };
}

#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Failed Federico reviews must preserve actionable receiver diagnostics
 * without exporting the signed GRO, external evidence, complete review
 * request/response, or credentials to GitHub's publicly readable artifacts.
 */
function safeText(value, maxLength = 1200) {
  if (typeof value !== "string") return "";
  return value
    .replace(/https?:\/\/[^\s<>"'()]+/gi, "[redacted-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+\/_.:=-]+/gi, "[redacted-auth]")
    .replace(/(?:api[_-]?key|secret|access[_-]?token)\s*[:=]\s*\S+/gi, "[redacted-secret]")
    .slice(0, maxLength);
}

export function summarizeFedericoRejection(rawText, runId = "") {
  const response = JSON.parse(rawText);
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("FEDERICO_DIAGNOSTIC_RESPONSE_INVALID");
  }
  const issues = Array.isArray(response.issues) ? response.issues : [];
  const allowSeverity = new Set(["blocker", "high", "medium", "low", "info"]);
  const summaries = issues.slice(0, 30).map((item, index) => {
    const severity = String(item?.severity ?? "").toLowerCase();
    return {
      issue_number: index + 1,
      severity: allowSeverity.has(severity) ? severity : "unspecified",
      category: safeText(item?.category, 100),
      description: safeText(item?.description, 1200),
    };
  });
  return {
    schema: "geomacro.federico-redacted-review-diagnostic.v1",
    run_id: safeText(runId, 32),
    raw_review_response_sha256: createHash("sha256").update(rawText, "utf8").digest("hex"),
    verdict: safeText(response.verdict, 40),
    status: safeText(response.status, 40),
    issue_count: issues.length,
    issues: summaries,
    raw_partner_response_included: false,
    raw_source_material_included: false,
    signed_gro_included: false,
    credentials_included: false,
    user_funds_authorized: false,
    execution_authorized: false,
  };
}

if (import.meta.main) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("FEDERICO_DIAGNOSTIC_PATHS_REQUIRED");
  const report = summarizeFedericoRejection(readFileSync(input, "utf8"), process.env.GITHUB_RUN_ID || "");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({
    schema: report.schema,
    verdict: report.verdict,
    issue_count: report.issue_count,
    raw_review_response_sha256: report.raw_review_response_sha256,
    no_raw_payloads: true,
  }));
}

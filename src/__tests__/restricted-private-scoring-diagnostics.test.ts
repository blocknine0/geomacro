import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  emptyPrivateScoringDiagnostic,
  sanitizedDiagnosticSummary,
  addDiagnosticCount,
  safeGateReasonCode,
  safePrivateStageErrorCode,
} from "../../scripts/lib/restricted-private-scoring-diagnostics.mjs";

const allDomains = () => ["geopolitics", "macro", "rare_earth"]
  .map(emptyPrivateScoringDiagnostic);

describe("#1827 private current-scoring no-candidate production diagnosis", () => {
  it("records no-eligible case with three domain counts, no success or fake archive", () => {
    const summary = sanitizedDiagnosticSummary(allDomains(), { runId: "37895748333" });
    expect(summary.workflow_run_id).toBe("37895748333");
    expect(summary.status).toBe("BLOCKED_NO_QUALIFIED_CANONICAL_SCORES");
    expect(summary.qualified_private_rows).toBe(0);
    expect(summary.all_three_domains_qualified).toBe(false);
    expect(summary.current_production_readiness).toBe(false);
    expect(summary.public_published).toBe(false);
    expect(summary.supabase_writes).toBe(0);
    expect(JSON.stringify(summary)).not.toContain("source_url");
  });

  it("keeps useful aggregate counts without article text or source identity", () => {
    const rows = allDomains();
    const d = rows[0];
    d.discovered_candidate_count = 2;
    d.classifier_attempted_count = 2;
    d.classifier_returned_count = 2;
    addDiagnosticCount(d.gate_rejections,
      safeGateReasonCode('low confidence 51'));
    addDiagnosticCount(d.gate_rejections,
      safeGateReasonCode('low severity 18'));
    addDiagnosticCount(d.private_stage_rejections,
      safePrivateStageErrorCode(new Error("PRIVATE_SCORING_ORIGINAL_PUBLISHER_UNVERIFIED")));
    expect(d.gate_rejections).toEqual({ low_confidence: 1, low_severity: 1 });
    expect(d.private_stage_rejections)
      .toEqual({ private_scoring_original_publisher_unverified: 1 });
    expect(sanitizedDiagnosticSummary(rows).status)
      .toBe("BLOCKED_NO_QUALIFIED_CANONICAL_SCORES");
  });

  it("never emits untrusted gate messages or article/source titles", () => {
    expect(safeGateReasonCode('stale https://publisher.example.com/private/news'))
      .toBe("stale");
    expect(safeGateReasonCode('bad category "exfil secret token"'))
      .toBe("invalid_category");
    expect(safeGateReasonCode('unknown SRC=https://private.example.com'))
      .toBe("unclassified_rejection");
    expect(safePrivateStageErrorCode(new Error(
      'API KEY / upstream publisher title https://private.example.org')))
      .toBe("private_stage_rejected_unknown");
    expect(() => addDiagnosticCount({}, 'https://original-publisher.com'))
      .toThrow("PRIVATE_SCORING_DIAGNOSTIC_KEY_INVALID");
  });

  it("rejects partial category census and keeps zero-score B2 fail-closed", () => {
    expect(() => sanitizedDiagnosticSummary(allDomains().slice(0, 2)))
      .toThrow("PRIVATE_SCORING_DIAGNOSTIC_CATEGORY_SET_INVALID");
    const workflow = readFileSync(
      ".github/workflows/restricted-private-current-scoring.yml", "utf8");
    const script = readFileSync("scripts/ops/summarize-restricted-private-scoring.mjs", "utf8");
    const scorer = readFileSync("scripts/ingest-news.js", "utf8");
    expect(workflow).toContain("Publish privacy-safe stage rejection diagnostics");
    expect(workflow.indexOf("Publish privacy-safe stage rejection diagnostics"))
      .toBeLessThan(workflow.indexOf("Verify one private B2 bundle"));
    expect(workflow).toContain("artifacts/restricted-current-scoring/diagnostics-summary.json");
    expect(workflow).not.toContain("SUPABASE_DB_URL: ${{ secrets.");
    expect(script).toContain("PRIVATE_SCORING_ZERO_QUALIFIED_CANDIDATES");
    expect(script).toContain("process.exitCode = 78");
    expect(script).toContain("private_staged_count !== data.records.length");
    expect(scorer).toContain("category.name !== privateScoringDomain");
    expect(scorer).toContain("privateDiagnostic.gate_rejections");
    expect(scorer).toContain("safePrivateStageErrorCode(error)");
    expect(scorer).toContain("diagnostics: privateDiagnostic");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
  });
});

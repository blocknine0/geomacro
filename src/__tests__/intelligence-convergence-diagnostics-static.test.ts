import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/intelligence-scored-refresh.yml",
  "utf8",
);

describe("#1414 Intelligence production convergence diagnostics", () => {
  it("keeps the scored-current first, live-fallback-only-when-needed fail-closed acceptance contract", () => {
    expect(workflow).toContain("body?.ok === true");
    expect(workflow).toContain("scoredCurrentAcrossAllDomains");
    expect(workflow).toContain("body?.mode !== 'verified_b2' || live !== 0");
    expect(workflow).toContain("body?.mode !== 'verified_b2_plus_live_observed' || live < 1");
    expect(workflow).toContain("['geopolitics','macro','rare_earth']");
    expect(workflow).toContain("row?.public_status === 'verified_b2'");
    expect(workflow).toContain("row?.public_status === 'live_observed'");
    expect(workflow).toContain("row?.severity !== null || row?.delta !== null");
    expect(workflow).toContain("body?.current_within_24h !== true");
    expect(workflow).toContain("responseNewest < expectedBatch");
    expect(workflow).toContain("newestLive < expectedBatch");
  });

  it("records only safe serving metadata when convergence fails", () => {
    expect(workflow).toContain("geomacro.intelligence-convergence-diagnostic.v2");
    expect(workflow).toContain("intelligence-convergence-diagnostics.jsonl");
    for (const marker of [
      "attempt",
      "http_status",
      "expected_current_source_batch_at",
      "live_observed_rows",
      "verified_rows",
      "newest_live_at",
      "scored_categories",
      "scored_current_across_all_domains",
      "expected_batch_visible",
      "cache_control",
      "cdn_cache_control",
      "cf_cache_status",
      "etag",
      "last_modified",
    ]) {
      expect(workflow).toContain(marker);
    }
  });

  it("does not serialize raw Intelligence rows into diagnostics", () => {
    const diagnosticStart = workflow.indexOf("const diagnostic = {");
    const diagnosticEnd = workflow.indexOf("console.log(JSON.stringify(diagnostic));", diagnosticStart);
    expect(diagnosticStart).toBeGreaterThan(-1);
    expect(diagnosticEnd).toBeGreaterThan(diagnosticStart);
    const diagnosticBlock = workflow.slice(diagnosticStart, diagnosticEnd);
    expect(diagnosticBlock).not.toMatch(/(?:^|\n)\s*rows\s*:/);
    expect(diagnosticBlock).not.toContain("source_title");
    expect(diagnosticBlock).not.toContain("source_url");
    expect(diagnosticBlock).not.toContain("source_name");
  });
});

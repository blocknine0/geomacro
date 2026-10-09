import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/source-evidence-graph-auto-promotion.yml", "utf8");
const aligner = readFileSync("scripts/ops/reconcile-production-source-certification.mjs", "utf8");

describe("#1827 production certification is not a frozen Supabase writer bypass", () => {
  it("enforces the actual canonical budget BEFORE reconciliation runs", () => {
    const guard = workflow.indexOf("Fail closed on frozen production budget before source writes");
    const writer = workflow.indexOf("run: node scripts/ops/reconcile-production-source-certification.mjs");
    expect(guard).toBeGreaterThan(0);
    expect(writer).toBeGreaterThan(guard);
    const state = workflow.slice(guard, writer);
    expect(state).toContain("public.geomacro_free_tier_budget_state()");
    expect(state).toContain("set -euo pipefail");
    expect(state).toContain('budget.mode !== "normal"');
    expect(state).toContain("budget.bulk_write_allowed !== true");
    expect(state).toContain("Number(budget.database_bytes) >= Number(budget.warn_bytes)");
    expect(state).toContain('code: "SOURCE_ALIGNMENT_SUPABASE_BUDGET_FROZEN"');
    expect(state).toContain("process.exit(78)");
    expect(state).not.toContain("console.log(state)");
  });

  it("guards a real direct-postgres mutator rather than a read-only audit", () => {
    expect(aligner).toContain("update public.live_source_certification_records");
    expect(aligner).toContain("summary.write_operations_performed = true");
    expect(workflow).not.toContain("on:\n  schedule:");
  });
});

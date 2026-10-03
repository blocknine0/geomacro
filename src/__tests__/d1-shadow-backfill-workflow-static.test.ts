import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/d1-shadow-backfill.yml", "utf8");

describe("D1 shadow backfill workflow", () => {
  it("parses Wrangler JSON structurally instead of grepping formatting", () => {
    expect(workflow).toContain("JSON.parse(s)");
    expect(workflow).toContain("Number(row?.version) === 1");
    expect(workflow).not.toContain("grep -q '\"version\":1'");
  });

  it("self-triggers parity after its migration implementation changes on canonical main", () => {
    expect(workflow).toContain("push:");
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain('".github/workflows/d1-shadow-backfill.yml"');
    expect(workflow).toContain('"scripts/ops/d1-shadow-backfill.mjs"');
    expect(workflow).toContain("github.event_name == 'push'");
  });

  it("refreshes D1 parity after a successful production freshness repair", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("- Phase A Runtime Freshness Repair");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
  });

  it("requires verified parity evidence only after the backfill succeeds", () => {
    expect(workflow).toContain("Run checksum-verified shadow backfill");
    expect(workflow).toContain("Require parity evidence before upload");
    expect(workflow).toContain("test -s artifacts/d1-shadow-backfill/verification-summary.json");
    expect(workflow).not.toContain("if: always()");
  });

  it("keeps the run shadow-only and non-destructive", () => {
    expect(workflow).toContain("Customer serving remains B2-authoritative");
    expect(workflow).toContain("Supabase is not deleted or disabled");
    expect(workflow).toContain("SUPABASE_DB_URL");
    expect(workflow).toContain("geomacro-control-plane");
  });
});

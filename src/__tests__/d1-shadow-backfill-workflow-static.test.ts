import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/d1-shadow-backfill.yml", "utf8");

describe("D1 shadow backfill workflow", () => {
  it("parses Wrangler JSON structurally instead of grepping formatting", () => {
    expect(workflow).toContain("JSON.parse(s)");
    expect(workflow).toContain("Number(row?.version) === 1");
    expect(workflow).not.toContain("grep -q '\"version\":1'");
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

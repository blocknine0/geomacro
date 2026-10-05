import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const audit = readFileSync("scripts/audit-gri-public-proof-consistency.mjs", "utf8");
const governance = readFileSync(".github/workflows/gri-governance.yml", "utf8");

describe("GRI direct-Postgres publication vs anon/RLS parity boundary", () => {
  it("does not convert an absent anon Data API credential into a direct-Postgres core publication failure", () => {
    expect(audit).toContain('String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres"');
    expect(audit).toContain('reason: "ANON_RLS_PARITY_REQUIRES_DATA_API"');
    expect(audit).toContain("corePublicationUnaffected: true");
    expect(audit).toContain("verified: null");
    expect(audit).toContain("skipped: true");
    expect(audit).toContain('if (!DIRECT_POSTGRES_MODE)');
    expect(audit).toContain("This artifact is not a parity pass");
    expect(audit).toContain("Strict parity remains mandatory in the dedicated GRI governance workflow");
  });

  it("retains strict anon/RLS parity in the dedicated governance workflow", () => {
    expect(governance).toContain("APP_SUPABASE_ANON_KEY: ${{ secrets.APP_SUPABASE_ANON_KEY }}");
    expect(governance).toContain("scripts/audit-gri-public-proof-consistency.mjs");
    expect(audit).toContain("anonSnapshotVisible");
    expect(audit).toContain("snapshotFieldParity");
    expect(audit).toContain("contributionMembershipParity");
    expect(audit).toContain("dispositionRowParity");
    expect(audit).toContain("validationRunParity");
    expect(audit).toContain("validationMetricParity");
  });
});

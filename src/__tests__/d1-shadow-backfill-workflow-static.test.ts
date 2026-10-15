import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/d1-shadow-backfill.yml", "utf8");
const historicalScript = readFileSync("scripts/ops/d1-shadow-backfill.mjs", "utf8");

describe("retired Supabase-to-D1 shadow copier", () => {
  it("has no unattended trigger or reachable Postgres migration job", () => {
    const triggers = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\npermissions:"));
    expect(triggers).toContain("workflow_dispatch: {}");
    expect(triggers).not.toMatch(/^  (?:push|schedule|workflow_run|repository_dispatch):/m);
    expect(workflow).toContain("  verified-shadow-backfill:\n    # Permanent retirement:");
    expect(workflow).toContain("    if: ${{ false }}");
    expect(workflow).not.toContain("github.event.workflow_run.conclusion");
  });

  it("preserves historical forensic checks without re-enabling the copier", () => {
    expect(workflow).toContain("Require D1 schema v2+ before copying anything");
    expect(workflow).toContain("Require parity evidence before upload");
    expect(historicalScript).toContain("SOURCE_STATE_PARITY_FAILED");
    expect(historicalScript).toContain("COUNTRY_DOMAIN_PARITY_FAILED");
    expect(historicalScript).toContain("record_sha256 must come from independently verified canonical/B2 artifact");
    expect(workflow).toContain("SUPABASE_DB_URL");
    expect(workflow).toContain("geomacro-control-plane");
  });

  it("keeps all current publication and proof work separate from the shadow copier", () => {
    const gri = readFileSync(".github/workflows/gri-v12-supabase-free-reviewed-current.yml", "utf8");
    const risk = readFileSync(".github/workflows/risk-indices-verified-d1-parent.yml", "utf8");
    const publicHealth = readFileSync("src/routes/api.health.ts", "utf8");
    expect(gri).toContain("publish-supabase-free-global-risk.mjs --verified-current");
    expect(risk).toContain("publish-risk-indices-from-verified-global-risk.mjs --verified-d1-parent-only");
    expect(publicHealth).not.toContain("d1-shadow-backfill.mjs");
    expect(publicHealth).toContain("status: deepReady ? 200 : 503");
  });
});

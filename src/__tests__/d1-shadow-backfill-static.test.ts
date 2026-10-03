import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/ops/d1-shadow-backfill.mjs", "utf8");
const workflow = readFileSync(".github/workflows/d1-shadow-backfill.yml", "utf8");

describe("D1 shadow backfill", () => {
  it("moves only compact source and country-domain state with checksum parity", () => {
    expect(script).toContain("live_source_certification_records");
    expect(script).toContain("live_country_category_coverage_matrix");
    expect(script).toContain("SOURCE_STATE_PARITY_FAILED");
    expect(script).toContain("COUNTRY_DOMAIN_PARITY_FAILED");
    expect(script).toContain("migration_cursor");
    expect(script).not.toContain('INSERT INTO geomacro_risk_objects');
    expect(script).not.toContain('INSERT INTO risk_object_index');
    expect(script).not.toContain("BEGIN;");
    expect(script).not.toContain("COMMIT;");
  });

  it("deliberately leaves GRO indexing blocked until canonical record hashes are independently available", () => {
    expect(script).toContain("record_sha256 must come from independently verified canonical/B2 artifact");
    expect(script).toContain('gro_index: { migrated: false');
  });

  it("runs automatically only after successful D1 bootstrap and never cuts over production", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("Deploy D1 Control Plane");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("Upload parity evidence only");
    expect(workflow).toContain("not a production cutover");
    expect(workflow).not.toContain("storage.objects");
    expect(workflow).not.toContain("Coinbase");
    expect(workflow).not.toContain("X-PAYMENT");
  });
});

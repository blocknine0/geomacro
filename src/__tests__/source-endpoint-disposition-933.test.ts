import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("permanent 933 endpoint disposition contract", () => {
  const migration = readFileSync(
    "supabase/migrations/069_permanent_endpoint_disposition_scope_fix.sql",
    "utf8",
  );
  const probe = readFileSync(
    "scripts/probe-production-source-endpoints-933.mjs",
    "utf8",
  );
  const importer = readFileSync(
    "scripts/import-source-endpoint-evidence.mjs",
    "utf8",
  );
  const workflow = readFileSync(
    ".github/workflows/source-network-933-endpoint-disposition.yml",
    "utf8",
  );

  it("pins Phase B to the canonical required 933-source universe", () => {
    expect(probe).toContain('expectedCount = Number(process.env.EXPECTED_ENDPOINT_COUNT ?? "933")');
    expect(probe).toContain("where u.required = true");
    expect(probe).toContain("required_observed_count");
    expect(probe).toContain("active_source_outside_required_count");
    expect(migration).toContain("required_source_count = 933");
    expect(migration).toContain("endpoint_disposition_933_complete");
  });

  it("keeps active operational additions visible and fail-closed", () => {
    expect(migration).toContain("live_active_source_endpoint_disposition_status");
    expect(migration).toContain("active_source_endpoint_disposition_complete");
    expect(workflow).toContain("live_active_source_endpoint_disposition_status");
    expect(workflow).toContain('test "${active_row##*|}" = "t"');
  });

  it("persists exact source-level endpoint evidence without promoting certification", () => {
    expect(importer).toContain("result.source_id");
    expect(importer).toContain("endpoint_disposition");
    expect(importer).toContain("endpoint_disposition_reason");
    expect(importer).toContain("Strict endpoint evidence import failed");
    expect(workflow).toContain("Import endpoint disposition evidence");
  });

  it("never treats endpoint reachability as commercial certification", () => {
    expect(migration).not.toContain("certification_state = 'CERTIFIED'");
    expect(importer).not.toMatch(/certification_state\s*:/);
  });
});

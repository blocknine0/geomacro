import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004173000_commercial_source_alignment_gate.sql",
  "utf8",
);
const updateBlock = migration.slice(
  migration.indexOf("update public.live_source_certification_records r"),
  migration.indexOf("create or replace view public.live_commercial_source_alignment_status"),
);

describe("#1414 commercial source alignment gate", () => {
  it("keeps inventory-only sources fail-closed instead of certifying or enabling them", () => {
    expect(updateBlock).toContain("r.certification_state = 'NOT_STARTED'");
    expect(updateBlock).toContain("s.enabled_for_ingestion = false");
    expect(updateBlock).toContain("s.enabled_for_commercial_signals = false");
    expect(updateBlock).toContain("certification_state = 'IN_REVIEW'");
    expect(updateBlock).toContain("'REVIEW_REQUIRED'");
    expect(updateBlock).not.toContain("enabled_for_commercial_signals = true");
    expect(updateBlock).not.toContain("enabled_for_ingestion = true");
    expect(updateBlock).not.toContain("certification_state = 'CERTIFIED'");
  });

  it("requires every paid-signal source to satisfy the full certified contract", () => {
    expect(migration).toContain("commercial_usage_status = 'COMMERCIAL_OK'");
    expect(migration).toContain("certification_state = 'CERTIFIED'");
    expect(migration).toContain("endpoint_status = 'PASS'");
    expect(migration).toContain("runtime_status in ('PASS', 'NOT_APPLICABLE')");
    expect(migration).toContain("fallback_status in ('READY', 'NOT_REQUIRED')");
    expect(migration).toContain("unsafe_commercial_signal_rows = 0");
  });

  it("fails launch alignment on implicit or untested active-source state", () => {
    expect(migration).toContain("implicit_lifecycle_rows = 0");
    expect(migration).toContain("unreviewed_rights_rows = 0");
    expect(migration).toContain("active_untested_rows = 0");
    expect(migration).toContain("commercial_source_alignment_complete");
  });
});

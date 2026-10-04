import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004163654_align_country_coverage_with_source_native_readiness.sql",
  "utf8",
);
const refresher = readFileSync(
  "scripts/ops/refresh-gdelt-coverage-runtime-after-b2.mjs",
  "utf8",
);
const wrapper = readFileSync(
  "scripts/ops/run-b2-public-intelligence-publisher.mjs",
  "utf8",
);

describe("source-native three-domain coverage readiness", () => {
  it("binds every domain to the exact certified commercial launch source", () => {
    expect(migration).toContain("'gdelt_v2_events'::text");
    expect(migration).toContain("'world_bank_indicators'::text");
    expect(migration).toContain("'usgs_mcs'::text");
    expect(migration).toContain("t.source_id = m.required_source_id");
    expect(migration).toContain("t.target_id = m.target_prefix || m.iso3");
    expect(migration).toContain("source.enabled_for_ingestion = true");
    expect(migration).toContain("source.enabled_for_commercial_signals = true");
  });

  it("uses the already-governed currentness windows instead of the obsolete category TTLs", () => {
    expect(migration).toContain("7200::bigint");
    expect(migration).toContain("86400::bigint");
    expect(migration).not.toContain("1800::bigint");
    expect(migration).not.toContain("14400::bigint");
    expect(migration).toContain("without rewriting the underlying source-data date");
  });

  it("refreshes GDELT control-plane success only from a fresh verified B2 proof", () => {
    expect(refresher).toContain('PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json"');
    expect(refresher).toContain("PROOF_MAX_AGE_MS = 30 * 60 * 1000");
    expect(refresher).toContain("GDELT_BATCH_MAX_AGE_MS = 2 * 60 * 60 * 1000");
    expect(refresher).toContain("CONTROL_REFRESH_MIN_AGE_MS = 90 * 60 * 1000");
    expect(refresher).toContain("full_b2_readback_verified !== true");
    expect(refresher).toContain("exact_gzip_restore_verified !== true");
    expect(refresher).toContain("synthetic_score !== false");
    expect(refresher).toContain("GDELT_COVERAGE_TARGET_CENSUS_INVALID");
    expect(refresher).toContain("GDELT_COVERAGE_REFRESH_COUNT_MISMATCH");
  });

  it("runs the coverage refresh only after the public Intelligence publisher succeeds", () => {
    const publisherSuccess = wrapper.indexOf("if (result.status === 0)");
    const refreshRun = wrapper.indexOf("spawnSync(\"bun\", [COVERAGE_REFRESHER]");
    expect(publisherSuccess).toBeGreaterThan(-1);
    expect(refreshRun).toBeGreaterThan(publisherSuccess);
    expect(wrapper).toContain("GDELT_COVERAGE_RUNTIME_REFRESH_FAILED");
    expect(wrapper).toContain("coverage_runtime_refreshed: true");
  });

  it("keeps the migration security-invoker and service-role-only contract", () => {
    expect(migration).toContain("with (security_invoker=true)");
    expect(migration).toContain("grant select on public.live_country_category_coverage_matrix to service_role");
    expect(migration).not.toContain("grant select on public.live_country_category_coverage_matrix to anon");
    expect(migration).not.toContain("grant select on public.live_country_category_coverage_matrix to authenticated");
  });
});

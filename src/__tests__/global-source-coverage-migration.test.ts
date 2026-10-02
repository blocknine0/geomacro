import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/0431_global_source_coverage_expansion.sql",
  "utf8",
);
const coverageContract = readFileSync(
  "supabase/migrations/055_global_coverage_contract.sql",
  "utf8",
);
const phaseAGlobalCoverage = [
  "supabase/migrations/20261002083529_phase_a_global_coverage_matrix.sql",
  "supabase/migrations/20261002083546_phase_a_dynamic_raw_source_status.sql",
  "supabase/migrations/20261002083621_phase_a_restrict_coverage_views.sql",
]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const databaseSchemaSafetyWorkflow = readFileSync(
  ".github/workflows/database-schema-safety.yml",
  "utf8",
);
const globalCoverageAudit = readFileSync(
  "scripts/audit-global-production-coverage.mjs",
  "utf8",
);

describe("global source coverage migration integrity", () => {
  it("preserves the prior source-universe status column contract", () => {
    const sourceUniverseHandoff = readFileSync(
      "supabase/migrations/059_source_universe_certification_handoff.sql",
      "utf8",
    );
    expect(sourceUniverseHandoff).toContain(
      "21::bigint country_sources_per_subject",
    );
    expect(sourceUniverseHandoff).toContain(
      "countries.n*21::bigint expected_country_source_rows",
    );
    expect(sourceUniverseHandoff).not.toContain(
      "backbone_sources_per_country",
    );
    expect(sourceUniverseHandoff).not.toContain(
      "backbone_expected_country_source_rows",
    );
  });

  it("binds the 059 source-universe status view to every CTE source", () => {
    const sourceUniverseHandoff = readFileSync(
      "supabase/migrations/059_source_universe_certification_handoff.sql",
      "utf8",
    );
    expect(sourceUniverseHandoff).toContain("from countries");
    expect(sourceUniverseHandoff).toContain("cross join country_stats_paths");
  });

  it("binds the 058 statistics directory status view to its directory table", () => {
    const statisticsDirectory = readFileSync(
      "supabase/migrations/058_country_statistics_office_directory.sql",
      "utf8",
    );
    expect(statisticsDirectory).toContain(
      "from public.live_country_statistics_source_directory;",
    );
  });

  it("binds the 057 government portal status view to its directory table", () => {
    const governmentPortals = readFileSync(
      "supabase/migrations/057_country_primary_government_portals.sql",
      "utf8",
    );
    expect(governmentPortals).toContain(
      "from public.live_country_primary_source_directory;",
    );
  });

  it("keeps the 057 government portal seed column count aligned", () => {
    const governmentPortals = readFileSync(
      "supabase/migrations/057_country_primary_government_portals.sql",
      "utf8",
    );
    expect(governmentPortals).toContain(
      "(country_iso2,country_name,government_portal_url)\nvalues",
    );
    expect(governmentPortals).not.toContain(
      "(country_iso2,country_name,government_portal_url,notes)\nvalues",
    );
  });

  it("binds every source-universe status CTE into the final view", () => {
    const sourceUniverse = readFileSync(
      "supabase/migrations/056_global_source_universe_expansion.sql",
      "utf8",
    );
    expect(sourceUniverse).toContain("from countries");
    expect(sourceUniverse).toContain("cross join shock_min");
  });

  it("keeps the seven mandatory global backbone coverage keys unique", () => {
    const expectedKeys = [
      "GEOPOLITICS|GLOBAL|GLOBAL|GLOBAL_AGGREGATOR",
      "GEOPOLITICS|GLOBAL|GLOBAL|INTERNATIONAL_PRIMARY",
      "MACRO|GLOBAL|GLOBAL|STRUCTURED_DATA",
      "MACRO|GLOBAL|GLOBAL|INTERNATIONAL_PRIMARY",
      "CRITICAL_MINERALS|GLOBAL|GLOBAL|STRUCTURED_DATA",
      "CRITICAL_MINERALS|GLOBAL|GLOBAL|INTERNATIONAL_PRIMARY",
      "CRITICAL_MINERALS|GLOBAL|GLOBAL|SPECIALIST_INDUSTRY",
    ];

    expect(new Set(expectedKeys).size).toBe(expectedKeys.length);

    expect(migration).toContain(
      "'geo-global-aggregator','GEOPOLITICS','GLOBAL','GLOBAL','GLOBAL_AGGREGATOR'",
    );
    expect(migration).toContain(
      "'geo-un-primary','GEOPOLITICS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY'",
    );
    expect(migration).toContain(
      "'macro-wb-structured','MACRO','GLOBAL','GLOBAL','STRUCTURED_DATA'",
    );
    expect(migration).toContain(
      "'macro-bis-structured','MACRO','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY'",
    );
    expect(migration).toContain(
      "'minerals-usgs','CRITICAL_MINERALS','GLOBAL','GLOBAL','STRUCTURED_DATA'",
    );
    expect(migration).toContain(
      "'minerals-trade','CRITICAL_MINERALS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY'",
    );
    expect(migration).toContain(
      "'minerals-policy','CRITICAL_MINERALS','GLOBAL','GLOBAL','SPECIALIST_INDUSTRY'",
    );
  });

  it("binds every design-status CTE into the final view", () => {
    expect(coverageContract).toContain("from country_counts cc");
    expect(coverageContract).toContain("cross join domain_counts dc");
    expect(coverageContract).toContain("cross join queue_counts qc");
  });

  it("makes shock queue keys unique across multi-module shock mappings", () => {
    expect(coverageContract).toContain(
      "'SHOCK:' || s.shock_id || ':' || m.module_id || ':PRIMARY:' || s.primary_source_id",
    );
    expect(coverageContract).toContain(
      "'SHOCK:' || s.shock_id || ':' || m.module_id || ':FALLBACK:' || s.fallback_source_id",
    );
    expect(coverageContract).not.toContain(
      "'SHOCK:' || s.shock_id || ':PRIMARY:' || s.primary_source_id",
    );
    expect(coverageContract).not.toContain(
      "'SHOCK:' || s.shock_id || ':FALLBACK:' || s.fallback_source_id",
    );
  });

  it("keeps trade data distinct from the global structured-data backbone", () => {
    expect(migration).toContain(
      "'minerals-trade','CRITICAL_MINERALS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY'",
    );
    expect(migration).not.toContain(
      "'minerals-trade','CRITICAL_MINERALS','GLOBAL','GLOBAL','STRUCTURED_DATA'",
    );
  });
});

describe("Phase A global coverage engine", () => {
  it("matches the production migration versions and keeps zero replay explicit", () => {
    expect(phaseAGlobalCoverage).toContain(
      "create or replace view public.live_country_category_coverage_matrix",
    );
    expect(databaseSchemaSafetyWorkflow).toContain(
      "20261002083500_phase_a_zero_replay_substrate.sql",
    );
    expect(databaseSchemaSafetyWorkflow).toContain(
      "create table if not exists public.live_raw_source_targets",
    );
    expect(databaseSchemaSafetyWorkflow).toContain(
      "PASS: injected CI-only Phase A substrate before production-exact migration versions",
    );
  });

  it("derives the matrix denominator from the enabled canonical registry", () => {
    expect(phaseAGlobalCoverage).toContain(
      "from public.live_country_registry r\n  cross join category_contract c\n  where r.enabled = true",
    );
    expect(phaseAGlobalCoverage).toContain(
      "(registry.enabled_country_count * 3)::bigint as expected_matrix_rows",
    );
    expect(phaseAGlobalCoverage).not.toMatch(/=\s*19[45]\b/);
  });

  it("locks exactly the three canonical domains while preserving source-category compatibility", () => {
    expect(phaseAGlobalCoverage).toContain(
      "('geopolitics'::text, 'GEOPOLITICS'::text, 1800::bigint)",
    );
    expect(phaseAGlobalCoverage).toContain(
      "('macro'::text, 'MACRO'::text, 7200::bigint)",
    );
    expect(phaseAGlobalCoverage).toContain(
      "('rare_earth'::text, 'CRITICAL_MINERALS'::text, 14400::bigint)",
    );
    expect(globalCoverageAudit).toContain(
      'const PHASE_A_DOMAINS = ["geopolitics", "macro", "rare_earth"]',
    );
  });

  it("fails closed unless fresh runtime has a fully certified path", () => {
    for (const clause of [
      "cert.certification_state = 'CERTIFIED'",
      "cert.endpoint_status = 'PASS'",
      "cert.rights_status in ('COMMERCIAL_OK','DERIVED_ONLY')",
      "cert.schema_status in ('PASS','NOT_APPLICABLE')",
      "cert.freshness_status in ('FRESH','VARIABLE','NOT_APPLICABLE')",
      "cert.provenance_status in ('PASS','NOT_APPLICABLE')",
      "cert.independence_status in ('PASS','NOT_APPLICABLE')",
      "cert.adapter_status in ('TESTED','NOT_APPLICABLE')",
      "cert.runtime_status in ('PASS','NOT_APPLICABLE')",
      "cert.fallback_status in ('READY','NOT_REQUIRED')",
    ]) {
      expect(phaseAGlobalCoverage).toContain(clause);
    }
    expect(phaseAGlobalCoverage).toContain(
      "fresh_target_count > 0 and certified_fresh_runtime_path_count > 0",
    );
  });

  it("makes missing reasons and certified fallback eligibility explicit", () => {
    expect(phaseAGlobalCoverage).toContain(
      "PRIMARY_RUNTIME_NOT_READY_CERTIFIED_FALLBACK_AVAILABLE",
    );
    expect(phaseAGlobalCoverage).toContain("NO_ENABLED_TARGET");
    expect(phaseAGlobalCoverage).toContain("NO_SUCCESSFUL_RUNTIME_OBSERVATION");
    expect(phaseAGlobalCoverage).toContain("LATEST_RUNTIME_OBSERVATION_STALE");
    expect(phaseAGlobalCoverage).toContain("NO_CERTIFIED_FRESH_RUNTIME_PATH");
    expect(globalCoverageAudit).toContain("phaseANonreadyMissingReason.length === 0");
    expect(globalCoverageAudit).toContain("phaseAInvalidFallback.length === 0");
    expect(globalCoverageAudit).toContain("phaseAInvalidReady.length === 0");
  });

  it("keeps the Phase A matrix internal and payment-neutral", () => {
    expect(phaseAGlobalCoverage).toContain(
      "revoke all on public.live_country_category_coverage_matrix from public, anon, authenticated;",
    );
    expect(phaseAGlobalCoverage).toContain(
      "grant select on public.live_country_category_coverage_matrix to service_role;",
    );
    expect(globalCoverageAudit).toContain(
      '"no_payment_or_settlement_is_enabled_by_this_audit": true',
    );
  });
});

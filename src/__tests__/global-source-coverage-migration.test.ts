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

describe("global source coverage migration integrity", () => {
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

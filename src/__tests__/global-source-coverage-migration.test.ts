import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/043_global_source_coverage_expansion.sql",
  "utf8",
);

describe("global source coverage migration integrity", () => {
  it("does not feed duplicate unique coverage keys to ON CONFLICT DO UPDATE", () => {
    const tuples = [...migration.matchAll(
      /\(\s*'[^']+'\s*,\s*'(GEOPOLITICS|MACRO|CRITICAL_MINERALS)'\s*,\s*'(GLOBAL|REGION|COUNTRY|CORRIDOR|COMMODITY)'\s*,\s*'[^']+'\s*,\s*'(GLOBAL_AGGREGATOR|INTERNATIONAL_PRIMARY|REGIONAL_PRIMARY|COUNTRY_PRIMARY|INDEPENDENT_MEDIA|SPECIALIST_INDUSTRY|STRUCTURED_DATA)'/g,
    )].map((m) => m.slice(1).join("|"));

    expect(new Set(tuples).size).toBe(tuples.length);
  });

  it("keeps trade data distinct from the global structured-data backbone", () => {
    expect(migration).toContain(
      "'minerals-trade','CRITICAL_MINERALS','GLOBAL','GLOBAL','INTERNATIONAL_PRIMARY'",
    );
  });
});

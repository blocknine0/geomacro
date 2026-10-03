import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const adapter = read("global-intelligence/adapters/historical-data.mjs");
const workflow = read(".github/workflows/historical-data-connection.yml");

describe("historical data runtime adapter", () => {
  it("uses the governed macro and rare-earth interfaces with schema-valid ordering", () => {
    expect(adapter).toContain('macro: "commercial_historical_macro_observations"');
    expect(adapter).toContain('macro: "observation_year.desc,retrieved_at.desc"');
    expect(adapter).toContain('rareEarth: "rare_earth_canonical_observations"');
    expect(adapter).toContain('rareEarth: "observation_year.desc,last_seen_at.desc"');
    expect(adapter).toContain('geopolitical: "observed_at.desc.nullslast,retrieved_at.desc"');
    expect(adapter).not.toContain('macro: "commercial_macro_observations"');
  });

  it("keeps the historical service role server-only and probes all three domains", () => {
    expect(adapter).toContain('requireEnv("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY")');
    expect(adapter).not.toContain("VITE_HISTORICAL_");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.HISTORICAL_SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).toContain('.geopolitics.status == "PASS"');
    expect(workflow).toContain('.macro.status == "PASS"');
    expect(workflow).toContain('.rare_earths.status == "PASS"');
  });

  it("keeps rare-earth source-level redistribution behind an explicit rights gate", () => {
    expect(adapter).toContain("rare_earth_source_level_redistribution_without_rights_gate");
    expect(adapter).toContain("source_terms_review_required: true");
  });
});

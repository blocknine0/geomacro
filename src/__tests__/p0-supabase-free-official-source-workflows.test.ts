import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("USGS and Eurostat legacy Postgres independence", () => {
  it("USGS cannot initialize a frozen database for official read-only observations", () => {
    const source = read("scripts/ingest-usgs-earthquake-hazards-live.mjs");
    const workflow = read(".github/workflows/usgs-earthquake-hazards-sync.yml");
    expect(source).toContain("const db = WRITE ? createDb() : null");
    expect(source).toContain("commercial_usage_status: \"NOT_ASSESSED_READ_ONLY\"");
    expect(source).toContain("if (WRITE) assertWriteGovernance(sourceRegistration)");
    expect(source).toContain('countryIso3: null');
    expect(source).toContain('risk_gate_signal_activation: false');
    expect(workflow).toContain("  dry-run:");
    expect(workflow).toContain("  sync:\n    # Original USGS dry-run contract remains testable; Supabase write lane frozen.\n    if: ${{ false }}");
    const active = workflow.slice(workflow.indexOf("  dry-run:"), workflow.indexOf("  sync:"));
    expect(active).not.toContain("secrets.SUPABASE");
    expect(active).not.toContain("direct_postgres");
    expect(active).toContain("SUPABASE_DB_URL: \"\"");
    expect(active).toContain("bun scripts/ingest-usgs-earthquake-hazards-live.mjs");
  });

  it("Eurostat normalizes quarterly fiscal observations against the canonical 195-country registry", () => {
    const source = read("scripts/ingest-eurostat-government-debt-live.mjs");
    const workflow = read(".github/workflows/eurostat-government-debt-sync.yml");
    expect(source).toContain('canonical-country-registry-195.ts');
    expect(source).toContain('const registry = WRITE ? await loadCountryRegistry(db) : offlineCountryRegistry()');
    expect(source).toContain('const db = WRITE ? createDb() : null');
    expect(source).toContain('publishedAt: null');
    expect(source).toContain('direct_merge_with_world_bank_central_government_debt_allowed: false');
    expect(source).toContain('commercial_usage_status: "NOT_ASSESSED_READ_ONLY"');
    expect(workflow).toContain("  sync:\n    # Permanent no-Supabase production hold.");
    expect(workflow).toContain("    if: ${{ false }}");
    const active = workflow.slice(workflow.indexOf("  dry-run:"), workflow.indexOf("  sync:"));
    expect(active).not.toContain("secrets.SUPABASE");
    expect(active).not.toContain("direct_postgres");
    expect(active).toContain("bun scripts/ingest-eurostat-government-debt-live.mjs");
  });
});

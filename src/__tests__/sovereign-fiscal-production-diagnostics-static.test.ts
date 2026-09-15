import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("sovereign-fiscal production diagnostics", () => {
  it("is read-only and preserves fixed methodology boundaries", () => {
    const script = read("scripts/audit-sovereign-fiscal-production-diagnostics.ts");
    expect(script).toContain('writes_performed: false');
    expect(script).toContain('source_thresholds_changed: false');
    expect(script).toContain('freshness_thresholds_changed: false');
    expect(script).toContain('debt_concepts_merged: false');
    expect(script).toContain('fixed_peer_minimum: 20');
    expect(script).not.toContain('.insert(');
    expect(script).not.toContain('.update(');
    expect(script).not.toContain('.upsert(');
    expect(script).not.toContain('.delete(');
  });

  it("probes the governed WDI and Eurostat production adapters without making countries payable", () => {
    const script = read("scripts/audit-sovereign-fiscal-production-diagnostics.ts");
    expect(script).toContain("generateRiskGateV2EurostatSovereignFiscalModuleState");
    expect(script).toContain("generateCountryRiskGateV2WdiMacroModuleStates");
    expect(script).toContain("live_eurostat_government_debt_latest");
    expect(script).toContain("live_world_bank_indicator_latest");
    expect(script).toContain("no_country_is_marked_payable_by_this_report: true");
  });

  it("runs only against the authoritative production credential boundary", () => {
    const workflow = read(".github/workflows/sovereign-fiscal-production-diagnostics.yml");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("APP_SUPABASE_URL");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("assert-authoritative-supabase.mjs");
    expect(workflow).toContain("sovereign-fiscal-production-diagnostics.json");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const census = readFileSync("scripts/global-risk-gate-country-census.ts", "utf8");
const workflow = readFileSync(
  ".github/workflows/global-country-readiness-audit.yml",
  "utf8",
);

describe("global Risk Gate country census diagnostics", () => {
  it("isolates module generation failures instead of collapsing all modules", () => {
    expect(census).toContain("Promise.allSettled");
    expect(census).toContain("module_errors");
    expect(census).toContain("module_ready_country_counts");
    expect(census).toContain("module_error_country_counts");
    expect(census).toContain("missing_country_iso3_by_module");
    expect(census).toContain("unverified_country_iso3_by_module");
    expect(census).toContain("module_error_reason_counts");
    expect(census).toContain("moduleErrors.geopolitical_security");
    expect(census).toContain("moduleErrors.political_governance");
    expect(census).toContain("moduleErrors.sovereign_fiscal");
    expect(census).toContain("moduleErrors.macro_monetary");
  });

  it("reports only safe governed WDI registry state", () => {
    expect(census).toContain('WORLD_BANK_SOURCE_ID = "world_bank_indicators"');
    expect(census).toContain("commercial_usage_status");
    expect(census).toContain("enabled_for_ingestion");
    expect(census).toContain("enabled_for_commercial_signals");
    expect(census).toContain("raw_redistribution_allowed");
    expect(census).toContain("attribution_required");
    expect(census).not.toContain('select("base_url');
    expect(census).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(census).not.toContain('"raw_payload"');
  });

  it("keeps the audit fail-closed and updates the versioned report contract", () => {
    expect(census).toContain('schema_version: "geomacro-global-risk-gate-country-census-2.2"');
    expect(census).toContain("missing_or_unverified_input_fails_closed: true");
    expect(census).toContain("execution_authorized_is_false: true");
    expect(workflow).toContain("geomacro-global-risk-gate-country-census-2.2");
    expect(workflow).toContain("source_state_diagnostics_exclude_credentials_and_raw_payloads");
  });

  it("continuously captures sanitized geopolitical blockers with the country readiness audit", () => {
    expect(workflow).toContain("audit-geopolitical-production-diagnostics.ts");
    expect(workflow).toContain("geomacro-geopolitical-production-diagnostics-1.0");
    expect(workflow).toContain("raw_event_material_included == false");
    expect(workflow).toContain("event_text_or_publisher_material_redistributed == false");
    expect(workflow).toContain("source_rights_changed == false");
    expect(workflow).toContain("scoring_changed == false");
    expect(workflow).toContain("/tmp/geopolitical-production-diagnostics.json");
  });
});

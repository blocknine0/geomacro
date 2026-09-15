import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  join(process.cwd(), "scripts/audit-geopolitical-production-diagnostics.ts"),
  "utf8",
);
const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/geopolitical-production-diagnostics.yml"),
  "utf8",
);

describe("geopolitical production diagnostics", () => {
  it("reads the governed UCDP and WDI inputs used by the real module", () => {
    expect(script).toContain('const UCDP_SOURCE_ID = "ucdp_candidate"');
    expect(script).toContain('const WDI_SOURCE_ID = "world_bank_indicators"');
    expect(script).toContain('const POPULATION_METRIC = "population_total"');
    expect(script).toContain('"live_ucdp_candidate_latest"');
    expect(script).toContain('"live_world_bank_indicator_latest"');
    expect(script).toContain('"live_source_release_manifests"');
    expect(script).toContain("generateRiskGateV2GeopoliticalSecurityModuleState");
  });

  it("classifies sovereigns without weakening the live methodology", () => {
    expect(script).toContain('classifyGlobalEntity(row.iso3) === "SOVEREIGN"');
    expect(script).toContain("RISK_GATE_V2_CONFLICT_LOOKBACK_DAYS");
    expect(script).toContain("RISK_GATE_V2_CONFLICT_SOURCE_MAX_AGE_DAYS");
    expect(script).toContain("RISK_GATE_V2_CONFLICT_MIN_PEERS");
    expect(script).toContain("thresholds_changed: false");
    expect(script).toContain("freshness_changed: false");
    expect(script).toContain("commercial_eligibility_relaxed: false");
  });

  it("preserves the country-level fail-closed event quality and rights boundary", () => {
    expect(script).toContain('row.quality_status === "VERIFIED"');
    expect(script).toContain('row.commercial_eligibility_status === "VERIFIED"');
    expect(script).toContain('BLOCKED_EVENT_QUALITY_OR_COMMERCIAL_ELIGIBILITY');
    expect(script).toContain("any_ineligible_or_unverified_release_row_for_a_country_remains_fail_closed: true");
  });

  it("produces sanitized aggregate evidence and no raw event payload", () => {
    expect(script).toContain("raw_event_material_included: false");
    expect(script).toContain("event_text_or_publisher_material_redistributed: false");
    expect(script).not.toMatch(/\.insert\s*\(/);
    expect(script).not.toMatch(/\.update\s*\(/);
    expect(script).not.toMatch(/\.upsert\s*\(/);
    expect(script).not.toMatch(/\.delete\s*\(/);
  });

  it("runs production reads only after exact project identity validation", () => {
    expect(workflow).toContain("EXPECTED_SUPABASE_PROJECT_REF: ldpwajisioljyjtojvfx");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("authoritative production API identity confirmed");
    expect(workflow).toContain("writes_performed == false");
    expect(workflow).toContain("raw_event_material_included == false");
    expect(workflow).toContain("geopolitical-production-diagnostics");
  });

  it("does not touch payment or mainnet activation", () => {
    expect(script).not.toContain("COINBASE_X402");
    expect(workflow).not.toContain("COINBASE_X402");
    expect(workflow).not.toContain("I_ACCEPT_REAL_USDC");
  });
});

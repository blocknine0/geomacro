import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/ingest-gdelt-v2-events-live.mjs", "utf8");
const workflow = readFileSync(".github/workflows/gdelt-v2-event-sync.yml", "utf8");

describe("GDELT V2 certified runtime governance", () => {
  it("requires the current certified commercial source contract before writes", () => {
    expect(script).toContain('source.enabled_for_commercial_signals === true');
    expect(script).toContain('certification.certification_state === "CERTIFIED"');
    expect(script).toContain('certification.endpoint_status === "PASS"');
    expect(script).toContain('["COMMERCIAL_OK", "DERIVED_ONLY"].includes(certification.rights_status)');
    expect(script).toContain('["PASS", "NOT_APPLICABLE"].includes(certification.schema_status)');
    expect(script).toContain('["FRESH", "NOT_APPLICABLE"].includes(certification.freshness_status)');
    expect(script).toContain('["PASS", "NOT_APPLICABLE"].includes(certification.provenance_status)');
    expect(script).toContain('["PASS", "NOT_APPLICABLE"].includes(certification.independence_status)');
    expect(script).toContain('["TESTED", "NOT_APPLICABLE"].includes(certification.adapter_status)');
    expect(script).toContain('["PASS", "NOT_APPLICABLE"].includes(certification.runtime_status)');
    expect(script).toContain('["READY", "NOT_REQUIRED"].includes(certification.fallback_status)');
    expect(script).toContain("GDELT_WRITE_GOVERNANCE_CERTIFICATION_INVALID");
  });

  it("keeps GDELT as governed evidence rather than a direct Risk Gate bypass", () => {
    expect(script).toContain('risk_gate_signal_activation: false');
    expect(script).toContain("NEWS_DERIVED_FRESHNESS_EVIDENCE_OVERLAY_NOT_AUTHORITATIVE_CONFLICT_REPLACEMENT");
    expect(script).toContain("OFFICIAL_GDELT_FIPS_LOOKUP_TO_CANONICAL_COUNTRY_REGISTRY");
    expect(script).toContain("EXPECTED_COLUMN_COUNT = 61");
  });

  it("validates the same certification boundary in the manual production workflow", () => {
    expect(workflow).toContain("live_source_certification_records");
    expect(workflow).toContain("COMMERCIAL_OK|true|true|CERTIFIED|COMMERCIAL_OK|PASS|PASS|FRESH|PASS|PASS|TESTED|PASS|READY");
    expect(workflow).toContain("source_certification_required");
    expect(workflow).toContain("risk_gate_signal_activation");
  });
});

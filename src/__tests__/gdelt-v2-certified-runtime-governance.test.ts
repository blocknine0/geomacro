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

  it("uses only B2 + D1 and never executes the retired Supabase-only GDELT writer", () => {
    expect(workflow).toContain("publish-risk-gate-gdelt-wide-net.mjs");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('B2_REQUEST_BUDGET: "4"');
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(workflow).toContain("GDELT ZIP, B2 full readback then D1 PUT+GET");
    expect(workflow).not.toContain("scripts/ingest-gdelt-v2-events-live.mjs");
    expect(workflow).not.toContain("SUPABASE_DB_URL");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("SUPABASE_URL");
  });
});

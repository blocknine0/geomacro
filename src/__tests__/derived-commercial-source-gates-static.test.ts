import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261006173500_open_derived_commercial_rights_gate.sql",
  "utf8",
);

describe("derived-commercial source rights gate", () => {
  it("opens only the reviewed derived-commercial rights boundary", () => {
    expect(migration).toContain("source_id = 'iea_critical_minerals_2026_dataset'");
    expect(migration).toContain("source_id = 'eia_api_v2'");
    expect(migration).toContain("source_id = 'gdacs_global_disasters'");
    expect(migration).toContain("commercial_usage_status = 'COMMERCIAL_OK'");
    expect(migration).toContain("commercial_usage_status = 'DERIVED_ONLY'");
    expect(migration).toContain("rights_status = 'COMMERCIAL_OK'");
    expect(migration).toContain("rights_status = 'DERIVED_ONLY'");
  });

  it("never opens raw redistribution", () => {
    expect(migration).toContain("raw_redistribution_allowed = false");
    expect(migration).not.toContain("raw_redistribution_allowed = true");
  });

  it("keeps technical commercial activation fail-closed", () => {
    for (const marker of [
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
      expect(migration).toContain(marker);
    }
  });

  it("keeps permission/review-bound sources commercially disabled", () => {
    for (const source of [
      "un_comtrade",
      "un_comtrade_api",
      "wto_timeseries",
      "wto_critical_minerals_dataset",
      "reliefweb",
      "reliefweb_reports_api",
    ]) {
      expect(migration).toContain(`'${source}'`);
    }
    expect(migration).toContain("enabled_for_commercial_signals = false");
  });
});

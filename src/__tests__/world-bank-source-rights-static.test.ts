import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  new URL("../../scripts/ingest-world-bank-live.mjs", import.meta.url),
  "utf8",
);
const policy = readFileSync(
  new URL("../../scripts/commercial-source-policy.mjs", import.meta.url),
  "utf8",
);
const operationalMigration = readFileSync(
  new URL(
    "../../supabase/migrations/025_external_source_operational_status.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("World Bank live commercial source contract", () => {
  it("pins the Indicators API to World Development Indicators source 2", () => {
    expect(adapter).toContain('WORLD_BANK_API_SOURCE_ID =\n  "2"');
    expect(adapter).toContain("source=${WORLD_BANK_API_SOURCE_ID}");
    expect(adapter).toContain('"World Development Indicators"');
  });

  it("persists dataset-level licence provenance and source identity", () => {
    expect(adapter).toContain("world_bank_api_source_id:");
    expect(adapter).toContain("licence_reference:");
    expect(adapter).toContain('"CC BY 4.0"');
    expect(adapter).toContain("WORLD_BANK_DATASET_TERMS_URL");
    expect(adapter).toContain(
      "`${WORLD_BANK_API_SOURCE_ID}:${indicator.id}:${iso3}:${year}`",
    );
  });

  it("routes WDI commercial eligibility through the reviewed source policy", () => {
    expect(policy).toContain("world_bank_indicators:");
    expect(policy).toContain('allowed_statuses: Object.freeze(["VERIFIED"])');
    expect(adapter).toContain("assertCommercialEligibilityAllowed");
    expect(adapter).toContain("COMMERCIAL_ELIGIBILITY_STATUS");
    expect(adapter).toContain(
      "commercial_eligibility_status:\n        COMMERCIAL_ELIGIBILITY_STATUS",
    );
    expect(adapter).not.toContain(
      'commercial_eligibility_status: "VERIFIED"',
    );
  });

  it("keeps operational enablement controlled by reviewed source status", () => {
    expect(operationalMigration).toContain("'world_bank_indicators'");
    expect(operationalMigration).toContain("'unhcr_refugee_statistics'");
    expect(operationalMigration).toContain("'usgs_mcs'");
    expect(operationalMigration).toContain("enabled_for_commercial_signals = false");
  });
});

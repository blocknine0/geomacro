import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const certificationMigration = readFileSync("supabase/migrations/065_source_certification_execution_layer.sql","utf8");
const freshnessMigration = readFileSync("supabase/migrations/066_source_network_realtime_freshness.sql","utf8");
const readinessServer = readFileSync("src/lib/risk-gate-readiness.server.ts","utf8");

describe("commercial source-network launch gate", () => {
  it("requires all source evidence dimensions before CERTIFIED", () => {
    for (const field of ["endpoint_status","rights_status","schema_status","freshness_status","provenance_status","independence_status","adapter_status","runtime_status","fallback_status","certification_hash"]) {
      expect(certificationMigration).toContain(field);
    }
    expect(certificationMigration).toContain("certification_state = 'CERTIFIED'");
    expect(certificationMigration).toContain("source_network_100_complete");
  });

  it("keeps realtime readiness separate and fail-closed at the GDELT 30-minute ceiling", () => {
    expect(freshnessMigration).toContain("source_key = 'gdelt_gal'");
    expect(freshnessMigration).toContain("stream_key = 'global-relevant'");
    expect(freshnessMigration).toContain("1800");
    expect(freshnessMigration).toContain("source_network_launch_complete");
  });

  it("binds Risk Gate readiness reporting to the combined source-network launch view", () => {
    expect(readinessServer).toContain("live_source_network_launch_status");
    expect(readinessServer).toContain("source_network_100_complete");
    expect(readinessServer).toContain("realtime_source_freshness");
  });
});

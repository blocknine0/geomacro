import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repair = readFileSync(
  "supabase/migrations/20261001053500_repair_wgi_commercial_rights_runtime_parity.sql",
  "utf8",
);

const original = readFileSync(
  "supabase/migrations/936_commercial_source_rights_runtime_parity.sql",
  "utf8",
);

describe("WGI commercial-rights parity repair", () => {
  it("restores only the already-reviewed WGI runtime contract", () => {
    expect(repair).toContain("world_bank_wgi_political_stability");
    expect(repair).toContain("raw_redistribution_allowed = true");
    expect(repair).toContain("commercial_usage_status = 'COMMERCIAL_OK'");
    expect(repair).toContain("attribution_required = true");
    expect(repair).toContain("enabled_for_ingestion = true");
    expect(repair).toContain("enabled_for_commercial_signals = true");
    expect(repair).toContain("separately identifiable proprietary upstream perception-source material");
    expect(original).toContain("raw_redistribution_allowed = true");
  });

  it("keeps the USGS MCS derived-only boundary fail-closed", () => {
    expect(repair).toContain("source_id = 'usgs_mcs'");
    expect(repair).toContain("raw_redistribution_allowed = false");
  });

  it("does not activate payments or new ingestion", () => {
    expect(repair).not.toContain("GEOMACRO_COMMERCIAL_LAUNCH_ACK");
    expect(repair).not.toContain("COINBASE_X402_MAINNET_ACK");
    expect(repair).not.toContain("insert into public.live_external_sources");
  });
});

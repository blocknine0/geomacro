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
  it("restores only the already-reviewed WGI rights fields", () => {
    expect(repair).toContain("world_bank_wgi_political_stability");
    expect(repair).toContain("raw_redistribution_allowed = true");
    expect(repair).toContain("commercial_usage_status = 'COMMERCIAL_OK'");
    expect(repair).toContain("attribution_required = true");
    expect(repair).toContain("separately identifiable proprietary upstream perception-source material");
    expect(original).toContain("raw_redistribution_allowed = true");
  });

  it("does not change source enablement or unrelated source rows", () => {
    expect(repair).not.toMatch(/set[\s\S]*enabled_for_ingestion\s*=/i);
    expect(repair).not.toMatch(/set[\s\S]*enabled_for_commercial_signals\s*=/i);
    expect(repair).not.toContain("source_id = 'usgs_mcs'");
    expect(repair).not.toContain("insert into public.live_external_sources");
  });

  it("does not activate payment rails", () => {
    expect(repair).not.toContain("GEOMACRO_COMMERCIAL_LAUNCH_ACK");
    expect(repair).not.toContain("COINBASE_X402_MAINNET_ACK");
  });
});

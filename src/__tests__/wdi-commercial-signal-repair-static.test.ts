import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/979_repair_world_bank_commercial_signals.sql",
  "utf8",
);

describe("World Bank WDI commercial-signal repair", () => {
  it("is scoped to the reviewed WDI source and its existing operational prerequisites", () => {
    expect(migration).toContain("source_id = 'world_bank_indicators'");
    expect(migration).toContain("commercial_usage_status = 'COMMERCIAL_OK'");
    expect(migration).toContain("enabled_for_ingestion = true");
    expect(migration).toContain("enabled_for_commercial_signals = true");
    expect(migration).toContain("refusing commercial-signal repair");
  });

  it("does not manufacture rights or broaden raw-data permissions", () => {
    expect(migration).not.toMatch(/set[\s\S]*commercial_usage_status\s*=/i);
    expect(migration).not.toMatch(/set[\s\S]*raw_redistribution_allowed\s*=/i);
    expect(migration).not.toMatch(/set[\s\S]*enabled_for_ingestion\s*=/i);
    expect(migration).not.toContain("insert into public.live_external_sources");
    expect(migration).not.toContain("delete from public.live_external_sources");
  });

  it("fails closed if the governed postcondition is not reached", () => {
    expect(migration).toContain("commercial-signal repair did not reach the governed operational state");
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
  });
});

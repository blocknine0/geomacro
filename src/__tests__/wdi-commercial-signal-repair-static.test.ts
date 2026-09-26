import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260926114500_repair_world_bank_commercial_signals_v2.sql";
const migration = readFileSync(migrationPath, "utf8");

const updateSetClause =
  migration.match(
    /update public\.live_external_sources\s+set([\s\S]*?)where source_id = 'world_bank_indicators'/i,
  )?.[1] ?? "";

describe("World Bank WDI commercial-signal repair v2", () => {
  it("uses a collision-resistant migration version after the skipped 979 repair", () => {
    expect(migrationPath).toMatch(/supabase\/migrations\/20\d{12}_/);
    expect(migration).toContain("earlier 979 repair file did not change production");
    expect(migration).toContain("remote migration history");
  });

  it("is scoped to the reviewed WDI source and its existing operational prerequisites", () => {
    expect(migration).toContain("source_id = 'world_bank_indicators'");
    expect(migration).toContain("commercial_usage_status = 'COMMERCIAL_OK'");
    expect(migration).toContain("enabled_for_ingestion = true");
    expect(migration).toContain("enabled_for_commercial_signals = true");
    expect(migration).toContain("refusing commercial-signal repair v2");
  });

  it("does not manufacture rights or broaden raw-data permissions", () => {
    expect(updateSetClause).toContain("enabled_for_commercial_signals = true");
    expect(updateSetClause).toContain("updated_at = now()");
    expect(updateSetClause).not.toContain("commercial_usage_status");
    expect(updateSetClause).not.toContain("raw_redistribution_allowed");
    expect(updateSetClause).not.toContain("enabled_for_ingestion");
    expect(migration).not.toContain("insert into public.live_external_sources");
    expect(migration).not.toContain("delete from public.live_external_sources");
  });

  it("fails closed if the governed postcondition is not reached", () => {
    expect(migration).toContain("commercial-signal repair v2 did not reach the governed operational state");
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
  });
});

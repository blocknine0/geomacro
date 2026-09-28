import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = [
  readFileSync(
    new URL(
      "../../supabase/migrations/9981_commercial_launch_security_hardening_replay.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFileSync(
    new URL(
      "../../supabase/migrations/20260928153549_harden_public_function_search_paths.sql",
      import.meta.url,
    ),
    "utf8",
  ),
].join("\n");

describe("commercial launch Supabase security", () => {
  it("keeps internal raw and realtime tables behind RLS", () => {
    for (const table of [
      "live_raw_source_targets",
      "live_raw_source_snapshots",
      "live_realtime_scope_targets",
      "live_realtime_escalation_queue",
      "live_realtime_burst_runs",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated`);
    }
  });

  it("keeps privileged maintenance RPCs service-role-only", () => {
    for (const fn of [
      "ensure_live_source_certification_record",
      "global_coverage_design_is_complete",
      "sync_live_country_module_targets",
      "sync_live_global_country_source_universe",
      "sync_live_realtime_corridor_targets",
      "sync_live_realtime_hot_topic_targets",
    ]) {
      expect(migration).toContain(`revoke execute on function public.${fn}() from public, anon, authenticated`);
      expect(migration).toContain(`grant execute on function public.${fn}() to service_role`);
    }
  });

  it("pins governance function search paths", () => {
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("prevent_geomacro_risk_object_mutation");
    expect(migration).toContain("global_coverage_certification_is_locked");
  });
});

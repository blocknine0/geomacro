import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260927174309_intelligence_scheduler_state.sql",
  "utf8",
);
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");

describe("intelligence scheduler state persistence", () => {
  it("creates a private service-role scheduler state table", () => {
    expect(migration).toContain("create table if not exists public.live_intelligence_scheduler_state");
    expect(migration).toContain("source_id text primary key");
    expect(migration).toContain("payload jsonb not null default '{}'::jsonb");
    expect(migration).toContain("last_attempt_at timestamptz");
    expect(migration).toContain("last_success_at timestamptz");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.live_intelligence_scheduler_state from anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.live_intelligence_scheduler_state to service_role");
  });

  it("matches the table used by the production orchestrator", () => {
    expect(orchestrator).toContain('.from("live_intelligence_scheduler_state")');
    expect(orchestrator).toContain('.upsert(row, { onConflict: "source_id" })');
    expect(orchestrator).toContain('key: "public_demo_refresh"');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260927174309_intelligence_scheduler_state.sql",
  "utf8",
);
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
const d1 = readFileSync("scripts/lib/d1-control-plane-state.mjs","utf8");

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

  it("retains historical Supabase migration as private archive schema but production state is D1", () => {
    expect(d1).toContain("FROM pipeline_checkpoint");
    expect(d1).toContain("ON CONFLICT(pipeline,scope) DO UPDATE");
    expect(orchestrator).toContain("createD1ControlPlaneStateClient()");
    expect(orchestrator).toContain("await d1State.loadRows()");
    expect(orchestrator).toContain("await d1State.persist(task.key, payload");
    expect(orchestrator).toContain("new Map([...rows.values()].map((row) => [row.source_id, row]))");
    expect(orchestrator).not.toContain('.from("live_intelligence_scheduler_state")');
    expect(orchestrator).not.toContain('.upsert(row, { onConflict: "source_id" })');
    expect(orchestrator).toContain('key: "public_demo_refresh"');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260930110500_structured_event_archived_source_rights.sql",
  "utf8",
);

describe("structured evidence archived source rights", () => {
  it("stores only compact event/source identity under service-role control", () => {
    expect(migration).toContain("live_structured_event_archived_sources");
    expect(migration).toContain("event_id uuid not null");
    expect(migration).toContain("source_key text not null");
    expect(migration).toContain("primary key (event_id, source_key)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("grant select, insert, update, delete");
    expect(migration).not.toContain("source_url");
    expect(migration).not.toContain("evidence_title");
  });

  it("keeps rights evaluation sourced from live plus archived provenance", () => {
    expect(migration).toContain("with source_identities as");
    expect(migration).toContain("from public.live_structured_event_evidence e");
    expect(migration).toContain("from public.live_structured_event_archived_sources a");
    expect(migration).toContain("left join public.live_source_registry r");
    expect(migration).toContain("missing_structured_event_source_provenance");
    expect(migration).toContain("commercial_source_derived_only");
  });

  it("recomputes rights when archived provenance or source policy changes", () => {
    expect(migration).toContain("sync_structured_event_rights_from_archived_sources");
    expect(migration).toContain("live_structured_event_rights_archived_source_sync");
    expect(migration).toContain("sync_structured_event_rights_from_source_policy");
    expect(migration).toContain("where a.source_key = new.source_key");
    expect(migration).toContain("recompute_structured_event_commercial_eligibility");
  });

  it("does not delete live evidence or storage objects", () => {
    expect(migration).not.toContain("delete from public.live_structured_event_evidence");
    expect(migration).not.toContain("storage.objects");
  });
});

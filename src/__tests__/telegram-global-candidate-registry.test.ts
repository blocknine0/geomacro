import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("#1414 Telegram global candidate + event authorization", () => {
  it("keeps discovery separate from authorization", () => {
    const migration = read("supabase/migrations/9993_telegram_global_candidate_registry_and_event_guard.sql");
    expect(migration).toContain("live_telegram_source_candidates");
    expect(migration).toContain("DISCOVERY_ONLY");
    expect(migration).toContain("activation_status <> 'ACTIVE'");
    expect(migration).toContain("candidate_status = 'AUTHORIZED'");
    expect(migration).toContain("publisher_authorized = true");
  });

  it("requires the specific event channel to have active publisher authorization", () => {
    const migration = read("supabase/migrations/9993_telegram_global_candidate_registry_and_event_guard.sql");
    expect(migration).toContain("TELEGRAM_AUTHORIZED_EVENT_CHANNEL_REQUIRED");
    expect(migration).toContain("TELEGRAM_EVENT_PUBLISHER_AUTHORIZATION_INVALID");
    expect(migration).toContain("channel.enabled is not true");
    expect(migration).toContain("channel.manual_review_status <> 'APPROVED'");
    expect(migration).toContain("channel.publisher_authorized is not true");
    expect(migration).toContain("new.verification_status := 'UNVERIFIED'");
  });

  it("normalizes channel identity at the database boundary", () => {
    const migration = read("supabase/migrations/9993_telegram_global_candidate_registry_and_event_guard.sql");
    expect(migration).toContain("coalesce(new.source_channel_key, new.source_channel, '')");
    expect(migration).toContain("regexp_replace(normalized_key, '^@+', '')");
    expect(migration).toContain("new.source_channel_key := normalized_key");
  });
});

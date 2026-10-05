import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("#1414 Telegram global governance contract", () => {
  it("permanently disables legacy public MTProto ingestion", () => {
    const migration = read("supabase/migrations/9992_telegram_authorized_publisher_guard.sql");
    expect(migration).toContain("where source_id = 'telegram_mtproto_flash'");
    expect(migration).toContain("enabled_for_ingestion = false");
    expect(migration).toContain("enabled_for_commercial_signals = false");
    expect(migration).toContain("commercial_usage_status = 'PERMISSION_REQUIRED'");
  });

  it("requires explicit publisher authorization before a channel can be enabled", () => {
    const migration = read("supabase/migrations/9992_telegram_authorized_publisher_guard.sql");
    expect(migration).toContain("publisher_authorized boolean not null default false");
    expect(migration).toContain("manual_review_status = 'APPROVED'");
    expect(migration).toContain("authorization_scope");
    expect(migration).toContain("authorization_reference");
    expect(migration).toContain("authorization_granted_at");
    expect(migration).toContain("live_telegram_channel_registry_authorized_production_check");
  });

  it("keeps global discovery separate from production authorization", () => {
    const migration = read("supabase/migrations/9993_telegram_global_candidate_registry_and_event_guard.sql");
    expect(migration).toContain("live_telegram_source_candidates");
    expect(migration).toContain("DISCOVERY_ONLY");
    expect(migration).toContain("activation_status <> 'ACTIVE'");
    expect(migration).toContain("candidate_status = 'AUTHORIZED'");
    expect(migration).toContain("publisher_authorized = true");
  });

  it("forces authorized Telegram events to enter as UNVERIFIED", () => {
    const migration = read("supabase/migrations/9993_telegram_global_candidate_registry_and_event_guard.sql");
    expect(migration).toContain("new.verification_status := 'UNVERIFIED'");
    expect(migration).toContain("telegram_authorized_publisher_feed");
    expect(migration).toContain("legacy public Telegram MTProto ingestion is disabled");
  });

  it("normalizes channel identity at the database boundary", () => {
    const migration = read("supabase/migrations/9993_telegram_global_candidate_registry_and_event_guard.sql");
    expect(migration).toContain("coalesce(new.source_channel_key, new.source_channel, '')");
    expect(migration).toContain("regexp_replace(normalized_key, '^@+', '')");
    expect(migration).toContain("new.source_channel_key := normalized_key");
  });

  it("ships a direct-Postgres-capable production governance audit", () => {
    const audit = read("scripts/audit-telegram-governance.mjs");
    expect(audit).toContain('createGriDbClient');
    expect(audit).toContain('live_telegram_governance_status');
    expect(audit).toContain('UNSAFE_TELEGRAM_CHANNEL_ENABLED');
    expect(audit).toContain('LEGACY_PUBLIC_MTPROTO_ENABLED');
    expect(audit).toContain('TELEGRAM_DIRECT_COMMERCIAL_SOURCE_ENABLED');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("#1414 Telegram production governance", () => {
  it("permanently disables public MTProto and direct Telegram commercial signals", () => {
    const boundary = read("supabase/migrations/9990_telegram_authorized_publisher_boundary.sql");
    const activation = read("supabase/migrations/9991_telegram_activation_guard.sql");

    expect(boundary).toContain("where source_id = 'telegram_mtproto_flash'");
    expect(boundary).toContain("enabled_for_ingestion = false");
    expect(boundary).toContain("enabled_for_commercial_signals = false");
    expect(boundary).toContain("telegram_authorized_publisher_feed");
    expect(boundary).toContain("live_external_sources_telegram_public_disabled_check");
    expect(boundary).toContain("live_external_sources_telegram_never_direct_commercial_check");
    expect(activation).toContain("PUBLIC_TELEGRAM_MTPROTO_DISABLED");
    expect(activation).toContain("TELEGRAM_DIRECT_COMMERCIAL_SIGNALS_FORBIDDEN");
  });

  it("requires explicit publisher authorization evidence before activation", () => {
    const boundary = read("supabase/migrations/9990_telegram_authorized_publisher_boundary.sql");
    const activation = read("supabase/migrations/9991_telegram_activation_guard.sql");

    expect(boundary).toContain("publisher_authorized boolean not null default false");
    expect(boundary).toContain("authorization_scope");
    expect(boundary).toContain("authorization_reference");
    expect(boundary).toContain("authorization_granted_at");
    expect(boundary).toContain("authorization_expires_at");
    expect(activation).toContain("manual_review_status = 'APPROVED'");
    expect(activation).toContain("publisher_authorized = true");
    expect(activation).toContain("TELEGRAM_AUTHORIZED_FEED_REQUIRES_ACTIVE_PUBLISHER_AUTHORIZATION");
  });

  it("forces every Telegram content ingest back to unverified, scoreless and raw-stripped", () => {
    const guard = read("supabase/migrations/9992_telegram_raw_event_ingest_guard.sql");

    expect(guard).toContain("new.content_hash is distinct from old.content_hash");
    expect(guard).toContain("new.verification_status := 'UNVERIFIED'");
    expect(guard).toContain("new.severity := null");
    expect(guard).toContain("new.verified_at := null");
    expect(guard).toContain("new.body := null");
    expect(guard).toContain("new.raw_payload := null");
  });

  it("mirrors the same hard boundary into the isolated signal lineage", () => {
    const preparer = read("scripts/prepare-telegram-isolated-migration-workdir.mjs");
    const invariants = read("supabase/isolated-signal/migrations/986_telegram_authorization_invariants.sql");
    const activation = read("supabase/isolated-signal/migrations/987_telegram_activation_guard.sql");
    const ingestGuard = read("supabase/isolated-signal/migrations/988_telegram_raw_event_ingest_guard.sql");

    for (const migration of [
      "986_telegram_authorization_invariants.sql",
      "987_telegram_activation_guard.sql",
      "988_telegram_raw_event_ingest_guard.sql",
    ]) {
      expect(preparer).toContain(migration);
    }
    expect(invariants).toContain("live_external_sources_telegram_public_disabled_check");
    expect(activation).toContain("TELEGRAM_AUTHORIZED_FEED_REQUIRES_ACTIVE_PUBLISHER_AUTHORIZATION");
    expect(ingestGuard).toContain("new.verification_status := 'UNVERIFIED'");
  });

  it("ships a direct-Postgres runtime audit for production drift", () => {
    const audit = read("scripts/audit-telegram-production-governance.mjs");

    expect(audit).toContain('createGriDbClient');
    expect(audit).toContain("TELEGRAM_PUBLIC_MTPROTO_INGESTION_ENABLED");
    expect(audit).toContain("enabled_without_publisher_authorization");
    expect(audit).toContain("authorized_feed_enabled_without_active_authorized_channel");
    expect(audit).toContain("TELEGRAM_GOVERNANCE_VIOLATION");
  });
});

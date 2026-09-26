import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/isolated-signal/migrations/984_telegram_authorized_publisher_only.sql",
  "utf8",
);

describe("Telegram production source boundary", () => {
  it("disables public-channel MTProto aggregation for production intelligence", () => {
    expect(migration).toContain("where source_id = 'telegram_mtproto_flash'");
    expect(migration).toContain("enabled_for_ingestion = false");
    expect(migration).toContain("enabled_for_commercial_signals = false");
    expect(migration).toContain("commercial_usage_status = 'BLOCKED'");
  });

  it("creates only a default-off publisher-authorized candidate", () => {
    expect(migration).toContain("'telegram_authorized_publisher_feed'");
    expect(migration).toContain("'PUBLISHER_PUSH'");
    expect(migration).toContain("'SIGNED_WEBHOOK_OR_BOT_SUBMISSION'");
    expect(migration).toContain("'REVIEW_REQUIRED'");
    expect(migration).toContain("publisher_authorized boolean not null default false");
  });

  it("requires explicit authorization evidence before COMMERCIAL_OK", () => {
    expect(migration).toContain("rights_status <> 'COMMERCIAL_OK'");
    expect(migration).toContain("publisher_authorized = true");
    expect(migration).toContain("authorization_scope is not null");
    expect(migration).toContain("authorization_reference is not null");
    expect(migration).toContain("authorization_granted_at is not null");
    expect(migration).toContain("raw_redistribution_allowed");
  });
});

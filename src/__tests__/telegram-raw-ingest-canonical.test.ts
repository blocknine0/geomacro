import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/9995_telegram_raw_event_ingest_guard.sql",
  "utf8",
);

describe("Telegram raw-event canonical ingest guard", () => {
  it("resets every Telegram insert/content change before persistence", () => {
    expect(migration).toContain("guard_telegram_raw_event_ingest");
    expect(migration).toContain("tg_op = 'INSERT' or new.content_hash is distinct from old.content_hash");
    expect(migration).toContain("new.verification_status := 'UNVERIFIED'");
    expect(migration).toContain("new.severity := null");
    expect(migration).toContain("new.verified_at := null");
    expect(migration).toContain("new.body := null");
    expect(migration).toContain("new.raw_payload := null");
  });

  it("applies to both the disabled legacy source and the publisher-authorized lane", () => {
    expect(migration).toContain("'telegram_mtproto_flash'");
    expect(migration).toContain("'telegram_authorized_publisher_feed'");
    expect(migration).toContain("before insert or update of content_hash on public.live_flash_events");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = public");
  });
});

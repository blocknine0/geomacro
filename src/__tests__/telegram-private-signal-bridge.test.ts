import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("private Telegram signal-plane bridge", () => {
  it("pins the private producer contract and keeps B2+D1 as storage boundary", () => {
    const contract = JSON.parse(read("config/telegram-private-signal-bridge.json"));
    expect(contract.producer_repo).toBe("blocknine0/geomacro-telegram-signals");
    expect(contract.producer_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(contract.payload_schema).toBe("geomacro.telegram-lead-envelope.v1");
    expect(contract.storage).toEqual({ durable: "B2", checkpoint_index: "D1" });
    expect(contract.required_producer_invariants.verification_status).toBe("UNVERIFIED");
    expect(contract.required_producer_invariants.scoring_eligible).toBe(false);
    expect(contract.required_producer_invariants.commercial_eligible).toBe(false);
  });

  it("rejects any Telegram pre-promotion before main corroboration", () => {
    const verifier = read("scripts/verify-telegram-lead-envelope.mjs");
    expect(verifier).toContain('input.verification_status !== "UNVERIFIED"');
    expect(verifier).toContain("TELEGRAM_PREPROMOTION_FORBIDDEN");
    expect(verifier).toContain('raw_payload: null');
    expect(verifier).toContain('source_id: "telegram_authorized_publisher_feed"');
  });

  it("activates the generic feed only when a valid authorized channel exists", () => {
    const migration = read("supabase/migrations/9994_telegram_authorized_feed_activation_sync.sql");
    expect(migration).toContain("publisher_authorized = true");
    expect(migration).toContain("manual_review_status = 'APPROVED'");
    expect(migration).toContain("enabled_for_ingestion = has_authorized_channel");
    expect(migration).toContain("enabled_for_commercial_signals = false");
    expect(migration).toContain("where source_id = 'telegram_mtproto_flash'");
  });
});

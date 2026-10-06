import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const CONTRACT_HASH = "6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9";

describe("private Telegram signal-plane bridge", () => {
  it("pins the protocol contract rather than every producer commit", () => {
    const contract = JSON.parse(read("config/telegram-private-signal-bridge.json"));
    expect(contract.schema).toBe("geomacro.telegram-main-bridge.v2");
    expect(contract.producer_repo).toBe("blocknine0/geomacro-telegram-signals");
    expect(contract.producer_commit_audit).toMatch(/^[a-f0-9]{40}$/);
    expect(contract.producer_acceptance).toBe("protocol_hash");
    expect(contract.payload_schema).toBe("geomacro.telegram-lead-envelope.v2");
    expect(contract.protocol_contract_sha256).toBe(CONTRACT_HASH);
    expect(contract.storage).toEqual({ durable: "B2", checkpoint_index: "D1" });
    expect(contract.required_producer_invariants.verification_status).toBe("UNVERIFIED");
    expect(contract.required_producer_invariants.scoring_eligible).toBe(false);
    expect(contract.required_producer_invariants.commercial_eligible).toBe(false);
  });

  it("rejects protocol drift and any Telegram pre-promotion before main corroboration", () => {
    const verifier = read("scripts/verify-telegram-lead-envelope.mjs");
    expect(verifier).toContain("TELEGRAM_PROTOCOL_CONTRACT_HASH_MISMATCH");
    expect(verifier).toContain(CONTRACT_HASH);
    expect(verifier).toContain('input.verification_status !== "UNVERIFIED"');
    expect(verifier).toContain("TELEGRAM_PREPROMOTION_FORBIDDEN");
    expect(verifier).toContain("raw_payload: null");
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

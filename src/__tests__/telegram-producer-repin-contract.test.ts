import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const bridge = JSON.parse(readFileSync("config/telegram-private-signal-bridge.json", "utf8"));
const migration = readFileSync(
  "workers/control-plane/migrations/0009_telegram_signal_protocol_v2.sql",
  "utf8",
);
const CONTRACT_HASH = "6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9";

describe("Telegram private producer protocol acceptance contract", () => {
  it("accepts the private producer by repository plus versioned protocol hash", () => {
    expect(bridge.producer_repo).toBe("blocknine0/geomacro-telegram-signals");
    expect(bridge.producer_acceptance).toBe("protocol_hash");
    expect(bridge.producer_commit_audit).toMatch(/^[a-f0-9]{40}$/);
    expect(bridge.payload_schema).toBe("geomacro.telegram-lead-envelope.v2");
    expect(bridge.protocol_contract_sha256).toBe(CONTRACT_HASH);
  });

  it("advances D1 runtime status to protocol v2 without making commit SHA an acceptance gate", () => {
    expect(migration).toContain("protocol_contract_sha256");
    expect(migration).toContain(CONTRACT_HASH);
    expect(migration).toContain("geomacro.telegram-lead-envelope.v2");
    expect(migration).toContain("blocknine0/geomacro-telegram-signals");
    expect(migration).toContain("update telegram_signal_runtime_status");
  });

  it("keeps Telegram producer output supplementary and non-commercial", () => {
    expect(bridge.required_producer_invariants).toEqual({
      verification_status: "UNVERIFIED",
      scoring_eligible: false,
      commercial_eligible: false,
    });
    expect(bridge.storage).toEqual({ durable: "B2", checkpoint_index: "D1" });
  });
});

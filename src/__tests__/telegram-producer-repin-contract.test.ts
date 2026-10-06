import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const bridge = JSON.parse(readFileSync("config/telegram-private-signal-bridge.json", "utf8"));
const migration = readFileSync(
  "workers/control-plane/migrations/0008_telegram_signal_producer_repin_aba12.sql",
  "utf8",
);

const CURRENT_PRODUCER = "aba12aea43ec8a5c9e54a4266e639903d531ad33";

describe("Telegram private producer repin contract", () => {
  it("pins the exact accepted private producer commit", () => {
    expect(bridge.producer_repo).toBe("blocknine0/geomacro-telegram-signals");
    expect(bridge.producer_commit).toBe(CURRENT_PRODUCER);
    expect(bridge.payload_schema).toBe("geomacro.telegram-lead-envelope.v1");
  });

  it("advances D1 runtime status to the same accepted producer commit", () => {
    expect(migration).toContain(CURRENT_PRODUCER);
    expect(migration).toContain("geomacro.telegram-lead-envelope.v1");
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

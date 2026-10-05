import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const bridge = JSON.parse(readFileSync("config/telegram-private-signal-bridge.json", "utf8"));
const migration = readFileSync(
  "workers/control-plane/migrations/0005_telegram_signal_producer_repin_79fb.sql",
  "utf8",
);

const CURRENT_PRODUCER = "79fb75cf342a652216cff4355448012c5bab8cbf";

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

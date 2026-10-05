import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const bridge = JSON.parse(readFileSync("config/telegram-private-signal-bridge.json", "utf8"));
const migration = readFileSync("workers/control-plane/migrations/0004_telegram_signal_producer_repin.sql", "utf8");

const CURRENT_PRODUCER = "42e6dce0a022f479528f86f665d743a6a64b4dcf";

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
});

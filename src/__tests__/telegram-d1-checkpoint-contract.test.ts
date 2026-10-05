import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("workers/control-plane/migrations/0003_telegram_signal_checkpoint.sql", "utf8");

describe("Telegram D1 checkpoint contract", () => {
  it("keeps only compact pointer/checkpoint state in D1", () => {
    expect(sql).toContain("telegram_signal_checkpoints");
    expect(sql).toContain("last_b2_object_key text");
    expect(sql).toContain("last_b2_sha256 text");
    expect(sql).toContain("last_signal_id text");
    expect(sql).not.toContain("message_body");
    expect(sql).not.toContain("raw_payload");
  });

  it("pins the private producer and envelope schema", () => {
    expect(sql).toContain("geomacro.telegram-lead-envelope.v1");
    expect(sql).toContain("blocknine0/geomacro-telegram-signals");
    expect(sql).toContain("f3ef91a8387e37843d1b9990bc011fd09035e43f");
  });
});

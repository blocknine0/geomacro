import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const bootstrap = readFileSync("workers/control-plane/migrations/0003_telegram_signal_checkpoint.sql", "utf8");
const protocolV2 = readFileSync("workers/control-plane/migrations/0009_telegram_signal_protocol_v2.sql", "utf8");

describe("Telegram D1 checkpoint contract", () => {
  it("keeps only compact pointer/checkpoint state in D1", () => {
    expect(bootstrap).toContain("telegram_signal_checkpoints");
    expect(bootstrap).toContain("last_b2_object_key text");
    expect(bootstrap).toContain("last_b2_sha256 text");
    expect(bootstrap).toContain("last_signal_id text");
    expect(bootstrap).not.toContain("message_body");
    expect(bootstrap).not.toContain("raw_payload");
  });

  it("preserves historical bootstrap and advances current acceptance to protocol hash v2", () => {
    expect(bootstrap).toContain("blocknine0/geomacro-telegram-signals");
    expect(protocolV2).toContain("geomacro.telegram-lead-envelope.v2");
    expect(protocolV2).toContain("6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9");
    expect(protocolV2).toContain("protocol_contract_sha256");
  });
});

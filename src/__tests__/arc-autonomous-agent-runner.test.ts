import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const runner = readFileSync(
  "scripts/agentic/arc-autonomous-agent.mjs",
  "utf8",
);

describe("Arc autonomous agent runner", () => {
  it("is hard-bound to Arc Testnet and USDC", () => {
    expect(runner).toContain('"ARC-TESTNET"');
    expect(runner).toContain('"eip155:5042002"');
    expect(runner).toContain(
      '"0x3600000000000000000000000000000000000000"',
    );
  });

  it("requires explicit Testnet payment acknowledgement and caps spend", () => {
    expect(runner).toContain(
      "GEOMACRO_AGENT_PAYMENT_ACK=ARC_TESTNET_USDC",
    );
    expect(runner).toContain(
      'GEOMACRO_AGENT_MAX_PAYMENT_USDC || "0.001"',
    );
    expect(runner).toContain('"--max-amount", maxAmount');
    expect(runner).toContain(
      "GEOMACRO_AGENT_MAX_PAYMENT_USDC must be greater than 0",
    );
    expect(runner).toContain(
      "result?.risk_gate?.execution_authorized !== false",
    );
  });

  it("refuses the production hostname", () => {
    expect(runner).toContain(
      '["geomacro.live", "www.geomacro.live"]',
    );
  });

  it("requires verified Risk Object delivery", () => {
    expect(runner).toContain(
      'result?.risk_object?.verification?.status !== "VERIFIED"',
    );
    expect(runner).toContain(
      "result?.boundaries?.execution_authorized !== false",
    );
  });
});

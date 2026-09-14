import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/testnet/live-authenticated-e2e.mjs", "utf8");
const workflow = readFileSync(".github/workflows/live-testnet-authenticated-e2e.yml", "utf8");

describe("permanent live authenticated Testnet E2E harness", () => {
  it("covers real wallet sign-in, 402 quote, paid retry and replay safety", () => {
    expect(script).toContain("/api/testnet-tester/auth-challenge");
    expect(script).toContain("/api/testnet-tester/auth-verify");
    expect(script).toContain("TESTNET_PAYMENT_REQUIRED");
    expect(script).toContain("usdc.transfer");
    expect(script).toContain("idempotent replay");
    expect(script).toContain("TESTNET_PAYMENT_ALREADY_CLAIMED");
    expect(script).toContain("execution_authorized");
  });

  it("uses an isolated dedicated E2E wallet and explicit paid acknowledgement", () => {
    expect(workflow).toContain("GEOMACRO_TESTNET_E2E_PRIVATE_KEY");
    expect(workflow).toContain("GEOMACRO_TESTNET_USDC");
    expect(workflow).toContain("geomacro-testnet-e2e");
    expect(workflow).not.toContain("OWNER_PRIVATE_KEY");
    expect(workflow).not.toContain("GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY");
  });

  it("keeps automatic scheduled runs quote-only unless explicitly paid", () => {
    expect(workflow).toContain("vars.GEOMACRO_TESTNET_E2E_ENABLED == 'true'");
    expect(workflow).toContain("inputs.mode || 'quote_only'");
    expect(script).toContain('MODE === "paid"');
    expect(script).toContain('ACK === "GEOMACRO_TESTNET_USDC"');
    expect(script).toContain("MAX_USDC");
  });
});

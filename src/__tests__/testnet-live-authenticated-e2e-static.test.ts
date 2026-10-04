import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/testnet/live-authenticated-e2e.mjs", "utf8");
const workflow = readFileSync(".github/workflows/live-testnet-health.yml", "utf8");

describe("preserved live authenticated Testnet E2E harness", () => {
  it("covers real wallet sign-in, 402 quote, paid retry and replay safety", () => {
    expect(script).toContain("/api/testnet-tester/auth-challenge");
    expect(script).toContain("/api/testnet-tester/auth-verify");
    expect(script).toContain("TESTNET_PAYMENT_REQUIRED");
    expect(script).toContain("usdc.transfer");
    expect(script).toContain("idempotent replay");
    expect(script).toContain("TESTNET_PAYMENT_ALREADY_CLAIMED");
    expect(script).toContain("execution_authorized");
  });

  it("keeps the dedicated paid safety contract inside the technical harness", () => {
    expect(script).toContain("GEOMACRO_TESTNET_E2E_PRIVATE_KEY");
    expect(script).toContain("GEOMACRO_TESTNET_E2E_ACK");
    expect(script).toContain("GEOMACRO_TESTNET_USDC");
    expect(script).toContain("GEOMACRO_TESTNET_E2E_MAX_USDC");
    expect(script).not.toContain("OWNER_PRIVATE_KEY");
    expect(script).not.toContain("GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY");
  });

  it("does not schedule paid Testnet execution from the launch-critical retirement workflow", () => {
    expect(workflow).toContain("name: Production Testnet Retirement Health");
    expect(workflow).not.toContain("GEOMACRO_TESTNET_E2E_PRIVATE_KEY");
    expect(workflow).not.toContain("vars.GEOMACRO_TESTNET_E2E_ENABLED == 'true'");
    expect(workflow).not.toContain("developer-paid-e2e");
    expect(workflow).not.toContain("authenticated-e2e");
    expect(script).toContain('MODE === "paid"');
    expect(script).toContain('ACK === "GEOMACRO_TESTNET_USDC"');
    expect(script).toContain("MAX_USDC");
  });
});

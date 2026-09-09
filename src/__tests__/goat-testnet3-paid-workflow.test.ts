import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GOAT Testnet3 paid E2E workflow safety", () => {
  const workflow = readFileSync(
    ".github/workflows/goat-testnet3-paid-e2e.yml",
    "utf8",
  );
  const harness = readFileSync(
    "scripts/goat/testnet3-e2e.mjs",
    "utf8",
  );

  it("is manual-only and requires an exact payment acknowledgement", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("GOAT_TESTNET3_USDC");
    expect(harness).toContain('const PAYMENT_ACK = "GOAT_TESTNET3_USDC"');
  });

  it("uses a protected environment and dedicated test-wallet secret", () => {
    expect(workflow).toContain("environment: goat-testnet3-paid-proof");
    expect(workflow).toContain("secrets.GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY");
    expect(workflow).toContain("secrets.GEOMACRO_GOAT_PILOT_ACCESS_TOKEN");
    expect(workflow).not.toContain("GOATX402_API_SECRET");
    expect(workflow).not.toContain("GOATX402_API_KEY");
  });

  it("refuses the public production host and pins Testnet3 in the harness", () => {
    expect(harness).toContain('["geomacro.live", "www.geomacro.live"]');
    expect(harness).toContain("GOAT_TESTNET3_CHAIN_ID = 48816n");
    expect(harness).toContain('GOAT_TESTNET3_RPC = "https://rpc.testnet3.goat.network"');
  });

  it("requires server-confirmed payment and machine-verifies the delivered Risk Object", () => {
    expect(harness).toContain('"/api/goat/pilot/status"');
    expect(harness).toContain('state === "DELIVERED"');
    expect(harness).toContain('"/api/risk-object-keys"');
    expect(harness).toContain("verification.body?.verification?.cryptographic_valid === true");
    expect(harness).toContain("transaction_hash === submittedTxHash");
  });

  it("keeps Testnet settlement non-commercial and execution unauthorized", () => {
    expect(workflow).toContain("Commercial revenue: false");
    expect(workflow).toContain("Execution authorization from Risk Gate: false");
    expect(harness).toContain("commercial_revenue === false");
    expect(harness).toContain("execution_authorized === false");
  });

  it("uploads only the harness's sanitized JSON evidence directory", () => {
    expect(workflow).toContain("artifacts/goat-testnet3-paid/*.json");
    expect(harness).toContain("redactedEvidence");
    expect(harness).toContain("[REDACTED]");
  });
});

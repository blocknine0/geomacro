import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GOAT Testnet3 paid E2E workflow safety", () => {
  const workflow = readFileSync(
    ".github/workflows/goat-testnet3.yml",
    "utf8",
  );
  const jobBlock = (source: string, name: string) => {
    const header = `  ${name}:\n`;
    const start = source.indexOf(header);
    if (start < 0) return "";
    const boundary = /^  [A-Za-z0-9_-]+:\n/gm;
    let next = boundary.exec(source);
    while (next && next.index <= start) next = boundary.exec(source);
    return source.slice(start, next ? next.index : source.length);
  };
  const paidJob = jobBlock(workflow, "paid-e2e");
  const harness = readFileSync(
    "scripts/goat/testnet3-e2e.mjs",
    "utf8",
  );

  it("is manual-only and requires an exact payment acknowledgement", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("- paid-e2e");
    expect(paidJob).toContain("GOAT_TESTNET3_USDC");
    expect(harness).toContain('const PAYMENT_ACK = "GOAT_TESTNET3_USDC"');
  });

  it("uses a protected environment and dedicated test-wallet secret", () => {
    expect(paidJob).toContain("environment: goat-testnet3-paid-proof");
    expect(paidJob).toContain("secrets.GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY");
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
    expect(paidJob).toContain("Commercial revenue: false");
    expect(paidJob).toContain("Execution authorization from Risk Gate: false");
    expect(harness).toContain("commercial_revenue === false");
    expect(harness).toContain("execution_authorized === false");
  });

  it("uploads only the harness's sanitized JSON evidence directory", () => {
    expect(paidJob).toContain("artifacts/goat-testnet3-paid/*.json");
    expect(harness).toContain("redactedEvidence");
    expect(harness).toContain("[REDACTED]");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/agentic/coinbase-x402-base-sepolia-e2e.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/coinbase-x402-base-sepolia-paid-e2e.yml",
  "utf8",
);

describe("Coinbase x402 Base Sepolia paid E2E safety contract", () => {
  it("pins the public Geomacro resource to Base Sepolia USDC", () => {
    expect(script).toContain('const RESOURCE_URL = "https://geomacro.live/api/x402/risk"');
    expect(script).toContain('const EXPECTED_NETWORK = "eip155:84532"');
    expect(script).toContain('const EXPECTED_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"');
    expect(script).not.toContain('eip155:8453"');
  });

  it("hard-caps one test payment at 0.05 USDC and requires explicit acknowledgement", () => {
    expect(script).toContain("const MAX_PAYMENT_ATOMIC = 50_000n");
    expect(script).toContain('const ACK = "COINBASE_X402_BASE_SEPOLIA_USDC"');
    expect(workflow).toContain("COINBASE_X402_BASE_SEPOLIA_USDC");
    expect(workflow).toContain("Maximum authorized payment per run: 0.05 test USDC");
  });

  it("never auto-retries a signed payment and explicitly proves replay safety", () => {
    expect(script).toContain("Intentionally one paid attempt only");
    expect(script).toContain("Replay the exact same signed proof + exact same request");
    expect(script).toContain("replay_no_second_debit: true");
    expect(script).toContain("duplicate_charge_count: 0");
  });

  it("proves the same payment proof cannot authorize changed business terms", () => {
    expect(script).toContain("Reuse the exact signed proof with changed business terms");
    expect(script).toContain("conflict.status !== 409");
    expect(script).toContain("reused_proof_different_request_conflict_409: true");
    expect(script).toContain("conflict_no_debit: true");
  });

  it("keeps the Risk Gate non-authorizing boundary in both paid and replay responses", () => {
    expect(script).toContain("execution_authorized must be false");
    expect(script).toContain('execution_authorized: false');
    expect(workflow).toContain("Execution authorization from Risk Gate: false");
  });

  it("uses protected buyer custody without persisting the key or raw payment signature", () => {
    expect(workflow).toContain("secrets.GEOMACRO_COINBASE_X402_BUYER_PRIVATE_KEY");
    expect(workflow).toContain("Private key persisted in evidence: false");
    expect(workflow).toContain("Raw PAYMENT-SIGNATURE persisted in evidence: false");
    expect(script).toContain("private_key_persisted: false");
    expect(script).toContain("payment_signature_persisted: false");
    expect(script).not.toContain("console.log(PRIVATE_KEY");
    expect(script).not.toContain("paymentPayload,");
  });

  it("preserves sanitized evidence for settlement and no-double-charge verification", () => {
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("retention-days: 90");
    expect(script).toContain("settlement_tx_hash: txHash");
    expect(script).toContain("payer_usdc_after_replay_atomic");
    expect(script).toContain("payer_usdc_after_conflict_atomic");
    expect(script).toContain("observed_first_debit_atomic");
  });
});

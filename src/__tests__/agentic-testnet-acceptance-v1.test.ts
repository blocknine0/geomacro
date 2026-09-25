import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertCircleX402PaymentBinding,
  CIRCLE_X402_ASSET,
  CIRCLE_X402_GATEWAY_WALLET,
  CIRCLE_X402_MAX_TIMEOUT_SECONDS,
  CIRCLE_X402_NETWORK,
  CIRCLE_X402_PRICE_ATOMIC,
} from "../lib/circle-x402.server";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const seller = "0x1111111111111111111111111111111111111111";
const previousSeller = process.env.CIRCLE_X402_SELLER_ADDRESS;

afterEach(() => {
  if (previousSeller === undefined) delete process.env.CIRCLE_X402_SELLER_ADDRESS;
  else process.env.CIRCLE_X402_SELLER_ADDRESS = previousSeller;
});

function validPayload() {
  process.env.CIRCLE_X402_SELLER_ADDRESS = seller;
  return {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: CIRCLE_X402_NETWORK,
      asset: CIRCLE_X402_ASSET,
      amount: CIRCLE_X402_PRICE_ATOMIC,
      payTo: seller,
      maxTimeoutSeconds: CIRCLE_X402_MAX_TIMEOUT_SECONDS,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        verifyingContract: CIRCLE_X402_GATEWAY_WALLET,
      },
    },
    payload: {},
  } as Record<string, unknown>;
}

describe("Agentic Testnet Acceptance v1", () => {
  it("strictly binds Circle Gateway payment metadata before settlement", () => {
    const payload = validPayload();
    expect(() => assertCircleX402PaymentBinding(payload)).not.toThrow();

    const mutations: Array<[string, (value: any) => void]> = [
      ["PAYMENT_X402_VERSION_MISMATCH", (value) => { value.x402Version = 1; }],
      ["PAYMENT_NETWORK_MISMATCH", (value) => { value.accepted.network = "eip155:84532"; }],
      ["PAYMENT_ASSET_MISMATCH", (value) => { value.accepted.asset = "0x0000000000000000000000000000000000000001"; }],
      ["PAYMENT_AMOUNT_MISMATCH", (value) => { value.accepted.amount = "999"; }],
      ["PAYMENT_RECIPIENT_MISMATCH", (value) => { value.accepted.payTo = "0x0000000000000000000000000000000000000001"; }],
      ["PAYMENT_TIMEOUT_MISMATCH", (value) => { value.accepted.maxTimeoutSeconds = 1; }],
      ["PAYMENT_GATEWAY_METADATA_MISMATCH", (value) => { value.accepted.extra.name = "USDC"; }],
      ["PAYMENT_VERIFYING_CONTRACT_MISMATCH", (value) => { value.accepted.extra.verifyingContract = "0x0000000000000000000000000000000000000001"; }],
    ];

    for (const [expected, mutate] of mutations) {
      const changed = structuredClone(payload) as any;
      mutate(changed);
      expect(() => assertCircleX402PaymentBinding(changed)).toThrow(expected);
    }
  });

  it("routes Arc x402 through durable claim, verify, prepare, settle and complete", () => {
    const route = read("src/routes/api.agent.risk.ts");
    for (const required of [
      "decodeCircleX402PaymentHeader",
      "assertCircleX402PaymentBinding",
      "claimAgentCommerceDelivery",
      "verifyCircleX402",
      "prepareAgentCommerceDelivery",
      "settleCircleX402",
      "completeAgentCommerceDelivery",
      "X402_PAYMENT_REPLAY_CONFLICT",
      "X402_SETTLEMENT_AMBIGUOUS",
      "idempotent_replay",
    ]) {
      expect(route, required).toContain(required);
    }

    const claim = route.indexOf("claimAgentCommerceDelivery");
    const verify = route.indexOf("verifyCircleX402(paymentPayload)");
    const prepare = route.indexOf("prepareAgentCommerceDelivery");
    const settle = route.indexOf("settleCircleX402(paymentPayload)");
    const complete = route.indexOf("completeAgentCommerceDelivery");
    expect(claim).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(claim);
    expect(prepare).toBeGreaterThan(verify);
    expect(settle).toBeGreaterThan(prepare);
    expect(complete).toBeGreaterThan(settle);
  });

  it("uses the provider-neutral commerce ledger to prevent replay and duplicate settlement", () => {
    const migration = read("supabase/migrations/934_agent_commerce_delivery_ledger.sql");
    expect(migration).toContain("payment_fingerprint_sha256 text not null");
    expect(migration).toContain("request_fingerprint_sha256 text not null");
    expect(migration).toContain("agent_commerce_payment_unique");
    expect(migration).toContain("'CONFLICT'::text");
    expect(migration).toContain("'REPLAY'::text");
    expect(migration).toContain("'MANUAL_REVIEW'::text");
    expect(migration).toContain("PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED");
  });

  it("locks the autonomous buyer harness to Arc Testnet, one bounded charge and sanitized evidence", () => {
    const script = read("scripts/agentic/agentic-testnet-acceptance-v1.mjs");
    for (const required of [
      'const ARC_NETWORK = "eip155:5042002"',
      'const EXPECTED_PRICE_ATOMIC = "1000"',
      "MAX_ABSOLUTE_TEST_SPEND_USDC = 0.01",
      "GatewayClient",
      "gateway.getBalances()",
      "gateway.deposit",
      "gateway.pay",
      "capturedPaymentSignature",
      "X402_PAYMENT_REPLAY_CONFLICT",
      "duplicate_charge_count = 0",
      'P0_15_canonical_no_human_acceptance_flow = "PASS"',
      "raw_payment_signature_persisted: false",
      "buyer_private_key_persisted: false",
    ]) {
      expect(script, required).toContain(required);
    }
    expect(script).not.toContain("I_ACCEPT_REAL_USDC");
  });
});

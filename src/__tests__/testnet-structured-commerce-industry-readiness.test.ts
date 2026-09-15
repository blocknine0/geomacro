import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalGrantPolicy } from "../lib/commercial-entitlement-policy";
import {
  COMMERCIAL_OFFER_REGISTRY,
  STRUCTURED_DATA_REGISTRY_VERSION,
  STRUCTURED_PRODUCT_REGISTRY,
  STRUCTURED_TIER_REGISTRY,
} from "../lib/structured-data-entitlement-registry";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const structuralRoute = read("server/api/commercial/structural.post.ts");
const payment = read("src/lib/testnet-api-payment.server.ts");
const delivery = read("src/lib/testnet-intelligence-service.server.ts");
const groPolicy = read("src/lib/commercial-risk-object-policy.ts");
const structuralContext = read("src/lib/structural-context.server.ts");
const coinbase = read("src/lib/coinbase-x402.server.ts");
const creditAtomicity = read("supabase/migrations/901_commercial_credit_idempotency_hardening.sql");
const paymentClaims = read("supabase/migrations/904_testnet_usdc_tester_access.sql");
const metered = read("supabase/migrations/912_testnet_api_pay_per_call.sql");
const opsLedger = read("supabase/migrations/902_commercial_ops_proof_ledger.sql");

describe("structured-commerce industry-readiness invariants", () => {
  it("keeps one canonical Testnet settlement service instead of route-local payment logic", () => {
    expect(structuralRoute).toContain("settleTestnetApiCall");
    expect(structuralRoute).not.toContain("verifyTestnetUsdcPayment");
    expect(structuralRoute).not.toContain("requireRiskSupabase");

    expect(payment).toContain("verifyTestnetUsdcPayment");
    expect(payment).toContain("minimum_amount_atomic: requiredAtomic");
    expect(payment).toContain("TESTNET_PAYER_WALLET_MISMATCH");
    expect(payment).toContain("TESTNET_PAYMENT_ALREADY_CLAIMED");
    expect(payment).toContain("TESTNET_PAYMENT_IDEMPOTENCY_CONFLICT");
    expect(payment).toContain("consumeCommercialCapability");
    expect(payment).toContain("recordCommercialPaymentEvent");
    expect(payment).toContain('revenue_classification: "testnet_non_revenue"');
    expect(payment).toContain("execution_authorized: false");
  });

  it("keeps credit debit and replay binding atomic at the database boundary", () => {
    expect(creditAtomicity).toContain("for update;");
    expect(creditAtomicity).toContain("IDEMPOTENCY_CONFLICT");
    expect(creditAtomicity).toContain("idempotent_replay");
    expect(creditAtomicity).toContain("update public.commercial_credit_accounts");
    expect(creditAtomicity).toContain("insert into public.commercial_credit_usage");

    expect(paymentClaims).toContain("unique (chain_id, tx_hash)");
    expect(paymentClaims).toContain("alter table public.testnet_usdc_payment_claims enable row level security");
    expect(paymentClaims).toContain("grant all on table public.testnet_usdc_payment_claims to service_role");
    expect(metered).toContain("testnet_usdc_payment_claim_principal_request_unique");
    expect(metered).toContain("on public.testnet_usdc_payment_claims (principal_id, request_id)");
  });

  it("keeps payment and usage proof ledgers uniquely reconciled and non-executing", () => {
    expect(opsLedger).toContain("commercial_payment_tx_unique");
    expect(opsLedger).toContain("on public.commercial_payment_events (network_name, tx_hash)");
    expect(opsLedger).toContain("commercial_payment_testnet_revenue_check");
    expect(opsLedger).toContain("commercial_payment_testnet_classification_check");
    expect(opsLedger).toContain("commercial_usage_request_unique");
    expect(opsLedger).toContain("commercial_usage_execution_boundary_check");
    expect(opsLedger).toContain("check (execution_authorized = false)");
  });

  it("versions structured delivery and never exposes raw/private warehouse data", () => {
    expect(structuralRoute).toContain('STRUCTURAL_RESPONSE_SCHEMA_VERSION = "geomacro-structural-intelligence-v1.0.0"');
    expect(structuralRoute).toContain("commercially_eligible_source_rows_only: true");
    expect(structuralRoute).toContain("raw_provider_payloads_included: false");
    expect(structuralRoute).toContain("raw_data_included: policy.product.raw_data_included");
    expect(structuralRoute).toContain("private_warehouse_access: policy.product.private_warehouse_access");
    expect(structuralRoute).toContain("execution_authorized: policy.product.execution_authorized");

    expect(structuralContext).toContain('from("commercial_structural_country_profiles")');
    expect(structuralContext).toContain('from("commercial_structural_country_coverage_latest")');
    expect(structuralContext).toContain('from("commercial_structural_corridor_latest")');
    expect(structuralContext).toContain("private warehouse");
  });

  it("requires commercial eligibility and embedded verification in addition to signature validity", () => {
    expect(groPolicy).toContain('object.commercial_eligibility.status === "VERIFIED"');
    expect(groPolicy).toContain('object.verification.status === "VERIFIED"');
    expect(groPolicy).toContain("publicVerification.cryptographic_valid");
    expect(groPolicy).toContain("commercial_eligibility_not_verified");
    expect(groPolicy).toContain("embedded_verification_not_verified");
    expect(delivery).toContain("SIGNED_RISK_OBJECT_NOT_COMMERCIALLY_DELIVERABLE");
    expect(delivery).toContain("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
  });

  it("keeps every structured product and tier non-executing and non-raw", () => {
    for (const policy of Object.values(STRUCTURED_PRODUCT_REGISTRY)) {
      expect(policy.execution_authorized).toBe(false);
      expect(policy.raw_data_included).toBe(false);
      expect(policy.private_warehouse_access).toBe(false);
      expect(policy.upstream_news_source_identity_exposed).toBe(false);
      expect(policy.structural_data_is_gri_v1_2_input).toBe(false);
    }

    for (const tier of Object.values(STRUCTURED_TIER_REGISTRY)) {
      expect(tier.execution_authorized).toBe(false);
      expect(tier.raw_data_access).toBe(false);
      expect(tier.private_warehouse_access).toBe(false);
      expect(tier.upstream_news_source_identity_exposed).toBe(false);
    }
  });

  it("narrows one-shot machine purchases to Risk Gate only and rejects registry drift", () => {
    expect(COMMERCIAL_OFFER_REGISTRY.machine_risk_preflight.one_shot_capability).toBe("risk_gate_bundle");

    const allowed = canonicalGrantPolicy({
      tier: "api_pilot",
      metadata: {
        offer_id: "machine_risk_preflight",
        structured_data_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
      },
      capability: "risk_gate_bundle",
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.entitlement_kind).toBe("one_shot");

    const widened = canonicalGrantPolicy({
      tier: "api_pilot",
      metadata: {
        offer_id: "machine_risk_preflight",
        structured_data_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
      },
      capability: "signed_risk_object",
    });
    expect(widened.allowed).toBe(false);
    expect(widened.code).toBe("ONE_SHOT_CAPABILITY_MISMATCH");

    const staleRegistry = canonicalGrantPolicy({
      tier: "api_pilot",
      metadata: {
        offer_id: "machine_risk_preflight",
        structured_data_registry_version: "structured-entitlements-stale",
      },
      capability: "risk_gate_bundle",
    });
    expect(staleRegistry.allowed).toBe(false);
    expect(staleRegistry.code).toBe("REGISTRY_VERSION_MISMATCH");
  });

  it("keeps Base mainnet x402 behind an explicit real-USDC acknowledgement", () => {
    expect(coinbase).toContain('COINBASE_X402_MAINNET_ACK = "I_ACCEPT_REAL_USDC"');
    expect(coinbase).toContain('rawEnvironment === "production"');
    expect(coinbase).toContain("Production x402 is locked");
    expect(coinbase).toContain("100 USDC safety cap");
  });
});

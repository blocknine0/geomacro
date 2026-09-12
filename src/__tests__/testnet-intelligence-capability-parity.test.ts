import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GEOMACRO_CREDIT_COSTS } from "../lib/commercial-access-contract";
import {
  STRUCTURED_TIER_REGISTRY,
} from "../lib/structured-data-entitlement-registry";
import {
  TESTNET_INTELLIGENCE_CAPABILITIES,
  TESTNET_INTELLIGENCE_PRICE_TABLE,
  testnetIntelligenceRequestSchema,
} from "../lib/testnet-intelligence-contract";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Testnet canonical intelligence capability parity", () => {
  it("exposes every Testnet entitlement capability through one shared contract", () => {
    expect([...TESTNET_INTELLIGENCE_CAPABILITIES].sort()).toEqual(
      [...STRUCTURED_TIER_REGISTRY.testnet_tester.included_capabilities].sort(),
    );
    expect(TESTNET_INTELLIGENCE_CAPABILITIES).toHaveLength(8);
  });

  it("prices every capability at 0.5 Testnet USDC per credit", () => {
    for (const capability of TESTNET_INTELLIGENCE_CAPABILITIES) {
      expect(TESTNET_INTELLIGENCE_PRICE_TABLE[capability].credits).toBe(
        GEOMACRO_CREDIT_COSTS[capability],
      );
      expect(TESTNET_INTELLIGENCE_PRICE_TABLE[capability].testnet_usdc).toBe(
        GEOMACRO_CREDIT_COSTS[capability] * 0.5,
      );
    }
  });

  it("validates query, global, country, corridor, signed-object and Risk Gate requests", () => {
    const examples = [
      {
        request_id: "req-query-0001",
        capability: "intelligence_query",
        question: "What geopolitical risk changed recently?",
      },
      {
        request_id: "req-gri-000001",
        capability: "gri_read",
        subject: { type: "global" },
      },
      {
        request_id: "req-country-001",
        capability: "structural_country_digest",
        subject: { type: "country", country_iso3: "IND" },
      },
      {
        request_id: "req-corridor-01",
        capability: "structural_corridor_profile",
        subject: {
          type: "corridor",
          origin_country_iso3: "IND",
          destination_country_iso3: "USA",
        },
      },
      {
        request_id: "req-gro-000001",
        capability: "signed_risk_object",
        subject: { type: "country", country_iso3: "USA" },
      },
      {
        request_id: "req-gate-00001",
        capability: "risk_gate_bundle",
        subject: { type: "country", country_iso3: "USA" },
        policy_preset: "balanced",
        action_type: "agent_payment",
      },
    ];

    for (const example of examples) {
      expect(testnetIntelligenceRequestSchema.safeParse(example).success).toBe(true);
    }
  });

  it("routes tester sessions and developer Key + Secret calls through the same delivery service", () => {
    const browserRoute = read("server/api/testnet-tester/intelligence.post.ts");
    const developerRoute = read("server/api/testnet/intelligence.post.ts");
    const auth = read("src/lib/commercial-access.server.ts");

    expect(browserRoute).toContain("deliverTestnetIntelligence");
    expect(browserRoute).toContain('access_surface: "testnet_tester"');
    expect(developerRoute).toContain("deliverTestnetIntelligence");
    expect(developerRoute).toContain('access_surface: "commercial_api"');
    expect(developerRoute).toContain("x-geomacro-api-key");
    expect(developerRoute).toContain("x-geomacro-api-secret");
    expect(auth).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
  });

  it("uses canonical intelligence services rather than a separate Testnet data store", () => {
    const runner = read("src/lib/testnet-intelligence-capability.server.ts");
    expect(runner).toContain("answerQuestion");
    expect(runner).toContain("readPublicGlobalRisk");
    expect(runner).toContain("loadStructuralContext");
    expect(runner).toContain("getLatestCompatibleCountryRiskObject");
    expect(runner).toContain("getLatestCompatibleCorridorRiskObject");
    expect(runner).toContain("evaluateCountryRiskGate");
    expect(runner).toContain("evaluateCorridorRiskGate");
    expect(runner).toContain("verifyPublicRiskObjectArtifact");
    expect(runner).not.toContain("sourceUrl: row.sourceUrl");
  });

  it("preserves corridor composition context in public Risk Object delivery", () => {
    const runner = read("src/lib/testnet-intelligence-capability.server.ts");
    expect(runner).toContain("corridor_context: object.corridor_context ?? null");
    expect(runner).toContain("risk_object: publicRiskObject(stored)");
    expect(runner).toContain("risk_object: publicRiskObject(object)");
  });

  it("requires per-call payment proof before credit consumption and protects replay", () => {
    const payment = read("src/lib/testnet-api-payment.server.ts");
    const migration = read("supabase/migrations/912_testnet_api_pay_per_call.sql");
    const hardening = read("supabase/migrations/913_testnet_pay_per_call_runtime_hardening.sql");

    expect(payment).toContain('payment_model: "pay_per_call"');
    expect(payment).toContain("verifyTestnetUsdcPayment");
    expect(payment).toContain("TESTNET_PAYER_WALLET_MISMATCH");
    expect(payment).toContain("TESTNET_PAYMENT_ALREADY_CLAIMED");
    expect(payment).toContain("consumeCommercialCapability");
    expect(payment).toContain("recordCommercialPaymentEvent");
    expect(payment).toContain("payment_event_id: paymentEventId");
    expect(migration).toContain("testnet_usdc_payment_claim_principal_request_unique");
    expect(migration).toContain("upfront_payment_required', false");
    expect(hardening).toContain("testnet_usdc_pay_per_call_shape_check");
    expect(hardening).toContain("trg_align_testnet_tester_grant_metadata");
  });

  it("retires the historical upfront activation RPC at the database boundary", () => {
    const hardening = read("supabase/migrations/913_testnet_pay_per_call_runtime_hardening.sql");
    expect(hardening).toContain("create or replace function public.activate_verified_testnet_usdc_pass");
    expect(hardening).toContain("TESTNET_UPFRONT_ACTIVATION_RETIRED");
    expect(hardening).toContain("from PUBLIC, anon, authenticated, service_role");
  });

  it("keeps machine delivery fail-closed, payment-linked and source-redacted", () => {
    const service = read("src/lib/testnet-intelligence-service.server.ts");
    const runner = read("src/lib/testnet-intelligence-capability.server.ts");

    expect(service).toContain("payment_event_id: settlement.payment.payment_event_id");
    expect(service).toContain("raw_data_included: false");
    expect(service).toContain("private_warehouse_access: false");
    expect(service).toContain("upstream_news_source_identity_exposed: false");
    expect(service).toContain("execution_authorized: false");
    expect(runner).toContain("upstream_source_urls_exposed: false");
    expect(runner).toContain("public_verification");
  });
});

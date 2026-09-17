import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/947_agent_commerce_production_reconciliation.sql",
  "utf8",
);
const coinbase = readFileSync("src/lib/coinbase-x402.server.ts", "utf8");
const adaptive = readFileSync("src/routes/api.x402.intelligence.ts", "utf8");
const legacy = readFileSync("src/routes/api.x402.risk.ts", "utf8");
const reconcile = readFileSync(
  "scripts/ops/reconcile-agent-commerce-payment.mjs",
  "utf8",
);

describe("production agent-commerce reconciliation contract", () => {
  it("supports Coinbase's mature ledger and the provider-neutral Circle/Nevermined ledger", () => {
    expect(migration).toContain("public.coinbase_x402_deliveries");
    expect(migration).toContain("public.agent_commerce_deliveries");
    expect(migration).toContain("coinbase_cdp_x402");
    expect(migration).toContain("circle_gateway_x402");
    expect(migration).toContain("nevermined_x402");
    expect(migration).toContain("response_sha256");
  });

  it("promotes revenue only after settled delivery and usage evidence match", () => {
    expect(migration).toContain("payment_status <> 'settled'");
    expect(migration).toContain("v_delivery_state <> 'delivered'");
    expect(migration).toContain("v_delivery_response_sha256 <> p_expected_response_sha256");
    expect(migration).toContain("buyer-observed delivered product hash does not match durable delivery payload");
    expect(migration).toContain("payment amount mismatch");
    expect(migration).toContain("payment recipient mismatch");
    expect(migration).toContain("payment payer mismatch");
    expect(migration).toContain("payment network mismatch");
    expect(migration).toContain("successful delivery usage evidence is missing");
    expect(migration).toContain("reconciliation_status = 'matched'");
    expect(migration).toContain("p_internal_canary boolean");
    expect(migration).toContain("when p_internal_canary then 'non_revenue_internal'");
    expect(migration).toContain("commercial_revenue = not p_internal_canary");
  });

  it("prevents the application service role from directly flipping revenue columns", () => {
    expect(migration).toContain(
      "revoke update (\n  reconciliation_status,\n  reconciliation_reference,\n  revenue_classification,\n  commercial_revenue\n) on table public.commercial_payment_events from service_role",
    );
    expect(migration).toContain("guard_agent_commerce_revenue_evidence");
    expect(migration).toContain("agent-commerce revenue promotion requires matched delivery evidence");
  });

  it("persists Coinbase response hashes before settlement and links payment to usage", () => {
    expect(coinbase).toContain('p_response_sha256: responseSha256');
    expect(coinbase).toContain("return { responseSha256 }");
    expect(coinbase).toContain("const paymentEventId = await recordCommercialPaymentEvent");
    expect(coinbase).toContain("await recordCommercialUsageEvent({");
    expect(coinbase).toContain("payment_event_id: paymentEventId");
    expect(coinbase).toContain("response_sha256: input.responseSha256");
    expect(adaptive).toContain("preparedResponseSha256 = preparedResult.responseSha256");
    expect(adaptive).toContain('capability: "adaptive_risk_intelligence_coinbase_x402"');
    expect(legacy).toContain("preparedResponseSha256 = preparedResult.responseSha256");
    expect(legacy).toContain('capability: "risk_preflight_coinbase_x402"');
  });

  it("keeps reconciliation a deliberate authoritative-production operation", () => {
    expect(reconcile).toContain("I_RECONCILE_VERIFIED_PRODUCTION_DELIVERY");
    expect(reconcile).toContain("GEOMACRO_RECONCILIATION_MODE");
    expect(reconcile).toContain('"internal_canary", "commercial_revenue"');
    expect(reconcile).toContain("ldpwajisioljyjtojvfx");
    expect(reconcile).toContain("reconcile_agent_commerce_payment");
    expect(reconcile).toContain("GEOMACRO_EXPECTED_DELIVERED_PRODUCT_HASH");
    expect(reconcile).toContain("Expected exactly one payment event for the observed settlement");
    expect(reconcile).toContain("Expected one unambiguous delivered response hash");
    expect(reconcile).toContain("settlement_reference_sha256");
    expect(reconcile).toContain("delivered_product_hash: expectedDeliveredProductHash");
    expect(reconcile).toContain("raw_settlement_reference_recorded_in_artifact: false");
    expect(reconcile).toContain("payer_identity_recorded_in_artifact: false");
  });
});

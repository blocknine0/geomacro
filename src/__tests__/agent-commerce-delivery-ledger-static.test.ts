import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/934_agent_commerce_delivery_ledger.sql", "utf8");
const service = readFileSync("src/lib/agent-commerce-delivery.server.ts", "utf8");
const neverminedRoute = readFileSync("src/routes/api.x402.nevermined_.intelligence.ts", "utf8");

describe("provider-neutral agent commerce delivery ledger", () => {
  it("is private, provider-scoped and replay-safe", () => {
    expect(migration).toContain("create table if not exists public.agent_commerce_deliveries");
    expect(migration).toContain("on public.agent_commerce_deliveries (provider, provider_environment, payment_fingerprint_sha256)");
    expect(migration).toContain("alter table public.agent_commerce_deliveries enable row level security");
    expect(migration).toContain("revoke all on table public.agent_commerce_deliveries from PUBLIC, anon, authenticated");
    expect(migration).toContain("grant all on table public.agent_commerce_deliveries to service_role");
    expect(migration).toContain("'CONFLICT'::text");
    expect(migration).toContain("'REPLAY'::text");
    expect(migration).toContain("'IN_PROGRESS'::text");
    expect(migration).toContain("'MANUAL_REVIEW'::text");
  });

  it("treats prepared state as the irreversible settlement boundary", () => {
    expect(migration).toContain("PREPARED means the exact payload was durably written immediately before an");
    expect(migration).toContain("PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED");
    expect(migration).toContain("state = 'manual_review'");
    expect(migration).toContain("d.state = 'prepared'");
    expect(migration).toContain("d.response_payload is not null");
    expect(migration).toContain("d.response_sha256 is not null");
  });

  it("hashes payer/recipient/payment references instead of persisting raw authorization material", () => {
    expect(service).toContain("commerceReferenceHash");
    expect(service).toContain("p_recipient_hash: commerceReferenceHash(input.recipientReference)");
    expect(service).toContain("p_payer_hash: commerceReferenceHash(input.payerReference)");
    expect(migration).not.toMatch(/payment_signature\s+text/i);
    expect(migration).not.toMatch(/access_token\s+text/i);
    expect(migration).not.toMatch(/private_key\s+text/i);
    expect(migration).not.toMatch(/api_key\s+text/i);
  });
});

describe("Nevermined settlement ordering", () => {
  it("checks source deliverability before issuing or settling a payment", () => {
    const initialAvailability = neverminedRoute.indexOf("checkAgentQueryDeliverability(plan");
    const paymentToken = neverminedRoute.indexOf('request.headers.get("payment-signature")');
    const settle = neverminedRoute.indexOf("settleNeverminedPermissions({");
    expect(initialAvailability).toBeGreaterThan(-1);
    expect(paymentToken).toBeGreaterThan(initialAvailability);
    expect(settle).toBeGreaterThan(paymentToken);
  });

  it("durably prepares the response before settlement and completes only after proven settlement", () => {
    const prepare = neverminedRoute.indexOf("prepareAgentCommerceDelivery({");
    const settle = neverminedRoute.indexOf("settleNeverminedPermissions({");
    const assess = neverminedRoute.indexOf("assessNeverminedSettlement(settlement)");
    const complete = neverminedRoute.indexOf("completeAgentCommerceDelivery({");
    const response = neverminedRoute.lastIndexOf("return json(final, 200");
    expect(prepare).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(prepare);
    expect(assess).toBeGreaterThan(settle);
    expect(complete).toBeGreaterThan(assess);
    expect(response).toBeGreaterThan(complete);
  });

  it("locks every post-settlement ambiguity against automatic recharge", () => {
    expect(neverminedRoute).toContain('manualReview: true');
    expect(neverminedRoute).toContain("NEVERMINED_SETTLEMENT_AMBIGUOUS");
    expect(neverminedRoute).toContain("NEVERMINED_SETTLEMENT_RECONCILIATION_REQUIRED");
    expect(neverminedRoute).toContain("POST_SETTLEMENT_RECONCILIATION_REQUIRED");
  });
});

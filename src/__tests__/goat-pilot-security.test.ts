import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  goatPilotCreateOrderSchema,
} from "../lib/goat-pilot-contract";


describe("GOAT partner-pilot security boundaries", () => {
  it("keeps price, token and provider terms server-owned", () => {
    const parsed = goatPilotCreateOrderSchema.parse({
      client_request_id: "partner-test-001",
      payer_address: "0x2222222222222222222222222222222222222222",
      subject: {
        type: "corridor",
        origin_country_iso3: "USA",
        destination_country_iso3: "CHN",
      },
      policy_preset: "cautious",
      action_type: "agent_payment",
      amount_wei: "1",
      token_contract: "0x3333333333333333333333333333333333333333",
      token_symbol: "EVIL",
      pay_to: "0x4444444444444444444444444444444444444444",
    });

    expect(parsed).not.toHaveProperty("amount_wei");
    expect(parsed).not.toHaveProperty("token_contract");
    expect(parsed).not.toHaveProperty("token_symbol");
    expect(parsed).not.toHaveProperty("pay_to");
  });

  it("requires separate bearer access and never reuses GOAT merchant credentials as pilot access", () => {
    const auth = readFileSync(
      "src/lib/goat-pilot-auth.server.ts",
      "utf8",
    );

    expect(auth).toContain("GOATX402_PILOT_ACCESS_TOKEN");
    expect(auth).not.toContain("GOATX402_API_SECRET");
    expect(auth).not.toContain("GOATX402_API_KEY");
    expect(auth).toContain("timingSafeEqual");
  });

  it("never delivers the prepared intelligence resource in the payment-required response", () => {
    const service = readFileSync(
      "src/lib/goat-pilot-service.server.ts",
      "utf8",
    );

    expect(service).toContain("resource_prepared: true");
    expect(service).toContain("resource_delivered: false");
    expect(service).toContain("resource: resource.payload");
    expect(service.indexOf("resource: resource.payload")).toBeGreaterThan(
      service.indexOf("async function deliveredResponse"),
    );
    expect(service).toContain("payment_required: true");
  });

  it("does not persist or return an unbounded provider raw response", () => {
    const flow = readFileSync(
      "src/lib/goat-flow.server.ts",
      "utf8",
    );
    const service = readFileSync(
      "src/lib/goat-pilot-service.server.ts",
      "utf8",
    );

    const challengeStart = flow.indexOf("export type GoatFlowPaymentChallenge");
    const challengeEnd = flow.indexOf("export type GoatFlowOrder", challengeStart);
    const challengeContract = flow.slice(challengeStart, challengeEnd);

    expect(challengeContract).not.toContain("raw:");
    expect(challengeContract).not.toContain("Record<string, unknown>");
    expect(service).toContain("const normalizedChallenge = providerChallenge;");
    expect(service).not.toContain("raw: _providerRaw");
    expect(service).not.toContain("provider_raw");
    expect(service).not.toContain("provider_response");
    expect(service).not.toContain("p_challenge: providerChallenge");
    expect(service).toContain("p_challenge: normalizedChallenge");
  });

  it("fails closed after an ambiguous external create-order attempt instead of submitting a second order", () => {
    const service = readFileSync(
      "src/lib/goat-pilot-service.server.ts",
      "utf8",
    );
    const migration = readFileSync(
      "supabase/migrations/012_agent_goat_order_lifecycle.sql",
      "utf8",
    );

    expect(service).toContain("mark_agent_goat_order_creation_attempted");
    expect(service).toContain("GOAT_ORDER_RECONCILIATION_REQUIRED");
    expect(service).not.toContain("release_agent_goat_order_creation");
    expect(migration).toContain("provider_creation_attempted_at IS NULL");
  });

  it("keeps prepared resource, challenge and final fulfillment immutable and service-role only", () => {
    const migration = readFileSync(
      "supabase/migrations/046_goat_partner_pilot_evidence.sql",
      "utf8",
    );

    expect(migration).toContain("agent_goat_pilot_resources");
    expect(migration).toContain("agent_goat_order_challenges");
    expect(migration).toContain("agent_goat_pilot_fulfillments");
    expect(migration).toContain("before update or delete");
    expect(migration).toContain("execution_authorized = false");
    expect(migration).toContain("from PUBLIC, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/delete\s+from\s+public\.agent_goat/i);
  });

  it("keeps GOAT partner pilot separated from Circle/Arc technical proof", () => {
    const orderRoute = readFileSync(
      "src/routes/api.goat.pilot.order.ts",
      "utf8",
    );
    const statusRoute = readFileSync(
      "src/routes/api.goat.pilot.status.ts",
      "utf8",
    );
    const service = readFileSync(
      "src/lib/goat-pilot-service.server.ts",
      "utf8",
    );

    for (const source of [orderRoute, statusRoute, service]) {
      expect(source).not.toContain("circle-x402");
      expect(source).not.toContain("CIRCLE_X402_SELLER_ADDRESS");
      expect(source).not.toContain("gateway-api-testnet.circle.com");
    }
  });

  it("keeps execution authorization false through order, pending and delivered responses", () => {
    const orderRoute = readFileSync(
      "src/routes/api.goat.pilot.order.ts",
      "utf8",
    );
    const statusRoute = readFileSync(
      "src/routes/api.goat.pilot.status.ts",
      "utf8",
    );
    const service = readFileSync(
      "src/lib/goat-pilot-service.server.ts",
      "utf8",
    );

    expect(orderRoute).toContain("execution_authorized: false");
    expect(statusRoute).toContain("execution_authorized: false");
    expect(service.match(/execution_authorized: false/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

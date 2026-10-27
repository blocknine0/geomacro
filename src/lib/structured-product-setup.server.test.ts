import { beforeEach, describe, it, expect, vi } from "vitest";
import { buildAgentQueryPlan } from "./agent-query-plan";
import { structuredProductSetup } from "./structured-product-setup";
import { resolveGeomacroCapabilityPrice } from "./capability-pricing-catalog";
const mocks = vi.hoisted(() => ({ check: vi.fn(), assemble: vi.fn() }));
vi.mock("./agent-query-deliverability.server", () => ({
  checkAgentQueryDeliverability: mocks.check,
  publicAgentQueryAvailability: (a: { deliverable: boolean; code: string }) => ({
    deliverable: a.deliverable,
    code: a.code,
  }),
}));
vi.mock("./agent-query-external-modules.server", () => ({
  checkAgentQueryExternalModule: vi.fn(),
}));
vi.mock("./capability-x402-offer.server", () => ({
  assembleVerifiedCapabilityProduct: mocks.assemble,
}));
import { checkStructuredProductSetup } from "./structured-product-setup.server";
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://geomacro.live/api/v1/intelligence/availability?view=setup", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const options = { rateLimit: () => true };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.check.mockImplementation(async (plan) => ({
    deliverable: true,
    code: "AVAILABLE",
    query_plan_hash: plan.query_plan_hash,
  }));
  mocks.assemble.mockImplementation(async ({ plan }) => ({
    price: resolveGeomacroCapabilityPrice(plan.product.capability, plan.product.variant),
    prepared: { execution_authorized: false, private_test_content: "never return this" },
  }));
});
describe("no-charge actual product preparation checks", () => {
  it.each(structuredProductSetup().products)(
    "checks $id without returning paid content",
    async (product) => {
      const response = await checkStructuredProductSetup(request(product.example_request), options);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("PRODUCT_PREPARED_PAYMENT_NOT_CHECKED");
      expect(body.price_usdc).toBe(product.price_usdc);
      expect(body.required_modules).toEqual(
        buildAgentQueryPlan(product.example_request).required_modules,
      );
      expect(body.prepared_product_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.required_fields_validated).toEqual(product.required_fields);
      expect(JSON.stringify(body)).not.toContain("never return this");
      for (const flag of [
        "chargeable",
        "payment_required_now",
        "payment_authorized",
        "settlement_attempted",
        "quote_issued",
        "customer_payload_returned",
        "execution_authorized",
      ])
        expect(body[flag]).toBe(false);
    },
  );
  it("does not assemble when data is missing", async () => {
    mocks.check.mockResolvedValue({ deliverable: false, code: "STALE_REQUIRED_DATA" });
    const response = await checkStructuredProductSetup(
      request(structuredProductSetup().products[0].example_request),
      options,
    );
    expect(response.status).toBe(422);
    expect(mocks.assemble).not.toHaveBeenCalled();
  });
  it("hides internal assembly failures and keeps payment closed", async () => {
    mocks.assemble.mockRejectedValue(Error("private publisher https://secret.test/raw"));
    const response = await checkStructuredProductSetup(
      request(structuredProductSetup().products[0].example_request),
      options,
    );
    expect(response.status).toBe(422);
    const text = await response.text();
    expect(text).not.toContain("secret.test");
    expect(text).not.toContain("publisher");
  });
  it("rejects payment headers, oversized JSON, implicit products and abusive checks before reading data", async () => {
    const example = structuredProductSetup().products[0].example_request;
    for (const header of ["payment-signature", "x-payment", "authorization"])
      expect(
        (await checkStructuredProductSetup(request(example, { [header]: "secret" }), options))
          .status,
      ).toBe(400);
    expect(
      (await checkStructuredProductSetup(request(example, { "content-length": "8193" }), options))
        .status,
    ).toBe(413);
    const { product, ...implicit } = example;
    expect((await checkStructuredProductSetup(request(implicit), options)).status).toBe(400);
    expect(
      (await checkStructuredProductSetup(request(example), { rateLimit: () => false })).status,
    ).toBe(429);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("keeps dependencies failing closed", async () => {
    mocks.check.mockRejectedValue(Error("internal"));
    expect(
      (
        await checkStructuredProductSetup(
          request(structuredProductSetup().products[0].example_request),
          options,
        )
      ).status,
    ).toBe(503);
    expect(mocks.assemble).not.toHaveBeenCalled();
  });
});

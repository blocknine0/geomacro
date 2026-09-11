import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goatPilotCreateOrderSchema } from "../lib/goat-pilot-contract";

const route = readFileSync("src/routes/api.goat.pilot.order.ts", "utf8");

const base = {
  client_request_id: "geomacro-spend-policy-01",
  payer_address: "0x2222222222222222222222222222222222222222",
  subject: {
    type: "corridor" as const,
    origin_country_iso3: "USA",
    destination_country_iso3: "CHN",
  },
  policy_preset: "cautious" as const,
  action_type: "agent_payment" as const,
};

describe("GOAT pilot spend-ceiling contract", () => {
  it("accepts a bounded positive atomic ceiling", () => {
    const parsed = goatPilotCreateOrderSchema.parse({
      ...base,
      max_payment_atomic: "100000",
    });
    expect(parsed.max_payment_atomic).toBe("100000");
  });

  it("rejects zero, negative, decimal and malformed ceilings", () => {
    for (const value of ["0", "-1", "1.5", "abc", "", "01"]) {
      expect(() => goatPilotCreateOrderSchema.parse({
        ...base,
        max_payment_atomic: value,
      })).toThrow();
    }
  });

  it("keeps the ceiling optional for existing pilot clients", () => {
    const parsed = goatPilotCreateOrderSchema.parse(base);
    expect(parsed.max_payment_atomic).toBeUndefined();
  });

  it("enforces the ceiling before prepareGoatPilotOrder", () => {
    const spendIndex = route.indexOf("spendPolicyFailure(input.max_payment_atomic)");
    const prepareIndex = route.indexOf("prepareGoatPilotOrder(input)");
    expect(spendIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeGreaterThan(spendIndex);
    expect(route).toContain("GOAT_AGENT_SPEND_LIMIT_EXCEEDED");
    expect(route).toContain("execution_authorized: false");
  });
});

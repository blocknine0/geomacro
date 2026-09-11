import { describe, expect, it } from "vitest";
import { evaluateGoatAgentSpend } from "../lib/goat-agent-spend-policy";

describe("GOAT autonomous-agent spend policy", () => {
  it("allows a price within both per-request and window limits", () => {
    expect(evaluateGoatAgentSpend({
      price_atomic: "100000",
      per_request_limit_atomic: "150000",
      spent_in_window_atomic: "300000",
      window_limit_atomic: "1000000",
    })).toMatchObject({
      allowed: true,
      reason: "WITHIN_LIMIT",
      remaining_window_atomic: "700000",
    });
  });

  it("blocks a price above the per-request limit before any execution stage", () => {
    expect(evaluateGoatAgentSpend({
      price_atomic: "150001",
      per_request_limit_atomic: "150000",
      spent_in_window_atomic: "0",
      window_limit_atomic: "1000000",
    })).toMatchObject({
      allowed: false,
      reason: "PER_REQUEST_LIMIT_EXCEEDED",
    });
  });

  it("blocks a price that would exceed the remaining window budget", () => {
    expect(evaluateGoatAgentSpend({
      price_atomic: "100001",
      per_request_limit_atomic: "150000",
      spent_in_window_atomic: "900000",
      window_limit_atomic: "1000000",
    })).toMatchObject({
      allowed: false,
      reason: "WINDOW_LIMIT_EXCEEDED",
      remaining_window_atomic: "100000",
    });
  });

  it("fails closed on malformed price and limits", () => {
    expect(evaluateGoatAgentSpend({
      price_atomic: "0",
      per_request_limit_atomic: "150000",
      spent_in_window_atomic: "0",
      window_limit_atomic: "1000000",
    }).reason).toBe("INVALID_PRICE");

    expect(evaluateGoatAgentSpend({
      price_atomic: "100000",
      per_request_limit_atomic: "abc",
      spent_in_window_atomic: "0",
      window_limit_atomic: "1000000",
    }).reason).toBe("INVALID_LIMIT");
  });

  it("fails closed when recorded window spend already exceeds its limit", () => {
    expect(evaluateGoatAgentSpend({
      price_atomic: "1",
      per_request_limit_atomic: "10",
      spent_in_window_atomic: "11",
      window_limit_atomic: "10",
    })).toMatchObject({
      allowed: false,
      reason: "INVALID_LIMIT",
    });
  });
});

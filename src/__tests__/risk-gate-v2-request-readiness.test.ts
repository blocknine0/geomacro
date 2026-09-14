import { describe, expect, it } from "vitest";

import {
  RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  type RiskGateV2Request,
} from "../lib/risk-gate-v2-contract";
import { evaluateRiskGateV2RequestReadiness } from "../lib/risk-gate-v2-request-readiness";

function baseRequest(): RiskGateV2Request {
  return {
    schema_version: RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
    request_id: "readiness-test",
    primary_subject: {
      type: "country",
      id: "IND",
    },
    exposures: [],
    action_context: {
      action_type: "investment_allocation_review",
      time_horizon: "days",
    },
    policy: {
      policy_id: "test-policy",
      policy_version: "1.0.0",
    },
  };
}

describe("Risk Gate v2 request readiness", () => {
  it("recognizes the currently supported country-review profile", () => {
    const result = evaluateRiskGateV2RequestReadiness(baseRequest());

    expect(result.ready_for_supported_module_evaluation).toBe(true);
    expect(result.fail_closed_required).toBe(false);
    expect(result.active_modules).toEqual(
      expect.arrayContaining([
        "geopolitical_security",
        "political_governance",
        "sovereign_fiscal",
        "macro_monetary",
      ]),
    );
    expect(result.unsupported_modules).toHaveLength(0);
  });

  it("does not overclaim a full cross-border payment profile", () => {
    const request: RiskGateV2Request = {
      ...baseRequest(),
      request_id: "cross-border-readiness-test",
      primary_subject: {
        type: "corridor",
        id: "IND>ARE",
      },
      exposures: [
        { type: "country", id: "IND", role: "origin" },
        { type: "country", id: "ARE", role: "destination" },
        { type: "currency", id: "USD", role: "settlement" },
      ],
      action_context: {
        action_type: "cross_border_payment",
        origin_country_iso3: "IND",
        destination_country_iso3: "ARE",
        currency: "USD",
        time_horizon: "immediate",
      },
    };

    const result = evaluateRiskGateV2RequestReadiness(request);

    expect(result.ready_for_supported_module_evaluation).toBe(false);
    expect(result.fail_closed_required).toBe(true);
    expect(result.unsupported_modules.map((item) => item.module)).toEqual(
      expect.arrayContaining([
        "geoeconomic_trade",
        "currency_capital_mobility",
        "banking_financial_system",
        "payments_treasury",
      ]),
    );
  });
});

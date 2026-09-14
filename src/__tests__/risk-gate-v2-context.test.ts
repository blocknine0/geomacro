import { describe, expect, it } from "vitest";

import {
  buildRiskGateV2ActivationPlan,
} from "../lib/risk-gate-v2-context";
import {
  RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  type RiskGateV2Request,
} from "../lib/risk-gate-v2-contract";

function request(
  patch: Partial<RiskGateV2Request> = {},
): RiskGateV2Request {
  return {
    schema_version: RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
    request_id: "rgv2-context-test",
    primary_subject: {
      type: "corridor",
      id: "IND>ARE",
    },
    exposures: [
      {
        type: "country",
        id: "IND",
        role: "origin",
      },
      {
        type: "country",
        id: "ARE",
        role: "destination",
      },
      {
        type: "currency",
        id: "USD",
        role: "settlement",
      },
    ],
    action_context: {
      action_type: "cross_border_payment",
      amount: 250000,
      currency: "USD",
      origin_country_iso3: "IND",
      destination_country_iso3: "ARE",
      sector: "financial_services",
      time_horizon: "immediate",
    },
    policy: {
      policy_id: "treasury-standard",
      policy_version: "1.0.0",
    },
    ...patch,
  };
}

describe("Risk Gate v2 context resolver", () => {
  it("activates risk modules from workflow, primary subject and exposures", () => {
    const plan = buildRiskGateV2ActivationPlan(request());

    expect(plan.active_modules).toEqual(
      expect.arrayContaining([
        "geopolitical_security",
        "geoeconomic_trade",
        "sovereign_fiscal",
        "macro_monetary",
        "currency_capital_mobility",
        "banking_financial_system",
        "payments_treasury",
        "supply_chain_logistics",
        "regulatory_legal",
      ]),
    );
    expect(plan.watch_modules).toContain("emerging_long_tail");
    expect(plan.activation_reasons.payments_treasury).toEqual(
      expect.arrayContaining([
        "action:cross_border_payment",
        "primary_subject:corridor",
      ]),
    );
  });

  it("activates route and chokepoint risk without making every module active", () => {
    const plan = buildRiskGateV2ActivationPlan(
      request({
        primary_subject: {
          type: "logistics_route",
          id: "route-demo",
        },
        exposures: [
          {
            type: "chokepoint",
            id: "chokepoint-demo",
            role: "route",
          },
        ],
        action_context: {
          action_type: "shipment_route_planning",
          time_horizon: "days",
        },
      }),
    );

    expect(plan.active_modules).toEqual(
      expect.arrayContaining([
        "geopolitical_security",
        "supply_chain_logistics",
        "energy_commodities",
        "climate_environment_hazard",
      ]),
    );
    expect(plan.active_modules.length).toBeLessThan(16);
  });

  it("promotes long-tail monitoring for autonomous-agent context", () => {
    const plan = buildRiskGateV2ActivationPlan(
      request({
        primary_subject: {
          type: "portfolio_exposure",
          id: "portfolio-demo",
        },
        exposures: [],
        action_context: {
          action_type: "autonomous_financial_agent_action",
          time_horizon: "immediate",
        },
      }),
    );

    expect(plan.active_modules).toContain("emerging_long_tail");
    expect(plan.watch_modules).not.toContain("emerging_long_tail");
    expect(plan.watch_modules).toContain("information_influence");
  });

  it("rejects malformed country context instead of normalizing arbitrary geography", () => {
    expect(() =>
      buildRiskGateV2ActivationPlan(
        request({
          action_context: {
            action_type: "cross_border_payment",
            origin_country_iso3: "India",
            destination_country_iso3: "ARE",
          },
        }),
      ),
    ).toThrow("ISO3");
  });

  it("rejects invalid negative amounts", () => {
    expect(() =>
      buildRiskGateV2ActivationPlan(
        request({
          action_context: {
            action_type: "cross_border_payment",
            amount: -1,
          },
        }),
      ),
    ).toThrow("non-negative");
  });
});

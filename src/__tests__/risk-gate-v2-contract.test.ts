import {
  describe,
  expect,
  it,
} from "vitest";

import {
  RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  RISK_GATE_V2_SCHEMA_VERSION,
  riskGateV2DisplayLabel,
  type RiskGateV2Request,
} from "../lib/risk-gate-v2-contract";
import {
  RISK_GATE_V2_ACTION_TYPES,
  RISK_GATE_V2_COVERAGE_STATES,
  RISK_GATE_V2_DEFAULT_ACTION_MODULES,
  RISK_GATE_V2_DRIVER_CATALOG,
  RISK_GATE_V2_MODULES,
  RISK_GATE_V2_SUBJECT_TYPES,
} from "../lib/risk-gate-v2-taxonomy";

describe("Risk Gate v2 commercial contract foundation", () => {
  it("keeps stable schema identifiers", () => {
    expect(RISK_GATE_V2_SCHEMA_VERSION).toBe("risk-gate-2.0");
    expect(RISK_GATE_V2_REQUEST_SCHEMA_VERSION).toBe(
      "risk-gate-request-2.0",
    );
  });

  it("maps machine decisions to plain-language commercial labels", () => {
    expect(riskGateV2DisplayLabel("CONTINUE")).toBe("CLEAR");
    expect(riskGateV2DisplayLabel("REDUCE_LIMIT")).toBe("CAUTION");
    expect(riskGateV2DisplayLabel("REQUIRE_APPROVAL")).toBe("REVIEW");
    expect(riskGateV2DisplayLabel("PAUSE")).toBe("HOLD");
  });

  it("includes global subject, workflow, coverage and risk-module foundations", () => {
    expect(RISK_GATE_V2_SUBJECT_TYPES).toEqual(
      expect.arrayContaining([
        "country",
        "corridor",
        "chokepoint",
        "logistics_route",
        "currency_pair",
        "counterparty_exposure",
        "portfolio_exposure",
        "event",
      ]),
    );
    expect(RISK_GATE_V2_ACTION_TYPES).toEqual(
      expect.arrayContaining([
        "cross_border_payment",
        "treasury_transfer",
        "fx_conversion",
        "lending_credit_exposure",
        "supply_chain_sourcing",
        "autonomous_financial_agent_action",
      ]),
    );
    expect(RISK_GATE_V2_COVERAGE_STATES).toEqual([
      "FULL",
      "PARTIAL",
      "LIMITED",
      "INSUFFICIENT",
    ]);
    expect(RISK_GATE_V2_MODULES.length).toBeGreaterThanOrEqual(16);
    expect(
      RISK_GATE_V2_DRIVER_CATALOG.emerging_long_tail,
    ).toContain("critical_cable_outage");
  });

  it("activates context-specific module sets for common commercial workflows", () => {
    expect(
      RISK_GATE_V2_DEFAULT_ACTION_MODULES.cross_border_payment,
    ).toEqual(
      expect.arrayContaining([
        "geoeconomic_trade",
        "currency_capital_mobility",
        "payments_treasury",
      ]),
    );
    expect(
      RISK_GATE_V2_DEFAULT_ACTION_MODULES.supply_chain_sourcing,
    ).toEqual(
      expect.arrayContaining([
        "supply_chain_logistics",
        "energy_commodities",
        "climate_environment_hazard",
      ]),
    );
  });

  it("supports a country-to-country commercial request without changing execution authority", () => {
    const request: RiskGateV2Request = {
      schema_version: RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
      request_id: "rgv2-example",
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
    };

    expect(request.primary_subject.type).toBe("corridor");
    expect(request.exposures).toHaveLength(3);
  });
});

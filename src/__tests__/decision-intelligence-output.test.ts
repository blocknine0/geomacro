import { describe, expect, it } from "vitest";
import { buildDecisionIntelligence } from "../lib/decision-intelligence-output";

describe("Geomacro decision intelligence output", () => {
  it("returns concise derived decision intelligence without raw data", () => {
    const result = buildDecisionIntelligence({
      subject: { type: "corridor", origin_country_iso3: "IND", destination_country_iso3: "ARE" },
      state_version: "gstate_test",
      risk: {
        score: 56.4,
        label: "MODERATE",
        previous_score: 49.9,
        delta: 6.5,
        direction: "escalating",
      },
      confidence: 0.91,
      observed_at: "2026-09-28T05:00:00.000Z",
      attribution: [
        { driver: "FX pressure", delta_contribution: 4.1 },
        { driver: "energy import exposure", delta_contribution: 1.7 },
      ],
      structural: {
        available_dimensions: ["external_fx", "macro_monetary"],
        latest_observed_at: "2026-09-28T05:00:00.000Z",
      },
      live: {
        current_event_signal: true,
        event_count: 2,
        checked_at: "2026-09-28T05:15:00.000Z",
      },
      risk_gate_decision: null,
      as_of: "2026-09-28T05:30:00.000Z",
    });

    expect(result.schema_version).toBe("geomacro.decision-intelligence.v1");
    expect(result.decision.action).toBe("PROCEED_WITH_GUARDRAILS");
    expect(result.cause.startsWith("Geomacro detects this because")).toBe(true);
    expect(result.geomacro_detected[0]).toContain("FX pressure");
    expect(result.change.material_change).toBe(true);
    expect(result.watch_next).toEqual(["FX pressure", "energy import exposure"]);
    expect(result.market_watch.schema_version).toBe("geomacro.paid-market-watch.v1");
    expect(result.market_watch.items.some(x=>x.market==="Foreign-exchange rates")).toBe(true);
    expect(result.market_watch.items.every(x=>x.current_market_price===null && x.predicted_direction==="NOT_ESTABLISHED")).toBe(true);
    expect(result.market_watch.monitoring.requery_when).toBe("NEW_QUALIFIED_EVIDENCE_OR_STATE_VERSION_CHANGE");
    expect(result.raw_data_delivered).toBe(false);
    expect(result.execution_authorized).toBe(false);
    expect(result.delivery_boundary).toBe("DERIVED_DECISION_INTELLIGENCE_ONLY");
  });

  it("fails closed when verified decision-grade state is missing", () => {
    const result = buildDecisionIntelligence({
      subject: { type: "country", country_iso3: "IND" },
      state_version: null,
      risk: null,
      confidence: null,
      observed_at: null,
      attribution: [],
      structural: null,
      live: null,
      risk_gate_decision: null,
      as_of: "2026-09-28T05:30:00.000Z",
    });

    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.market_watch.status).toBe("NO_QUALIFIED_MARKET_LINKAGE");
    expect(result.market_watch.items).toEqual([]);
    expect(result.decision.action).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.decision.guardrail).toContain("Do not charge or act");
    expect(result.raw_data_delivered).toBe(false);
  });

  it("maps low risk to proceed and high risk to review", () => {
    const low = buildDecisionIntelligence({
      subject: { type: "country", country_iso3: "SGP" },
      state_version: "gstate_low",
      risk: { score: 18, label: "LOW", delta: -1.2, direction: "cooling" },
      confidence: 0.94,
      observed_at: "2026-09-28T05:20:00.000Z",
      attribution: [{ driver: "lower event pressure", delta_contribution: -1.2 }],
      structural: { available_dimensions: ["macro_monetary"], latest_observed_at: "2026-09-28T05:20:00.000Z" },
      live: { current_event_signal: false, event_count: 0, checked_at: "2026-09-28T05:25:00.000Z" },
      risk_gate_decision: null,
      as_of: "2026-09-28T05:30:00.000Z",
    });
    const high = buildDecisionIntelligence({
      subject: { type: "country", country_iso3: "TST" },
      state_version: "gstate_high",
      risk: { score: 78, label: "HIGH", delta: 9.4, direction: "escalating" },
      confidence: 0.88,
      observed_at: "2026-09-28T05:20:00.000Z",
      attribution: [{ driver: "geopolitical escalation", delta_contribution: 9.4 }],
      structural: { available_dimensions: ["geopolitical_security"], latest_observed_at: "2026-09-28T05:20:00.000Z" },
      live: { current_event_signal: true, event_count: 3, checked_at: "2026-09-28T05:25:00.000Z" },
      risk_gate_decision: null,
      as_of: "2026-09-28T05:30:00.000Z",
    });

    expect(low.decision.action).toBe("PROCEED");
    expect(high.decision.action).toBe("REVIEW");
  });
});

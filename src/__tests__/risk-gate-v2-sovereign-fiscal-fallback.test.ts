import { describe, expect, it } from "vitest";

import type { RiskGateV2ModuleStateInput } from "../lib/risk-gate-v2-engine";
import { composeRiskGateV2MacroStatesWithFiscalFallback } from "../lib/risk-gate-v2-sovereign-fiscal-fallback";

function state(
  module: RiskGateV2ModuleStateInput["module"],
  methodology: string,
): RiskGateV2ModuleStateInput {
  return {
    module_state_id: `test:${module}:${methodology}`,
    module,
    score: 30,
    previous_score: null,
    delta: null,
    confidence: 0.9,
    coverage: "LIMITED",
    commercial_eligibility_status: "VERIFIED",
    generated_at: "2026-09-14T00:00:00.000Z",
    expires_at: "2026-09-15T00:00:00.000Z",
    methodology_version: methodology,
    risk_object_ids: [],
    drivers: [],
  };
}

describe("sovereign fiscal fallback composition", () => {
  it("preserves WDI fiscal precedence and does not append Eurostat", () => {
    const macro = state("macro_monetary", "wdi-macro");
    const wdiFiscal = state("sovereign_fiscal", "wdi-fiscal");
    const eurostatFiscal = state("sovereign_fiscal", "eurostat-fiscal");

    const result = composeRiskGateV2MacroStatesWithFiscalFallback({
      base_states: [macro, wdiFiscal],
      fallback_sovereign_fiscal: eurostatFiscal,
    });

    expect(result).toHaveLength(2);
    expect(result.find((item) => item.module === "sovereign_fiscal")?.methodology_version)
      .toBe("wdi-fiscal");
  });

  it("appends Eurostat only when sovereign fiscal is absent", () => {
    const macro = state("macro_monetary", "wdi-macro");
    const eurostatFiscal = state("sovereign_fiscal", "eurostat-fiscal");

    const result = composeRiskGateV2MacroStatesWithFiscalFallback({
      base_states: [macro],
      fallback_sovereign_fiscal: eurostatFiscal,
    });

    expect(result.map((item) => item.module)).toEqual([
      "macro_monetary",
      "sovereign_fiscal",
    ]);
    expect(result[1]?.methodology_version).toBe("eurostat-fiscal");
  });

  it("rejects a non-fiscal fallback", () => {
    expect(() =>
      composeRiskGateV2MacroStatesWithFiscalFallback({
        base_states: [],
        fallback_sovereign_fiscal: state("macro_monetary", "wrong"),
      }),
    ).toThrow("Fiscal fallback must provide sovereign_fiscal");
  });

  it("rejects duplicate base modules", () => {
    expect(() =>
      composeRiskGateV2MacroStatesWithFiscalFallback({
        base_states: [
          state("macro_monetary", "a"),
          state("macro_monetary", "b"),
        ],
        fallback_sovereign_fiscal: null,
      }),
    ).toThrow("Duplicate Risk Gate v2 module state: macro_monetary");
  });
});

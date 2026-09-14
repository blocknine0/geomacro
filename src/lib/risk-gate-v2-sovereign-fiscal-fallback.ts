import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

/**
 * Compose macro-derived Risk Gate states with a concept-isolated sovereign
 * fiscal fallback. Existing WDI sovereign_fiscal always wins. Eurostat is used
 * only when the WDI fiscal state is absent, so raw values and peer universes
 * are never blended and duplicate fiscal states cannot enter the engine.
 */
export function composeRiskGateV2MacroStatesWithFiscalFallback(input: {
  base_states: RiskGateV2ModuleStateInput[];
  fallback_sovereign_fiscal: RiskGateV2ModuleStateInput | null;
}) {
  const seen = new Set<string>();
  for (const state of input.base_states) {
    if (seen.has(state.module)) {
      throw new Error(`Duplicate Risk Gate v2 module state: ${state.module}`);
    }
    seen.add(state.module);
  }

  const fallback = input.fallback_sovereign_fiscal;
  if (!fallback || seen.has("sovereign_fiscal")) {
    return [...input.base_states];
  }

  if (fallback.module !== "sovereign_fiscal") {
    throw new Error("Fiscal fallback must provide sovereign_fiscal");
  }

  return [...input.base_states, fallback];
}

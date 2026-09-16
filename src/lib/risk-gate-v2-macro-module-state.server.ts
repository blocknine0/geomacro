import { generateCountryMacroRiskComponent } from "./country-risk-v02-macro.server";
import { generateRiskGateV2EurostatSovereignFiscalModuleState } from "./risk-gate-v2-eurostat-sovereign-fiscal.server";
import { generateRiskGateV2WorldBankPpgSovereignFiscalModuleState } from "./risk-gate-v2-world-bank-ppg-sovereign-fiscal.server";
import { buildRiskGateV2SupportedMacroStates } from "./risk-gate-v2-macro-module-state";
import { composeRiskGateV2MacroStatesWithFiscalFallback } from "./risk-gate-v2-sovereign-fiscal-fallback";

type CountryMacroStateInput = {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
};

/**
 * Produce only the governed World Bank-backed macro/fiscal states. This export
 * exists so pre-promotion shadow validation can reproduce the WDI baseline
 * without touching production fallback layers.
 */
export async function generateCountryRiskGateV2WdiMacroModuleStates(
  input: CountryMacroStateInput,
) {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const component = await generateCountryMacroRiskComponent({
    country_iso3: input.country_iso3,
    as_of: input.as_of,
  });

  return buildRiskGateV2SupportedMacroStates({
    component,
    generated_at: generatedAt,
    commercial_eligibility_status: "VERIFIED",
    risk_object_ids: input.risk_object_ids,
  });
}

/**
 * Production adapter for the supported Risk Gate v2 macro/fiscal modules.
 *
 * Fiscal precedence is deliberately concept-isolated:
 *   1. World Bank WDI central-government debt (existing primary method)
 *   2. Eurostat general-government debt where its governed release is present
 *   3. World Bank PPG external-debt-stock pressure where an exact clean PPG/GNI
 *      production manifest is present
 *
 * These concepts are never raw-value pooled or placed into one peer universe.
 * Each fallback must independently satisfy its source gate, exact provenance,
 * freshness and fixed >=20 comparable-peer requirement.
 */
export async function generateCountryRiskGateV2MacroModuleStates(
  input: CountryMacroStateInput,
) {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const baseStates = await generateCountryRiskGateV2WdiMacroModuleStates({
    ...input,
    generated_at: generatedAt,
  });

  if (baseStates.some((state) => state.module === "sovereign_fiscal")) {
    return baseStates;
  }

  let eurostatFiscal = null;
  try {
    eurostatFiscal =
      await generateRiskGateV2EurostatSovereignFiscalModuleState({
        country_iso3: input.country_iso3,
        as_of: input.as_of,
        generated_at: generatedAt,
        risk_object_ids: input.risk_object_ids,
      });
  } catch (error) {
    // Before migration 925, the Eurostat source is deliberately scoring-disabled.
    // Treat only that exact activation boundary as "fallback unavailable". Any
    // provider/database/schema error still propagates and fails closed.
    if (
      !(
        error instanceof Error &&
        error.message === "Eurostat source-state mismatch for production scoring"
      )
    ) {
      throw error;
    }
  }

  if (eurostatFiscal) {
    return composeRiskGateV2MacroStatesWithFiscalFallback({
      base_states: baseStates,
      fallback_sovereign_fiscal: eurostatFiscal,
    });
  }

  const ppgFiscal =
    await generateRiskGateV2WorldBankPpgSovereignFiscalModuleState({
      country_iso3: input.country_iso3,
      as_of: input.as_of,
      generated_at: generatedAt,
      risk_object_ids: input.risk_object_ids,
    });

  return composeRiskGateV2MacroStatesWithFiscalFallback({
    base_states: baseStates,
    fallback_sovereign_fiscal: ppgFiscal,
  });
}

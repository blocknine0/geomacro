import { generateCountryMacroRiskComponent } from "./country-risk-v02-macro.server";
import { generateRiskGateV2EurostatSovereignFiscalModuleState } from "./risk-gate-v2-eurostat-sovereign-fiscal.server";
import { buildRiskGateV2SupportedMacroStates } from "./risk-gate-v2-macro-module-state";
import { composeRiskGateV2MacroStatesWithFiscalFallback } from "./risk-gate-v2-sovereign-fiscal-fallback";
import { generateRiskGateV2WdiPpgSovereignFiscalModuleState } from "./risk-gate-v2-wdi-ppg-sovereign-fiscal.server";

type CountryMacroStateInput = {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
};

/**
 * Produce only the governed World Bank-backed macro/fiscal states. This export
 * exists so pre-promotion shadow validation can reproduce the WDI baseline
 * without touching a production fallback whose source gate is intentionally
 * still disabled at that stage.
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
 * World Bank WDI remains the primary source. If its governed central-government
 * debt peer universe cannot produce sovereign_fiscal, Eurostat may supply a
 * separate general-government-debt fiscal state only after its own production
 * source gate, clean release manifest and >=20 concept-consistent peers pass.
 * The two debt concepts are never merged into one raw-value or peer universe.
 *
 * The new WDI public-and-publicly-guaranteed debt-service candidate is NOT
 * wired into this production path until the shadow census proves coverage,
 * freshness and behavior across the authoritative sovereign registry.
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
    // Treat only that exact activation boundary as "fallback unavailable" so
    // validation can continue from the WDI base. Any provider/database/schema
    // error still propagates and fails closed rather than being hidden.
    if (
      !(error instanceof Error) ||
      error.message !== "Eurostat source-state mismatch for production scoring"
    ) {
      throw error;
    }
  }

  return composeRiskGateV2MacroStatesWithFiscalFallback({
    base_states: baseStates,
    fallback_sovereign_fiscal: eurostatFiscal,
  });
}

/**
 * Shadow-only candidate path for the WDI public-and-publicly-guaranteed
 * external debt-service burden. The production adapter above deliberately does
 * not call this function. It exists so an authoritative production-data census
 * can prove the candidate before a separate promotion change.
 */
export async function auditCountryRiskGateV2MacroModuleStatesWithWdiPpgFallback(
  input: CountryMacroStateInput,
) {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const productionStates = await generateCountryRiskGateV2MacroModuleStates({
    ...input,
    generated_at: generatedAt,
  });

  if (productionStates.some((state) => state.module === "sovereign_fiscal")) {
    return productionStates;
  }

  const ppgFiscal = await generateRiskGateV2WdiPpgSovereignFiscalModuleState({
    country_iso3: input.country_iso3,
    as_of: input.as_of,
    generated_at: generatedAt,
    risk_object_ids: input.risk_object_ids,
  });

  return composeRiskGateV2MacroStatesWithFiscalFallback({
    base_states: productionStates,
    fallback_sovereign_fiscal: ppgFiscal,
  });
}

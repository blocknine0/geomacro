import { generateCountryMacroRiskComponent } from "./country-risk-v02-macro.server";
import { buildRiskGateV2SupportedMacroStates } from "./risk-gate-v2-macro-module-state";

/**
 * Server-only production adapter for the first supported Risk Gate v2 modules.
 *
 * `generateCountryMacroRiskComponent` is already fail-closed to external sources
 * where ingestion + commercial signals are enabled, source status is
 * COMMERCIAL_OK, and normalized observations are both quality VERIFIED and
 * commercial-eligibility VERIFIED. This wrapper may therefore mark these
 * derived module states VERIFIED without bypassing the existing source gate.
 */
export async function generateCountryRiskGateV2MacroModuleStates(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const component = await generateCountryMacroRiskComponent({
    country_iso3: input.country_iso3,
    as_of: input.as_of,
  });

  return buildRiskGateV2SupportedMacroStates({
    component,
    generated_at: input.generated_at ?? new Date().toISOString(),
    commercial_eligibility_status: "VERIFIED",
    risk_object_ids: input.risk_object_ids,
  });
}

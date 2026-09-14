import { generateCountryGeopoliticalRiskComponent } from "./country-risk-v02-geopolitics-component.server";
import { buildRiskGateV2SocietalModuleState } from "./risk-gate-v2-societal-module-state";

export async function generateRiskGateV2SocietalModuleState(input: {
  country_iso3: string;
  as_of: string;
  previous_as_of?: string | null;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const component = await generateCountryGeopoliticalRiskComponent({
    country_iso3: input.country_iso3,
    as_of: input.as_of,
  });

  const previous = input.previous_as_of
    ? await generateCountryGeopoliticalRiskComponent({
        country_iso3: input.country_iso3,
        as_of: input.previous_as_of,
      })
    : null;

  // The underlying UNHCR and World Bank population observations are admitted
  // into this component only when quality/commercial eligibility are VERIFIED.
  return buildRiskGateV2SocietalModuleState({
    component,
    previous_component: previous,
    generated_at: input.generated_at ?? new Date().toISOString(),
    commercial_eligibility_status: "VERIFIED",
    risk_object_ids: input.risk_object_ids,
  });
}

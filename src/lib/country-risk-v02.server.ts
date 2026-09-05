import {
  dryRunCountryRiskObject,
} from "./country-risk-publisher.server";

import {
  generateCountryMacroRiskComponent,
} from "./country-risk-v02-macro.server";

import {
  generateCountryGeopoliticalRiskComponent,
} from "./country-risk-v02-geopolitics-component.server";

import {
  getLatestCountryIntelligenceState,
} from "./country-intelligence-state-store.server";

import {
  buildCountryRiskV02Context,
} from "./country-risk-v02-cis-engine";

import {
  buildCountryRiskV02IntegratedObject,
} from "./country-risk-v02-object";


export async function
dryRunCountryRiskV02(
  input: {
    country_iso3:
      string;

    country_name?:
      string | null;

    as_of:
      string;
  },
) {
  const base =
    await dryRunCountryRiskObject({
      country_iso3:
        input.country_iso3,

      country_name:
        input.country_name ??
        null,

      as_of:
        input.as_of,
    });


  const cis =
    await getLatestCountryIntelligenceState(
      input.country_iso3,
      input.as_of,
    );


  if (!cis) {
    throw new Error(
      `No CIS found for ${input.country_iso3}`,
    );
  }


  const macro =
    await generateCountryMacroRiskComponent({
      country_iso3:
        input.country_iso3,

      as_of:
        input.as_of,
    });


  const geopolitics =
    await generateCountryGeopoliticalRiskComponent({
      country_iso3:
        input.country_iso3,

      as_of:
        input.as_of,
    });


  const cisContext =
    buildCountryRiskV02Context(
      cis,
    );


  const object =
    buildCountryRiskV02IntegratedObject({
      base_event_object:
        base.object,

      macro_component:
        macro,

      geopolitics_component:
        geopolitics,

      cis_context:
        cisContext,
    });


  return {
    object,

    context: {
      country_iso3:
        input.country_iso3,

      base_object:
        base.object,

      base_object_id:
        base.object.object_id,

      cis_state_id:
        cis.state_id,

      macro_hash:
        macro.calculation_hash,

      published:
        false,
    },
  };
}

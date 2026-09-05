import {
  generateGlobalGeopoliticalNormalization,
} from "./country-risk-v02-geopolitics-normalization.server";

import {
  buildCountryGeopoliticalRiskComponent,
} from "./country-risk-v02-geopolitics-component";

import type {
  GeopoliticalMetricKey,
  GeopoliticalNormalizationSnapshot,
} from "./country-risk-v02-geopolitics-contract";


const METRICS:
  GeopoliticalMetricKey[] = [
    "forced_displacement_total",
    "refugees_origin",
    "asylum_seekers_origin",
    "internally_displaced",
    "stateless_population",
  ];


export async function
generateCountryGeopoliticalRiskComponent(
  input: {
    country_iso3:
      string;

    as_of:
      string;
  },
) {
  const snapshots:
    Partial<
      Record<
        GeopoliticalMetricKey,
        GeopoliticalNormalizationSnapshot
      >
    > = {};


  for (
    const metric of
      METRICS
  ) {
    try {
      snapshots[
        metric
      ] =
        await generateGlobalGeopoliticalNormalization({
          metric,

          as_of:
            input.as_of,
        });
    }
    catch (
      error
    ) {
      console.log({
        metric,
        unavailable:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }


  return buildCountryGeopoliticalRiskComponent({
    country_iso3:
      input.country_iso3,

    as_of:
      input.as_of,

    snapshots,
  });
}

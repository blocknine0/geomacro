import {
  generateGlobalMacroNormalization,
} from "./country-risk-v02-normalization.server";

import {
  buildCountryMacroRiskComponent,
} from "./country-risk-v02-macro";

import type {
  MacroDimensionKey,
} from "./country-risk-v02-macro-contract";


const METRICS:
  Record<
    MacroDimensionKey,
    string
  > = {
  inflation:
    "inflation_consumer_prices_annual_pct",

  growth:
    "real_gdp_growth_annual_pct",

  unemployment:
    "unemployment_total_pct",

  government_debt:
    "central_government_debt_pct_gdp",
};


export async function
generateCountryMacroRiskComponent(
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
        MacroDimensionKey,
        Awaited<
          ReturnType<
            typeof generateGlobalMacroNormalization
          >
        >
      >
    > = {};

  for (
    const [
      key,
      metric,
    ] of Object.entries(
      METRICS,
    ) as [
      MacroDimensionKey,
      string,
    ][]
  ) {
    snapshots[key] =
      await generateGlobalMacroNormalization({
        metric,
        as_of:
          input.as_of,
      });
  }

  return buildCountryMacroRiskComponent({
    country_iso3:
      input.country_iso3,

    as_of:
      input.as_of,

    snapshots,
  });
}

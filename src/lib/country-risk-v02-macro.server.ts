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


export function isExpectedSparseWdiDebtCoverageError(
  key: MacroDimensionKey,
  metric: string,
  error: unknown,
) {
  if (key !== "government_debt" || !(error instanceof Error)) {
    return false;
  }

  const prefix = `Insufficient peer coverage for ${metric}: `;
  if (!error.message.startsWith(prefix)) {
    return false;
  }

  const peerCount = Number(error.message.slice(prefix.length));
  return Number.isInteger(peerCount) && peerCount >= 0 && peerCount < 20;
}


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
    try {
      snapshots[key] =
        await generateGlobalMacroNormalization({
          metric,
          as_of:
            input.as_of,
        });
    } catch (error) {
      // The World Bank central-government-debt series has a materially smaller
      // current peer universe than the three macro-monetary dimensions. A
      // sparse debt peer set must make only sovereign_fiscal unavailable. It
      // must not erase otherwise valid inflation/growth/unemployment states.
      // Any provider, rights, schema or database error still propagates and
      // fails closed.
      if (
        isExpectedSparseWdiDebtCoverageError(
          key,
          metric,
          error,
        )
      ) {
        continue;
      }

      throw error;
    }
  }

  return buildCountryMacroRiskComponent({
    country_iso3:
      input.country_iso3,

    as_of:
      input.as_of,

    snapshots,
  });
}

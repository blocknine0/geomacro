import {
  createHash,
} from "node:crypto";

import {
  COUNTRY_RISK_V02_MACRO_METHOD_VERSION,
  type CountryMacroRiskComponent,
  type MacroDimensionKey,
  type MacroDimensionResult,
} from "./country-risk-v02-macro-contract";

import type {
  MacroNormalizationSnapshot,
  NormalizedRiskSignal,
} from "./country-risk-v02-normalization-contract";


type DimensionDefinition = {
  key:
    MacroDimensionKey;

  metric:
    string;

  base_weight:
    number;

  minimum_peer_count:
    number;
};


const DIMENSIONS:
  readonly DimensionDefinition[] = [
  {
    key:
      "inflation",

    metric:
      "inflation_consumer_prices_annual_pct",

    base_weight:
      0.25,

    minimum_peer_count:
      100,
  },

  {
    key:
      "growth",

    metric:
      "real_gdp_growth_annual_pct",

    base_weight:
      0.25,

    minimum_peer_count:
      100,
  },

  {
    key:
      "unemployment",

    metric:
      "unemployment_total_pct",

    base_weight:
      0.25,

    minimum_peer_count:
      100,
  },

  {
    key:
      "government_debt",

    metric:
      "central_government_debt_pct_gdp",

    base_weight:
      0.25,

    minimum_peer_count:
      100,
  },
];


function canonicalize(
  value: unknown,
): unknown {
  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      )
        .sort(
          ([a], [b]) =>
            a.localeCompare(b),
        )
        .map(
          ([key, item]) => [
            key,
            canonicalize(item),
          ],
        ),
    );
  }

  return value;
}


function hashJson(
  value: unknown,
) {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        canonicalize(value),
      ),
    )
    .digest("hex");
}


function round(
  value: number,
  places = 6,
) {
  const factor =
    10 ** places;

  return Math.round(
    (value + Number.EPSILON) *
      factor,
  ) / factor;
}


function signalForCountry(
  snapshot:
    MacroNormalizationSnapshot | null,
  countryIso3:
    string,
): NormalizedRiskSignal | null {
  if (!snapshot) {
    return null;
  }

  return (
    snapshot.signals.find(
      signal =>
        signal.country_iso3 ===
        countryIso3,
    ) ??
    null
  );
}


export function
buildCountryMacroRiskComponent(
  input: {
    country_iso3:
      string;

    as_of:
      string;

    snapshots:
      Partial<
        Record<
          MacroDimensionKey,
          MacroNormalizationSnapshot
        >
      >;
  },
): CountryMacroRiskComponent {
  const iso3 =
    input.country_iso3
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      iso3,
    )
  ) {
    throw new Error(
      "Invalid country ISO3",
    );
  }

  const dimensions:
    MacroDimensionResult[] =
    DIMENSIONS.map(
      definition => {
        const snapshot =
          input.snapshots[
            definition.key
          ] ??
          null;

        if (!snapshot) {
          return {
            key:
              definition.key,

            metric:
              definition.metric,

            base_weight:
              definition.base_weight,

            available:
              false,

            peer_count:
              null,

            normalized_risk_score:
              null,

            freshness_status:
              null,

            normalization_hash:
              null,

            contribution:
              0,

            exclusion_reason:
              "normalization_snapshot_unavailable",
          };
        }

        if (
          snapshot.metric !==
            definition.metric
        ) {
          throw new Error(
            `Macro normalization metric mismatch for ${definition.key}`,
          );
        }

        if (
          snapshot.peer_count <
          definition.minimum_peer_count
        ) {
          return {
            key:
              definition.key,

            metric:
              definition.metric,

            base_weight:
              definition.base_weight,

            available:
              false,

            peer_count:
              snapshot.peer_count,

            normalized_risk_score:
              null,

            freshness_status:
              null,

            normalization_hash:
              snapshot.calculation_hash,

            contribution:
              0,

            exclusion_reason:
              "insufficient_peer_universe",
          };
        }

        const signal =
          signalForCountry(
            snapshot,
            iso3,
          );

        if (!signal) {
          return {
            key:
              definition.key,

            metric:
              definition.metric,

            base_weight:
              definition.base_weight,

            available:
              false,

            peer_count:
              snapshot.peer_count,

            normalized_risk_score:
              null,

            freshness_status:
              null,

            normalization_hash:
              snapshot.calculation_hash,

            contribution:
              0,

            exclusion_reason:
              "country_signal_unavailable",
          };
        }

        if (
          signal
            .freshness_status !==
            "CURRENT" &&
          signal
            .freshness_status !==
            "AGING"
        ) {
          return {
            key:
              definition.key,

            metric:
              definition.metric,

            base_weight:
              definition.base_weight,

            available:
              false,

            peer_count:
              snapshot.peer_count,

            normalized_risk_score:
              signal.normalized_risk_score,

            freshness_status:
              signal.freshness_status,

            normalization_hash:
              snapshot.calculation_hash,

            contribution:
              0,

            exclusion_reason:
              "signal_not_fresh_enough",
          };
        }

        return {
          key:
            definition.key,

          metric:
            definition.metric,

          base_weight:
            definition.base_weight,

          available:
            true,

          peer_count:
            snapshot.peer_count,

          normalized_risk_score:
            signal.normalized_risk_score,

          freshness_status:
            signal.freshness_status,

          normalization_hash:
            snapshot.calculation_hash,

          contribution:
            round(
              signal
                .normalized_risk_score *
              definition
                .base_weight,
            ),

          exclusion_reason:
            null,
        };
      },
    );

  const available =
    dimensions.filter(
      item =>
        item.available,
    );

  const availableWeight =
    available.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.base_weight,
      0,
    );

  const observedWeightedTotal =
    available.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.contribution,
      0,
    );

  /*
   * weighted_observed_risk answers:
   * "Among available dimensions, what is the observed
   * normalized macro-risk level?"
   *
   * score_contribution answers:
   * "How much of the full 0..100 macro component is
   * supported by currently available dimensions?"
   *
   * We DO NOT redistribute missing weights.
   */
  const weightedObservedRisk =
    availableWeight > 0
      ? round(
          observedWeightedTotal /
          availableWeight,
        )
      : null;

  const coverageRatio =
    round(
      available.length /
      DIMENSIONS.length,
    );

  const confidenceFactor =
    coverageRatio;

  const scoreContribution =
    round(
      observedWeightedTotal,
    );

  const calculationHash =
    hashJson({
      methodology_version:
        COUNTRY_RISK_V02_MACRO_METHOD_VERSION,

      country_iso3:
        iso3,

      as_of:
        input.as_of,

      dimensions,
    });

  return {
    methodology_version:
      COUNTRY_RISK_V02_MACRO_METHOD_VERSION,

    country_iso3:
      iso3,

    as_of:
      input.as_of,

    dimensions,

    available_dimension_count:
      available.length,

    total_dimension_count:
      DIMENSIONS.length,

    coverage_ratio:
      coverageRatio,

    weighted_observed_risk:
      weightedObservedRisk,

    score_contribution:
      scoreContribution,

    confidence_factor:
      confidenceFactor,

    calculation_hash:
      calculationHash,
  };
}

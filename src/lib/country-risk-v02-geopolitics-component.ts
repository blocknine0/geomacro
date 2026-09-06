import {
  createHash,
} from "node:crypto";

import {
  COUNTRY_RISK_V02_GEOPOLITICS_METHOD_VERSION,
  type CountryGeopoliticalRiskComponent,
  type GeopoliticalDimensionResult,
  type GeopoliticalMetricKey,
  type GeopoliticalNormalizationSnapshot,
} from "./country-risk-v02-geopolitics-contract";


const DIMENSIONS:
  readonly {
    metric:
      GeopoliticalMetricKey;

    base_weight:
      number;

    minimum_peer_count:
      number;
  }[] = [
  {
    metric:
      "forced_displacement_total",

    base_weight:
      0.30,

    minimum_peer_count:
      100,
  },

  {
    metric:
      "refugees_origin",

    base_weight:
      0.25,

    minimum_peer_count:
      100,
  },

  {
    metric:
      "asylum_seekers_origin",

    base_weight:
      0.15,

    minimum_peer_count:
      100,
  },

  {
    metric:
      "internally_displaced",

    base_weight:
      0.20,

    minimum_peer_count:
      100,
  },

  {
    metric:
      "stateless_population",

    base_weight:
      0.10,

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
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
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


export function
buildCountryGeopoliticalRiskComponent(
  input: {
    country_iso3:
      string;

    as_of:
      string;

    snapshots:
      Partial<
        Record<
          GeopoliticalMetricKey,
          GeopoliticalNormalizationSnapshot
        >
      >;
  },
): CountryGeopoliticalRiskComponent {
  const iso3 =
    input.country_iso3
      .trim()
      .toUpperCase();


  const dimensions:
    GeopoliticalDimensionResult[] =
    DIMENSIONS.map(
      definition => {
        const snapshot =
          input.snapshots[
            definition.metric
          ] ??
          null;


        if (!snapshot) {
          return {
            metric:
              definition.metric,

            base_weight:
              definition.base_weight,

            available:
              false,

            peer_count:
              null,

            positive_peer_count:
              null,

            zero_burden:
              null,

            numerator_freshness:
              null,

            denominator_freshness:
              null,

            per_100k_population:
              null,

            normalized_risk_score:
              null,

            contribution:
              0,

            exclusion_reason:
              "normalization_snapshot_unavailable",

            normalization_hash:
              null,
          };
        }


        if (
          snapshot.peer_count <
          definition.minimum_peer_count
        ) {
          return {
            metric:
              definition.metric,

            base_weight:
              definition.base_weight,

            available:
              false,

            peer_count:
              snapshot.peer_count,

            positive_peer_count:
              null,

            zero_burden:
              null,

            numerator_freshness:
              null,

            denominator_freshness:
              null,

            per_100k_population:
              null,

            normalized_risk_score:
              null,

            contribution:
              0,

            exclusion_reason:
              "insufficient_peer_universe",

            normalization_hash:
              snapshot.calculation_hash,
          };
        }


        const signal =
          snapshot.signals.find(
            item =>
              item.country_iso3 ===
              iso3,
          );


        if (!signal) {
          return {
            metric:
              definition.metric,

            base_weight:
              definition.base_weight,

            available:
              false,

            peer_count:
              snapshot.peer_count,

            positive_peer_count:
              null,

            zero_burden:
              null,

            numerator_freshness:
              null,

            denominator_freshness:
              null,

            per_100k_population:
              null,

            normalized_risk_score:
              null,

            contribution:
              0,

            exclusion_reason:
              "country_signal_unavailable",

            normalization_hash:
              snapshot.calculation_hash,
          };
        }


        return {
          metric:
            definition.metric,

          base_weight:
            definition.base_weight,

          available:
            true,

          peer_count:
            snapshot.peer_count,

          positive_peer_count:
            signal
              .positive_peer_count,

          zero_burden:
            signal
              .zero_burden,

          numerator_freshness:
            signal
              .freshness_status,

          denominator_freshness:
            signal
              .denominator_freshness_status,

          per_100k_population:
            signal
              .per_100k_population,

          normalized_risk_score:
            signal
              .normalized_risk_score,

          contribution:
            round(
              signal
                .normalized_risk_score *
              definition
                .base_weight,
            ),

          exclusion_reason:
            null,

          normalization_hash:
            snapshot.calculation_hash,
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


  const totalContribution =
    available.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        item.contribution,
      0,
    );


  const weightedObservedRisk =
    availableWeight > 0
      ? round(
          totalContribution /
          availableWeight,
        )
      : null;


  const coverageRatio =
    round(
      availableWeight,
    );


  const calculationHash =
    hashJson({
      methodology_version:
        COUNTRY_RISK_V02_GEOPOLITICS_METHOD_VERSION,

      country_iso3:
        iso3,

      as_of:
        input.as_of,

      dimensions,
    });


  return {
    methodology_version:
      COUNTRY_RISK_V02_GEOPOLITICS_METHOD_VERSION,

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
      round(
        totalContribution,
      ),

    confidence_factor:
      coverageRatio,

    calculation_hash:
      calculationHash,
  };
}

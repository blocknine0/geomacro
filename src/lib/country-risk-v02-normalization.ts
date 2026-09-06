import {
  createHash,
} from "node:crypto";

import {
  COUNTRY_RISK_V02_NORMALIZATION_VERSION,
  type MacroNormalizationSnapshot,
  type NormalizedRiskSignal,
} from "./country-risk-v02-normalization-contract";

import type {
  RiskDirection,
} from "./country-risk-v02-feature-methodology";


export type MacroNormalizationInput = {
  country_iso3:
    string;

  metric:
    string;

  value_numeric:
    number;

  unit:
    string | null;

  observed_at:
    string | null;

  freshness_status:
    "CURRENT"
    | "AGING"
    | "STALE"
    | "UNKNOWN";
};


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


function percentileRanks(
  values:
    {
      country_iso3:
        string;

      value_numeric:
        number;
    }[],
) {
  const sorted =
    [...values]
      .sort(
        (a, b) =>
          a.value_numeric -
            b.value_numeric ||
          a.country_iso3
            .localeCompare(
              b.country_iso3,
            ),
      );

  const result =
    new Map<
      string,
      number
    >();

  if (
    sorted.length === 1
  ) {
    result.set(
      sorted[0].country_iso3,
      50,
    );

    return result;
  }

  let index =
    0;

  while (
    index <
    sorted.length
  ) {
    let end =
      index;

    while (
      end + 1 <
        sorted.length &&
      sorted[
        end + 1
      ].value_numeric ===
        sorted[index]
          .value_numeric
    ) {
      end += 1;
    }

    const averageRank =
      (
        index +
        end
      ) / 2;

    const percentile =
      round(
        averageRank /
          (
            sorted.length -
            1
          ) *
          100,
      );

    for (
      let i = index;
      i <= end;
      i++
    ) {
      result.set(
        sorted[i]
          .country_iso3,
        percentile,
      );
    }

    index =
      end + 1;
  }

  return result;
}


export function
buildMacroNormalizationSnapshot(
  input: {
    metric:
      string;

    direction:
      RiskDirection;

    as_of:
      string;

    observations:
      MacroNormalizationInput[];
  },
): MacroNormalizationSnapshot {
  const accepted =
    input.observations
      .filter(
        item =>
          item.metric ===
            input.metric &&
          Number.isFinite(
            item.value_numeric,
          ) &&
          (
            item
              .freshness_status ===
              "CURRENT" ||
            item
              .freshness_status ===
              "AGING"
          ),
      );

  //
  // One latest eligible value per country.
  //
  const latestByCountry =
    new Map<
      string,
      MacroNormalizationInput
    >();

  for (
    const observation of
      accepted
  ) {
    const existing =
      latestByCountry.get(
        observation
          .country_iso3,
      );

    if (!existing) {
      latestByCountry.set(
        observation
          .country_iso3,
        observation,
      );

      continue;
    }

    const existingTime =
      existing.observed_at
        ? new Date(
            existing.observed_at,
          ).getTime()
        : 0;

    const candidateTime =
      observation.observed_at
        ? new Date(
            observation.observed_at,
          ).getTime()
        : 0;

    if (
      candidateTime >
      existingTime
    ) {
      latestByCountry.set(
        observation
          .country_iso3,
        observation,
      );
    }
  }

  const peers =
    [
      ...latestByCountry
        .values(),
    ];

  if (
    peers.length < 20
  ) {
    throw new Error(
      `Insufficient peer coverage for ${input.metric}: ${peers.length}`,
    );
  }

  const ranks =
    percentileRanks(
      peers.map(
        item => ({
          country_iso3:
            item.country_iso3,

          value_numeric:
            item.value_numeric,
        }),
      ),
    );

  const signals:
    NormalizedRiskSignal[] =
    peers
      .map(
        item => {
          const percentile =
            ranks.get(
              item.country_iso3,
            );

          if (
            percentile ===
            undefined
          ) {
            throw new Error(
              "Percentile rank missing",
            );
          }

          const normalizedRiskScore =
            input.direction ===
              "LOWER_IS_HIGHER_RISK"
              ? 100 -
                percentile
              : input.direction ===
                  "HIGHER_IS_HIGHER_RISK"
                ? percentile
                : 0;

          return {
            country_iso3:
              item.country_iso3,

            category:
              "MACRO" as const,

            metric:
              input.metric,

            raw_value:
              item.value_numeric,

            unit:
              item.unit,

            observed_at:
              item.observed_at,

            freshness_status:
              item
                .freshness_status,

            direction:
              input.direction,

            peer_count:
              peers.length,

            percentile:
              round(
                percentile,
              ),

            normalized_risk_score:
              round(
                normalizedRiskScore,
              ),

            normalization_version:
              COUNTRY_RISK_V02_NORMALIZATION_VERSION,
          };
        },
      )
      .sort(
        (a, b) =>
          a.country_iso3
            .localeCompare(
              b.country_iso3,
            ),
      );

  const calculationHash =
    hashJson({
      normalization_version:
        COUNTRY_RISK_V02_NORMALIZATION_VERSION,

      metric:
        input.metric,

      direction:
        input.direction,

      as_of:
        input.as_of,

      signals,
    });

  return {
    normalization_version:
      COUNTRY_RISK_V02_NORMALIZATION_VERSION,

    as_of:
      input.as_of,

    metric:
      input.metric,

    direction:
      input.direction,

    peer_count:
      peers.length,

    signals,

    calculation_hash:
      calculationHash,
  };
}

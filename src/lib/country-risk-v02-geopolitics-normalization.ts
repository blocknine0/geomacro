import {
  createHash,
} from "node:crypto";

import {
  COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION,
  type GeopoliticalNormalizationSnapshot,
  type GeopoliticalNormalizedRiskSignal,
  type GeopoliticalMetricKey,
  type PopulationNormalizedGeopoliticalSignal,
} from "./country-risk-v02-geopolitics-contract";


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
    (
      value +
      Number.EPSILON
    ) *
      factor,
  ) /
    factor;
}


/*
 * Percentiles are calculated only across
 * positive-burden peers.
 *
 * Verified zero burden is handled separately
 * and always maps to risk 0.
 */
function positivePercentileRanks(
  signals:
    PopulationNormalizedGeopoliticalSignal[],
) {
  const positive =
    signals
      .filter(
        signal =>
          signal
            .per_100k_population >
          0,
      )
      .sort(
        (a, b) =>
          a.per_100k_population -
            b.per_100k_population ||
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
    positive.length === 0
  ) {
    return {
      ranks:
        result,

      positive_peer_count:
        0,
    };
  }


  if (
    positive.length === 1
  ) {
    result.set(
      positive[0]
        .country_iso3,
      100,
    );

    return {
      ranks:
        result,

      positive_peer_count:
        1,
    };
  }


  let index =
    0;


  while (
    index <
    positive.length
  ) {
    let end =
      index;


    while (
      end + 1 <
        positive.length &&
      positive[
        end + 1
      ]
        .per_100k_population ===
        positive[index]
          .per_100k_population
    ) {
      end += 1;
    }


    const averageRank =
      (
        index +
        end
      ) /
      2;


    /*
     * Positive burden starts above zero risk.
     *
     * Rank formula uses 1..N placement so the
     * smallest positive burden is > 0 while the
     * highest positive burden reaches 100.
     */
    const percentile =
      round(
        (
          averageRank +
          1
        ) /
          positive.length *
          100,
      );


    for (
      let i = index;
      i <= end;
      i++
    ) {
      result.set(
        positive[i]
          .country_iso3,
        percentile,
      );
    }


    index =
      end + 1;
  }


  return {
    ranks:
      result,

    positive_peer_count:
      positive.length,
  };
}


export function
buildGeopoliticalNormalizationSnapshot(
  input: {
    metric:
      GeopoliticalMetricKey;

    as_of:
      string;

    signals:
      PopulationNormalizedGeopoliticalSignal[];
  },
): GeopoliticalNormalizationSnapshot {
  const accepted =
    input.signals
      .filter(
        signal =>
          signal.metric ===
            input.metric &&
          signal.score_eligible &&
          Number.isFinite(
            signal
              .per_100k_population,
          ) &&
          signal
            .per_100k_population >=
            0,
      );


  if (
    accepted.length <
    100
  ) {
    throw new Error(
      `Insufficient geopolitical peer coverage for ${input.metric}: ${accepted.length}`,
    );
  }


  const {
    ranks,
    positive_peer_count,
  } =
    positivePercentileRanks(
      accepted,
    );


  /*
   * If every eligible country is zero burden,
   * the metric provides no directional
   * differentiation and all countries receive
   * risk 0.
   */
  const signals:
    GeopoliticalNormalizedRiskSignal[] =
    accepted
      .map(
        signal => {
          const zeroBurden =
            signal
              .per_100k_population ===
            0;


          if (
            zeroBurden
          ) {
            return {
              ...signal,

              peer_count:
                accepted.length,

              positive_peer_count,

              percentile:
                0,

              normalized_risk_score:
                0,

              zero_burden:
                true,

              normalization_version:
                COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION,
            };
          }


          const percentile =
            ranks.get(
              signal
                .country_iso3,
            );


          if (
            percentile ===
            undefined
          ) {
            throw new Error(
              `Missing positive geopolitical percentile for ${signal.country_iso3}`,
            );
          }


          return {
            ...signal,

            peer_count:
              accepted.length,

            positive_peer_count,

            percentile,

            normalized_risk_score:
              percentile,

            zero_burden:
              false,

            normalization_version:
              COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION,
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
        COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION,

      metric:
        input.metric,

      as_of:
        input.as_of,

      peer_count:
        accepted.length,

      positive_peer_count,

      signals,
    });


  return {
    normalization_version:
      COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION,

    metric:
      input.metric,

    as_of:
      input.as_of,

    peer_count:
      accepted.length,

    signals,

    calculation_hash:
      calculationHash,
  };
}

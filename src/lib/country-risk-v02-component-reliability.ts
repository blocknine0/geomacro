import {
  createHash,
} from "node:crypto";

import type {
  CountryMacroRiskComponent,
} from "./country-risk-v02-macro-contract";

import type {
  CountryGeopoliticalRiskComponent,
} from "./country-risk-v02-geopolitics-contract";

import type {
  EventReliabilityResult,
} from "./country-risk-v02-event-reliability";


export const COUNTRY_RISK_V02_COMPONENT_RELIABILITY_VERSION =
  "country-risk-component-reliability-v0.1.0-pilot" as const;


export type ComponentReliabilityStatus =
  | "STRONG"
  | "USABLE"
  | "LIMITED"
  | "INSUFFICIENT";


export type StructuredComponentReliability = {
  available:
    boolean;

  status:
    ComponentReliabilityStatus;

  coverage_factor:
    number;

  freshness_factor:
    number;

  peer_factor:
    number;

  confidence_factor:
    number;

  reliability_factor:
    number;

  warnings:
    string[];

  calculation_hash:
    string;
};


export type CountryComponentReliabilityEnvelope = {
  methodology_version:
    typeof COUNTRY_RISK_V02_COMPONENT_RELIABILITY_VERSION;

  country_iso3:
    string;

  event: {
    available:
      boolean;

    status:
      ComponentReliabilityStatus;

    reliability_factor:
      number;

    calculation_hash:
      string;
  };

  macro:
    StructuredComponentReliability;

  geopolitics:
    StructuredComponentReliability;

  calculation_hash:
    string;
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
  ) /
    factor;
}


function clamp01(
  value: number,
) {
  return Math.min(
    1,
    Math.max(
      0,
      value,
    ),
  );
}


function statusFromReliability(
  reliability:
    number,
): ComponentReliabilityStatus {
  if (
    reliability >=
    0.75
  ) {
    return "STRONG";
  }

  if (
    reliability >=
    0.55
  ) {
    return "USABLE";
  }

  if (
    reliability >=
    0.35
  ) {
    return "LIMITED";
  }

  return "INSUFFICIENT";
}


export function
buildMacroReliability(
  macro:
    CountryMacroRiskComponent,
): StructuredComponentReliability {
  const available =
    macro
      .weighted_observed_risk !==
      null &&
    macro
      .available_dimension_count >
      0;


  if (
    !available
  ) {
    const core = {
      available:
        false,

      status:
        "INSUFFICIENT" as const,

      coverage_factor:
        0,

      freshness_factor:
        0,

      peer_factor:
        0,

      confidence_factor:
        0,

      reliability_factor:
        0,

      warnings: [
        "macro_component_unavailable",
      ],
    };


    return {
      ...core,

      calculation_hash:
        hashJson(
          core,
        ),
    };
  }


  const availableDimensions =
    macro.dimensions.filter(
      item =>
        item.available,
    );


  const currentCount =
    availableDimensions.filter(
      item =>
        item
          .freshness_status ===
        "CURRENT",
    ).length;


  const agingCount =
    availableDimensions.filter(
      item =>
        item
          .freshness_status ===
        "AGING",
    ).length;


  const freshnessFactor =
    availableDimensions.length >
      0
      ? (
          currentCount +
          agingCount *
            0.5
        ) /
        availableDimensions.length
      : 0;


  const peerCounts =
    availableDimensions
      .map(
        item =>
          item.peer_count,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value ===
            "number" &&
          value >
            0,
      );


  const minimumPeer =
    peerCounts.length >
      0
      ? Math.min(
          ...peerCounts,
        )
      : 0;


  /*
   * 100 peers is full pilot credit.
   */
  const peerFactor =
    clamp01(
      minimumPeer /
      100,
    );


  const coverageFactor =
    clamp01(
      macro.coverage_ratio,
    );


  const confidenceFactor =
    clamp01(
      macro.confidence_factor,
    );


  const reliability =
    round(
      coverageFactor *
        0.35 +
      freshnessFactor *
        0.25 +
      peerFactor *
        0.20 +
      confidenceFactor *
        0.20,
    );


  const warnings:
    string[] = [];


  if (
    coverageFactor <
    1
  ) {
    warnings.push(
      "partial_macro_dimension_coverage",
    );
  }


  if (
    freshnessFactor <
    0.75
  ) {
    warnings.push(
      "macro_freshness_limited",
    );
  }


  if (
    peerFactor <
    1
  ) {
    warnings.push(
      "macro_peer_universe_limited",
    );
  }


  const core = {
    available:
      true,

    status:
      statusFromReliability(
        reliability,
      ),

    coverage_factor:
      round(
        coverageFactor,
      ),

    freshness_factor:
      round(
        freshnessFactor,
      ),

    peer_factor:
      round(
        peerFactor,
      ),

    confidence_factor:
      round(
        confidenceFactor,
      ),

    reliability_factor:
      reliability,

    warnings,
  };


  return {
    ...core,

    calculation_hash:
      hashJson(
        core,
      ),
  };
}


export function
buildGeopoliticsReliability(
  geopolitics:
    CountryGeopoliticalRiskComponent,
): StructuredComponentReliability {
  const available =
    geopolitics
      .weighted_observed_risk !==
      null &&
    geopolitics
      .available_dimension_count >
      0;


  if (
    !available
  ) {
    const core = {
      available:
        false,

      status:
        "INSUFFICIENT" as const,

      coverage_factor:
        0,

      freshness_factor:
        0,

      peer_factor:
        0,

      confidence_factor:
        0,

      reliability_factor:
        0,

      warnings: [
        "geopolitics_component_unavailable",
      ],
    };


    return {
      ...core,

      calculation_hash:
        hashJson(
          core,
        ),
    };
  }


  const dimensions =
    geopolitics
      .dimensions
      .filter(
        item =>
          item.available,
      );


  const freshnessValue = (
    status:
      "CURRENT"
      | "AGING"
      | "STALE"
      | "UNKNOWN"
      | null,
  ) => {
    if (
      status ===
      "CURRENT"
    ) {
      return 1;
    }

    if (
      status ===
      "AGING"
    ) {
      return 0.5;
    }

    return 0;
  };


  const dimensionFreshness =
    dimensions.map(
      item =>
        Math.min(
          freshnessValue(
            item
              .numerator_freshness,
          ),
          freshnessValue(
            item
              .denominator_freshness,
          ),
        ),
    );


  const freshnessFactor =
    dimensions.length >
      0
      ? dimensionFreshness
          .reduce(
            (
              sum,
              value,
            ) =>
              sum +
              value,
            0,
          ) /
        dimensions.length
      : 0;


  /*
   * Peer quality is based on positive peers,
   * not merely total eligible countries.
   *
   * An all-zero metric has no cross-country
   * discriminatory information and therefore
   * receives zero peer-information credit.
   */
  const peerInformation =
    dimensions.map(
      item => {
        if (
          typeof item
            .peer_count !==
            "number" ||
          item.peer_count <=
            0 ||
          typeof item
            .positive_peer_count !==
            "number"
        ) {
          return 0;
        }


        const absoluteAdequacy =
          clamp01(
            item
              .positive_peer_count /
            100,
          );


        const positiveShare =
          clamp01(
            item
              .positive_peer_count /
            item.peer_count,
          );


        return (
          absoluteAdequacy *
          positiveShare
        );
      },
    );


  const peerFactor =
    peerInformation.length >
      0
      ? peerInformation
          .reduce(
            (
              sum,
              value,
            ) =>
              sum +
              value,
            0,
          ) /
        peerInformation.length
      : 0;


  const informativeDimensions =
    dimensions.filter(
      item =>
        typeof item
          .positive_peer_count ===
          "number" &&
        item
          .positive_peer_count >
          0,
    );


  /*
   * Coverage reliability measures information-bearing
   * dimensions rather than simply available dimensions.
   *
   * A verified all-zero dimension remains valid context
   * and risk=0, but does not increase discriminatory
   * reliability.
   */
  const coverageFactor =
    geopolitics
      .total_dimension_count >
      0
      ? informativeDimensions.length /
        geopolitics
          .total_dimension_count
      : 0;


  const confidenceFactor =
    clamp01(
      geopolitics
        .confidence_factor,
    );


  const reliability =
    round(
      coverageFactor *
        0.35 +
      freshnessFactor *
        0.25 +
      peerFactor *
        0.20 +
      confidenceFactor *
        0.20,
    );


  const warnings:
    string[] = [];


  if (
    coverageFactor <
    1
  ) {
    warnings.push(
      "non_informative_or_missing_geopolitics_dimensions",
    );
  }


  if (
    freshnessFactor <
    1
  ) {
    warnings.push(
      "geopolitics_freshness_not_full",
    );
  }


  if (
    peerFactor <
    0.75
  ) {
    warnings.push(
      "geopolitics_positive_peer_information_limited",
    );
  }


  if (
    dimensions.some(
      item =>
        item
          .positive_peer_count ===
        0,
    )
  ) {
    warnings.push(
      "all_zero_geopolitics_metric_present",
    );
  }


  const core = {
    available:
      true,

    status:
      statusFromReliability(
        reliability,
      ),

    coverage_factor:
      round(
        coverageFactor,
      ),

    freshness_factor:
      round(
        freshnessFactor,
      ),

    peer_factor:
      round(
        peerFactor,
      ),

    confidence_factor:
      round(
        confidenceFactor,
      ),

    reliability_factor:
      reliability,

    warnings,
  };


  return {
    ...core,

    calculation_hash:
      hashJson(
        core,
      ),
  };
}


export function
buildComponentReliabilityEnvelope(
  input: {
    country_iso3:
      string;

    event:
      EventReliabilityResult;

    macro:
      CountryMacroRiskComponent;

    geopolitics:
      CountryGeopoliticalRiskComponent;
  },
): CountryComponentReliabilityEnvelope {
  const macro =
    buildMacroReliability(
      input.macro,
    );


  const geopolitics =
    buildGeopoliticsReliability(
      input.geopolitics,
    );


  const core = {
    methodology_version:
      COUNTRY_RISK_V02_COMPONENT_RELIABILITY_VERSION,

    country_iso3:
      input.country_iso3,

    event: {
      available:
        input.event.available,

      status:
        input.event.status,

      reliability_factor:
        input.event
          .reliability_factor,

      calculation_hash:
        input.event
          .calculation_hash,
    },

    macro,

    geopolitics,
  };


  return {
    ...core,

    calculation_hash:
      hashJson(
        core,
      ),
  };
}

export const WGI_POLITICAL_STABILITY_CONTRACT_VERSION =
  "wgi-political-stability-v0.1.0" as const;

export const WGI_SOURCE_ID =
  "world_bank_wgi_political_stability" as const;

export const WGI_API_SOURCE_ID =
  "3" as const;


export const WGI_POLITICAL_STABILITY_INDICATORS = {
  ESTIMATE:
    "GOV_WGI_PV.EST",

  SCORE:
    "GOV_WGI_PV.SC",

  SCORE_LOWER:
    "GOV_WGI_PV.SC_LB",

  SCORE_UPPER:
    "GOV_WGI_PV.SC_UB",

  STANDARD_ERROR:
    "GOV_WGI_PV.SE",

  SOURCE_COUNT:
    "GOV_WGI_PV.SR",
} as const;


export type WgiIndicatorId =
  typeof WGI_POLITICAL_STABILITY_INDICATORS[
    keyof typeof WGI_POLITICAL_STABILITY_INDICATORS
  ];


export type WgiRawObservation = {
  indicator?: {
    id?: string;
    value?: string;
  };

  country?: {
    id?: string;
    value?: string;
  };

  countryiso3code?:
    string;

  date?:
    string;

  value?:
    number | string | null;

  unit?:
    string;

  obs_status?:
    string;

  decimal?:
    number;
};


export type WgiPoliticalStabilityBundle = {
  contract_version:
    typeof WGI_POLITICAL_STABILITY_CONTRACT_VERSION;

  source_id:
    typeof WGI_SOURCE_ID;

  source_api_id:
    typeof WGI_API_SOURCE_ID;

  country_iso3:
    string;

  country_name:
    string | null;

  data_year:
    number;

  observed_at:
    string;

  estimate:
    number;

  absolute_score:
    number;

  score_ci_lower:
    number;

  score_ci_upper:
    number;

  standard_error:
    number;

  source_count:
    number;

  provenance: {
    methodology:
      "WGI_2025_REVISION";

    source_class:
      "STRUCTURAL_DATASET";

    dimension:
      "POLITICAL_INSTABILITY";

    methodology_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02";
  };
};


export type WgiBundleResult =
  | {
      status:
        "ACCEPTED";

      bundle:
        WgiPoliticalStabilityBundle;
    }
  | {
      status:
        "REJECTED";

      reason:
        string;
    };


function normalizeIso3(
  value:
    unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const iso3 =
    value
      .trim()
      .toUpperCase();

  return /^[A-Z]{3}$/.test(
    iso3,
  )
    ? iso3
    : null;
}


function finiteNumber(
  value:
    unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numeric =
    Number(value);

  return Number.isFinite(
    numeric,
  )
    ? numeric
    : null;
}


export function buildWgiPoliticalStabilityBundle(
  rows:
    WgiRawObservation[],
): WgiBundleResult {
  if (
    rows.length !==
    6
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "incomplete_indicator_bundle",
    };
  }


  const byIndicator =
    new Map<
      string,
      WgiRawObservation
    >();


  for (const row of rows) {
    const indicatorId =
      row.indicator?.id;

    if (
      typeof indicatorId !==
        "string"
    ) {
      return {
        status:
          "REJECTED",

        reason:
          "missing_indicator_id",
      };
    }

    byIndicator.set(
      indicatorId,
      row,
    );
  }


  const required =
    Object.values(
      WGI_POLITICAL_STABILITY_INDICATORS,
    );


  for (
    const indicator of
    required
  ) {
    if (
      !byIndicator.has(
        indicator,
      )
    ) {
      return {
        status:
          "REJECTED",

        reason:
          `missing_indicator:${indicator}`,
      };
    }
  }


  const first =
    byIndicator.get(
      WGI_POLITICAL_STABILITY_INDICATORS
        .ESTIMATE,
    )!;


  const iso3 =
    normalizeIso3(
      first.countryiso3code,
    );

  if (!iso3) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_country_iso3",
    };
  }


  const year =
    Number(
      first.date,
    );

  if (
    !Number.isInteger(year) ||
    year < 1996 ||
    year > 2100
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_data_year",
    };
  }


  for (const row of rows) {
    if (
      normalizeIso3(
        row.countryiso3code,
      ) !==
      iso3
    ) {
      return {
        status:
          "REJECTED",

        reason:
          "mixed_country_bundle",
      };
    }

    if (
      Number(
        row.date,
      ) !==
      year
    ) {
      return {
        status:
          "REJECTED",

        reason:
          "mixed_year_bundle",
      };
    }
  }


  const estimate =
    finiteNumber(
      byIndicator.get(
        WGI_POLITICAL_STABILITY_INDICATORS
          .ESTIMATE,
      )?.value,
    );

  const score =
    finiteNumber(
      byIndicator.get(
        WGI_POLITICAL_STABILITY_INDICATORS
          .SCORE,
      )?.value,
    );

  const lower =
    finiteNumber(
      byIndicator.get(
        WGI_POLITICAL_STABILITY_INDICATORS
          .SCORE_LOWER,
      )?.value,
    );

  const upper =
    finiteNumber(
      byIndicator.get(
        WGI_POLITICAL_STABILITY_INDICATORS
          .SCORE_UPPER,
      )?.value,
    );

  const standardError =
    finiteNumber(
      byIndicator.get(
        WGI_POLITICAL_STABILITY_INDICATORS
          .STANDARD_ERROR,
      )?.value,
    );

  const sourceCount =
    finiteNumber(
      byIndicator.get(
        WGI_POLITICAL_STABILITY_INDICATORS
          .SOURCE_COUNT,
      )?.value,
    );


  if (
    estimate === null ||
    score === null ||
    lower === null ||
    upper === null ||
    standardError === null ||
    sourceCount === null
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "missing_or_invalid_value",
    };
  }


  if (
    score < 0 ||
    score > 100 ||
    lower < 0 ||
    upper > 100 ||
    lower > score ||
    score > upper
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_score_interval",
    };
  }


  if (
    standardError < 0
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_standard_error",
    };
  }


  if (
    !Number.isInteger(
      sourceCount,
    ) ||
    sourceCount < 0
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_source_count",
    };
  }


  return {
    status:
      "ACCEPTED",

    bundle: {
      contract_version:
        WGI_POLITICAL_STABILITY_CONTRACT_VERSION,

      source_id:
        WGI_SOURCE_ID,

      source_api_id:
        WGI_API_SOURCE_ID,

      country_iso3:
        iso3,

      country_name:
        typeof first.country?.value ===
          "string"
          ? first.country.value
          : null,

      data_year:
        year,

      observed_at:
        `${year}-12-31T00:00:00.000Z`,

      estimate,

      absolute_score:
        score,

      score_ci_lower:
        lower,

      score_ci_upper:
        upper,

      standard_error:
        standardError,

      source_count:
        sourceCount,

      provenance: {
        methodology:
          "WGI_2025_REVISION",

        source_class:
          "STRUCTURAL_DATASET",

        dimension:
          "POLITICAL_INSTABILITY",

        methodology_status:
          "EVIDENCE_ONLY_NOT_IN_GRO_V02",
      },
    },
  };
}

import {
  createHash,
} from "node:crypto";

import {
  COUNTRY_INTELLIGENCE_STATE_METHOD_VERSION,
  COUNTRY_INTELLIGENCE_STATE_SCHEMA_VERSION,
  type CategoryIntelligenceSummary,
  type CountryFeatureValue,
  type CountryIntelligenceState,
  type IntelligenceCategory,
  type IntelligenceCoverageStatus,
} from "./country-intelligence-state-contract";


export type CountryIntelligenceObservationInput = {
  observation_id:
    string;

  source_id:
    string;

  category:
    IntelligenceCategory;

  country_iso3:
    string;

  metric:
    string | null;

  commodity:
    string | null;

  value_numeric:
    number | null;

  value_text:
    string | null;

  unit:
    string | null;

  observed_at:
    string | null;

  normalized_hash:
    string;

  quality_status:
    string;

  commercial_eligibility_status:
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


function normalizeIso3(
  value: string,
) {
  const iso3 =
    value
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

  return iso3;
}


function validDate(
  value:
    string | null,
) {
  if (!value) {
    return null;
  }

  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime(),
  )
    ? null
    : parsed;
}


function daysBetween(
  earlier:
    string | null,
  later:
    string,
): number | null {
  const first =
    validDate(earlier);

  const second =
    validDate(later);

  if (
    !first ||
    !second
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (
        second.getTime() -
        first.getTime()
      ) /
        86_400_000 *
        1000,
    ) /
      1000,
  );
}


function featureFreshnessStatus(
  ageDays:
    number | null,
) {
  if (
    ageDays === null
  ) {
    return "UNKNOWN" as const;
  }

  if (
    ageDays <= 400
  ) {
    return "CURRENT" as const;
  }

  if (
    ageDays <= 800
  ) {
    return "AGING" as const;
  }

  return "STALE" as const;
}


function coverageStatus(
  observationCount:
    number,
  featureCount:
    number,
  sourceCount:
    number,
  staleFeatureCount:
    number,
  currentFeatureCount:
    number,
): IntelligenceCoverageStatus {
  if (
    observationCount === 0
  ) {
    return "NO_SIGNAL";
  }

  if (
    featureCount > 0 &&
    staleFeatureCount ===
      featureCount
  ) {
    return "STALE";
  }

  if (
    observationCount >= 8 &&
    featureCount >= 4 &&
    sourceCount >= 1 &&
    currentFeatureCount >=
      Math.ceil(
        featureCount * 0.5,
      )
  ) {
    return "STRONG";
  }

  if (
    observationCount >= 3 &&
    featureCount >= 2 &&
    currentFeatureCount >= 1
  ) {
    return "USABLE";
  }

  return "LIMITED";
}


function categorySummary(
  category:
    IntelligenceCategory,
  observations:
    CountryIntelligenceObservationInput[],
  features:
    CountryFeatureValue[],
  asOf:
    string,
): CategoryIntelligenceSummary {
  const categoryObservations =
    observations.filter(
      item =>
        item.category ===
        category,
    );

  const categoryFeatures =
    features.filter(
      item =>
        item.category ===
        category,
    );

  const sources =
    new Set(
      categoryObservations.map(
        item =>
          item.source_id,
      ),
    );

  const metrics =
    new Set(
      categoryFeatures.map(
        item =>
          item.metric,
      ),
    );

  const commodities =
    new Set(
      categoryFeatures
        .map(
          item =>
            item.commodity,
        )
        .filter(
          (
            value,
          ): value is string =>
            Boolean(value),
        ),
    );

  const validDates =
    categoryObservations
      .map(
        item =>
          item.observed_at,
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            validDate(value),
          ),
      )
      .sort();

  const oldest =
    validDates[0] ??
    null;

  const latest =
    validDates[
      validDates.length - 1
    ] ??
    null;

  const freshnessStates =
    categoryFeatures.map(
      item =>
        item.freshness_status,
    );

  const staleFeatureCount =
    freshnessStates.filter(
      value =>
        value === "STALE",
    ).length;

  const currentFeatureCount =
    freshnessStates.filter(
      value =>
        value === "CURRENT",
    ).length;

  const unknownFreshnessFeatureCount =
    freshnessStates.filter(
      value =>
        value === "UNKNOWN",
    ).length;

  return {
    category,

    observation_count:
      categoryObservations.length,

    metric_count:
      metrics.size,

    commodity_count:
      commodities.size,

    source_count:
      sources.size,

    latest_observed_at:
      latest,

    oldest_observed_at:
      oldest,

    age_days:
      daysBetween(
        latest,
        asOf,
      ),

    stale_feature_count:
      staleFeatureCount,

    current_feature_count:
      currentFeatureCount,

    unknown_freshness_feature_count:
      unknownFreshnessFeatureCount,

    coverage_status:
      coverageStatus(
        categoryObservations.length,
        categoryFeatures.length,
        sources.size,
        staleFeatureCount,
        currentFeatureCount,
      ),
  };
}


function featureKey(
  observation:
    CountryIntelligenceObservationInput,
) {
  return [
    observation.category,
    observation.commodity ??
      "_",
    observation.metric ??
      "_",
  ].join("::");
}


function buildFeatures(
  observations:
    CountryIntelligenceObservationInput[],
  asOf:
    string,
): CountryFeatureValue[] {
  const groups =
    new Map<
      string,
      CountryIntelligenceObservationInput[]
    >();

  for (
    const observation of
      observations
  ) {
    if (
      !observation.metric
    ) {
      continue;
    }

    const key =
      featureKey(
        observation,
      );

    const group =
      groups.get(key) ??
      [];

    group.push(
      observation,
    );

    groups.set(
      key,
      group,
    );
  }

  const features:
    CountryFeatureValue[] =
    [];

  for (
    const [
      key,
      group,
    ] of groups.entries()
  ) {
    group.sort(
      (a, b) => {
        const dateA =
          validDate(
            a.observed_at,
          )
            ?.getTime() ??
          0;

        const dateB =
          validDate(
            b.observed_at,
          )
            ?.getTime() ??
          0;

        if (
          dateA !== dateB
        ) {
          return (
            dateB -
            dateA
          );
        }

        return a
          .observation_id
          .localeCompare(
            b.observation_id,
          );
      },
    );

    const latest =
      group[0];

    const sources =
      new Set(
        group.map(
          item =>
            item.source_id,
        ),
      );

    const ageDays =
      daysBetween(
        latest.observed_at,
        asOf,
      );

    features.push({
      feature_key:
        key,

      category:
        latest.category,

      metric:
        latest.metric!,

      commodity:
        latest.commodity,

      value_numeric:
        latest.value_numeric,

      value_text:
        latest.value_text,

      unit:
        latest.unit,

      observed_at:
        latest.observed_at,

      age_days:
        ageDays,

      freshness_status:
        featureFreshnessStatus(
          ageDays,
        ),

      source_count:
        sources.size,

      observation_count:
        group.length,
    });
  }

  return features.sort(
    (a, b) =>
      a.feature_key.localeCompare(
        b.feature_key,
      ),
  );
}


export function
buildCountryIntelligenceState(
  input: {
    country_iso3:
      string;

    country_name?:
      string | null;

    as_of:
      string;

    observations:
      CountryIntelligenceObservationInput[];
  },
): CountryIntelligenceState {
  const iso3 =
    normalizeIso3(
      input.country_iso3,
    );

  const asOfDate =
    new Date(
      input.as_of,
    );

  if (
    Number.isNaN(
      asOfDate.getTime(),
    )
  ) {
    throw new Error(
      "Invalid intelligence-state as_of",
    );
  }

  const accepted =
    input.observations
      .filter(
        observation =>
          observation
            .country_iso3 ===
            iso3 &&
          observation
            .quality_status ===
            "VERIFIED" &&
          observation
            .commercial_eligibility_status ===
            "VERIFIED",
      )
      .sort(
        (a, b) =>
          a.observation_id.localeCompare(
            b.observation_id,
          ),
      );

  const features =
    buildFeatures(
      accepted,
      input.as_of,
    );

  const categories = {
    MACRO:
      categorySummary(
        "MACRO",
        accepted,
        features,
        input.as_of,
      ),

    GEOPOLITICS:
      categorySummary(
        "GEOPOLITICS",
        accepted,
        features,
        input.as_of,
      ),

    CRITICAL_MINERALS:
      categorySummary(
        "CRITICAL_MINERALS",
        accepted,
        features,
        input.as_of,
      ),
  };

  const sourceCount =
    new Set(
      accepted.map(
        item =>
          item.source_id,
      ),
    ).size;

  const categoryCount =
    (
      Object.values(
        categories,
      ) as CategoryIntelligenceSummary[]
    )
      .filter(
        item =>
          item
            .observation_count >
          0,
      )
      .length;

  const inputHash =
    hashJson(
      accepted.map(
        item => ({
          observation_id:
            item.observation_id,

          normalized_hash:
            item.normalized_hash,
        }),
      ),
    );

  const dataHash =
    hashJson({
      iso3,
      as_of:
        input.as_of,
      features,
      categories,
    });

  const calculationHash =
    hashJson({
      schema_version:
        COUNTRY_INTELLIGENCE_STATE_SCHEMA_VERSION,

      methodology_version:
        COUNTRY_INTELLIGENCE_STATE_METHOD_VERSION,

      country_iso3:
        iso3,

      as_of:
        input.as_of,

      input_hash:
        inputHash,

      data_hash:
        dataHash,
    });

  return {
    schema_version:
      COUNTRY_INTELLIGENCE_STATE_SCHEMA_VERSION,

    methodology_version:
      COUNTRY_INTELLIGENCE_STATE_METHOD_VERSION,

    state_id:
      `cis_${iso3}_${calculationHash.slice(0, 24)}`,

    country_iso3:
      iso3,

    country_name:
      input.country_name ??
      null,

    as_of:
      input.as_of,

    generated_at:
      input.as_of,

    categories,

    features,

    totals: {
      observation_count:
        accepted.length,

      feature_count:
        features.length,

      source_count:
        sourceCount,

      category_count:
        categoryCount,
    },

    hashes: {
      input_hash:
        inputHash,

      data_hash:
        dataHash,

      calculation_hash:
        calculationHash,
    },
  };
}

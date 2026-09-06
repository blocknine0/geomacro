import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  buildMacroNormalizationSnapshot,
  type MacroNormalizationInput,
} from "./country-risk-v02-normalization";

import {
  getFeatureMethodologyRule,
} from "./country-risk-v02-feature-methodology";


function freshnessStatus(
  observedAt:
    string | null,
  asOf:
    string,
) {
  if (!observedAt) {
    return "UNKNOWN" as const;
  }

  const observed =
    new Date(
      observedAt,
    );

  const evaluation =
    new Date(
      asOf,
    );

  if (
    Number.isNaN(
      observed.getTime(),
    ) ||
    Number.isNaN(
      evaluation.getTime(),
    )
  ) {
    return "UNKNOWN" as const;
  }

  const ageDays =
    Math.max(
      0,
      (
        evaluation.getTime() -
        observed.getTime()
      ) /
        86_400_000,
    );

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


export async function
generateGlobalMacroNormalization(
  input: {
    metric:
      string;

    as_of:
      string;
  },
) {
  const rule =
    getFeatureMethodologyRule(
      "MACRO",
      input.metric,
    );

  if (
    rule.mode !==
      "SCORE_READY"
  ) {
    throw new Error(
      `Metric is not score-ready: ${input.metric}`,
    );
  }

  const db =
    requireRiskSupabase();

  const operational =
    await db
      .from(
        "live_external_sources",
      )
      .select(
        "source_id",
      )
      .eq(
        "enabled_for_ingestion",
        true,
      )
      .eq(
        "enabled_for_commercial_signals",
        true,
      )
      .eq(
        "commercial_usage_status",
        "COMMERCIAL_OK",
      );

  if (
    operational.error
  ) {
    throw operational.error;
  }

  const sourceIds =
    (
      operational.data ??
      []
    )
      .map(
        row =>
          row.source_id,
      );

  const rows =
    await db
      .from(
        "live_external_observations",
      )
      .select(`
        country_iso3,
        metric,
        value_numeric,
        unit,
        observed_at
      `)
      .eq(
        "category",
        "MACRO",
      )
      .eq(
        "metric",
        input.metric,
      )
      .eq(
        "quality_status",
        "VERIFIED",
      )
      .eq(
        "commercial_eligibility_status",
        "VERIFIED",
      )
      .in(
        "source_id",
        sourceIds,
      )
      .lte(
        "observed_at",
        input.as_of,
      )
      .limit(
        10000,
      );

  if (
    rows.error
  ) {
    throw rows.error;
  }

  const observations:
    MacroNormalizationInput[] =
    (
      rows.data ??
      []
    )
      .filter(
        row =>
          typeof row
            .country_iso3 ===
            "string" &&
          typeof row
            .value_numeric ===
            "number",
      )
      .map(
        row => ({
          country_iso3:
            row.country_iso3!,

          metric:
            row.metric!,

          value_numeric:
            row.value_numeric!,

          unit:
            row.unit,

          observed_at:
            row.observed_at,

          freshness_status:
            freshnessStatus(
              row.observed_at,
              input.as_of,
            ),
        }),
      );

  return buildMacroNormalizationSnapshot({
    metric:
      input.metric,

    direction:
      rule.direction,

    as_of:
      input.as_of,

    observations,
  });
}

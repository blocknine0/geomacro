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


const WORLD_BANK_SOURCE_ID =
  "world_bank_indicators";


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

  //
  // The currently score-ready country macro methodology is explicitly backed
  // by the commercially reviewed World Bank WDI source. Keep that source gate
  // fail-closed before reading the deduplicated latest-observation view.
  //
  const operational =
    await db
      .from(
        "live_external_sources",
      )
      .select(
        "source_id",
      )
      .eq(
        "source_id",
        WORLD_BANK_SOURCE_ID,
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
      )
      .maybeSingle();

  if (
    operational.error
  ) {
    throw operational.error;
  }

  if (
    !operational.data
  ) {
    throw new Error(
      "World Bank WDI source is not operational for commercial macro signals",
    );
  }

  //
  // Do not normalize directly from the append-only raw observation table.
  // Repeated governed ingests can legitimately leave historical rows there,
  // and the Supabase/PostgREST response cap can truncate a raw-table scan.
  // Migration 918 exposes exactly one latest verified WDI observation per
  // country + metric, so the peer universe remains deterministic and bounded.
  //
  const rows =
    await db
      .from(
        "live_world_bank_indicator_latest",
      )
      .select(`
        country_iso3,
        metric,
        value_numeric,
        unit,
        observed_at
      `)
      .eq(
        "metric",
        input.metric,
      )
      .lte(
        "observed_at",
        input.as_of,
      )
      .limit(
        1000,
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

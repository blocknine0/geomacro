import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  buildCountryIntelligenceState,
  type CountryIntelligenceObservationInput,
} from "./country-intelligence-state-engine";

import type {
  CountryIntelligenceState,
} from "./country-intelligence-state-contract";


export type GenerateCountryIntelligenceStateInput = {
  country_iso3:
    string;

  as_of?:
    string;
};


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


export async function
generateCountryIntelligenceState(
  input:
    GenerateCountryIntelligenceStateInput,
): Promise<
  CountryIntelligenceState
> {
  const db =
    requireRiskSupabase();

  const countryIso3 =
    normalizeIso3(
      input.country_iso3,
    );

  const asOf =
    input.as_of ??
    new Date()
      .toISOString();

  const countryResult =
    await db
      .from(
        "live_country_registry",
      )
      .select(
        "iso3,country_name",
      )
      .eq(
        "iso3",
        countryIso3,
      )
      .eq(
        "enabled",
        true,
      )
      .maybeSingle();

  if (
    countryResult.error
  ) {
    throw new Error(
      `Country registry lookup failed: ${countryResult.error.message}`,
    );
  }

  if (
    !countryResult.data
  ) {
    throw new Error(
      `Country not found in registry: ${countryIso3}`,
    );
  }

  const sourcesResult =
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
    sourcesResult.error
  ) {
    throw new Error(
      `External source registry lookup failed: ${sourcesResult.error.message}`,
    );
  }

  const sourceIds =
    (
      sourcesResult.data ??
      []
    )
      .map(
        row =>
          row.source_id,
      );

  if (
    sourceIds.length === 0
  ) {
    throw new Error(
      "No operational commercial external sources",
    );
  }

  const observationsResult =
    await db
      .from(
        "live_external_observations",
      )
      .select(`
        observation_id,
        source_id,
        category,
        country_iso3,
        metric,
        commodity,
        value_numeric,
        value_text,
        unit,
        observed_at,
        normalized_hash,
        quality_status,
        commercial_eligibility_status
      `)
      .eq(
        "country_iso3",
        countryIso3,
      )
      .in(
        "source_id",
        sourceIds,
      )
      .eq(
        "quality_status",
        "VERIFIED",
      )
      .eq(
        "commercial_eligibility_status",
        "VERIFIED",
      )
      .limit(
        10000,
      );

  if (
    observationsResult.error
  ) {
    throw new Error(
      `External observation lookup failed: ${observationsResult.error.message}`,
    );
  }

  const observations =
    (
      observationsResult.data ??
      []
    ) as unknown as
      CountryIntelligenceObservationInput[];

  return buildCountryIntelligenceState({
    country_iso3:
      countryIso3,

    country_name:
      countryResult
        .data
        .country_name,

    as_of:
      asOf,

    observations,
  });
}

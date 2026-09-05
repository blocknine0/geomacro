import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import type {
  CountryIntelligenceState,
} from "./country-intelligence-state-contract";


export async function
persistCountryIntelligenceState(
  state:
    CountryIntelligenceState,
) {
  const db =
    requireRiskSupabase();

  const result =
    await db
      .from(
        "country_intelligence_states",
      )
      .insert({
        state_id:
          state.state_id,

        country_iso3:
          state.country_iso3,

        schema_version:
          state.schema_version,

        methodology_version:
          state.methodology_version,

        as_of:
          state.as_of,

        generated_at:
          state.generated_at,

        observation_count:
          state.totals
            .observation_count,

        feature_count:
          state.totals
            .feature_count,

        source_count:
          state.totals
            .source_count,

        category_count:
          state.totals
            .category_count,

        input_hash:
          state.hashes
            .input_hash,

        data_hash:
          state.hashes
            .data_hash,

        calculation_hash:
          state.hashes
            .calculation_hash,

        payload:
          state,
      })
      .select(
        "state_id",
      )
      .maybeSingle();

  if (
    result.error
  ) {
    if (
      result.error.code ===
        "23505"
    ) {
      return state;
    }

    throw new Error(
      `Country intelligence state persistence failed: ${result.error.message}`,
    );
  }

  return state;
}

export async function
getLatestCountryIntelligenceState(
  countryIso3: string,
  atOrBefore?: string,
): Promise<
  CountryIntelligenceState | null
> {
  const db =
    requireRiskSupabase();

  const iso3 =
    countryIso3
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

  const cutoff =
    atOrBefore ??
    new Date()
      .toISOString();

  const cutoffDate =
    new Date(
      cutoff,
    );

  if (
    Number.isNaN(
      cutoffDate.getTime(),
    )
  ) {
    throw new Error(
      "Invalid CIS lookup timestamp",
    );
  }

  const result =
    await db
      .from(
        "country_intelligence_states",
      )
      .select(
        "payload",
      )
      .eq(
        "country_iso3",
        iso3,
      )
      .lte(
        "as_of",
        cutoffDate
          .toISOString(),
      )
      .order(
        "as_of",
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      )
      .maybeSingle();

  if (
    result.error
  ) {
    throw new Error(
      `Country intelligence state lookup failed: ${result.error.message}`,
    );
  }

  if (
    !result.data
  ) {
    return null;
  }

  const payload =
    result.data
      .payload;

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    throw new Error(
      "Persisted CIS payload is invalid",
    );
  }

  return payload as
    CountryIntelligenceState;
}

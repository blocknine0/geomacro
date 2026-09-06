import {
  generateCountryIntelligenceState,
} from "../src/lib/country-intelligence-state.server";


const country =
  process.argv[2] ??
  "IND";

const asOf =
  new Date()
    .toISOString();


const state =
  await generateCountryIntelligenceState({
    country_iso3:
      country,

    as_of:
      asOf,
  });


console.log(
  "===== COUNTRY INTELLIGENCE STATE =====",
);

console.log({
  state_id:
    state.state_id,

  country:
    state.country_iso3,

  country_name:
    state.country_name,

  as_of:
    state.as_of,

  observations:
    state.totals
      .observation_count,

  features:
    state.totals
      .feature_count,

  sources:
    state.totals
      .source_count,

  categories:
    state.totals
      .category_count,

  calculation_hash:
    state.hashes
      .calculation_hash,
});


console.log(
  "\n===== CATEGORY STATE =====",
);

console.table(
  Object.values(
    state.categories,
  ),
);


console.log(
  "\n===== FEATURE SAMPLE =====",
);

console.table(
  state.features
    .slice(
      0,
      25,
    )
    .map(
      feature => ({
        feature_key:
          feature.feature_key,

        value:
          feature
            .value_numeric ??
          feature
            .value_text,

        unit:
          feature.unit,

        observed_at:
          feature
            .observed_at,

        observations:
          feature
            .observation_count,
      }),
    ),
);


if (
  state.totals
    .observation_count === 0
) {
  throw new Error(
    "No commercial observations found",
  );
}


const replay =
  await generateCountryIntelligenceState({
    country_iso3:
      country,

    as_of:
      asOf,
  });


if (
  replay.state_id !==
    state.state_id ||
  replay.hashes
      .calculation_hash !==
    state.hashes
      .calculation_hash
) {
  throw new Error(
    "Country intelligence deterministic replay failed",
  );
}


console.log(
  "\nPASS: COUNTRY INTELLIGENCE STATE DETERMINISTIC REPLAY CLEAN",
);

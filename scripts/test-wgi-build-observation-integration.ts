import {
  buildWgiPoliticalStabilityBundle,
  WGI_POLITICAL_STABILITY_INDICATORS,
} from "../src/lib/wgi-political-stability-contract";

import {
  mapWgiPoliticalStabilityToObservationInput,
} from "../src/lib/wgi-political-stability-observation-mapper";

import {
  buildObservation,
} from "./lib-live-source-utils.mjs";


function row(
  indicator:
    string,

  value:
    number,
) {
  return {
    indicator: {
      id:
        indicator,

      value:
        indicator,
    },

    country: {
      id:
        "IN",

      value:
        "India",
    },

    countryiso3code:
      "IND",

    date:
      "2024",

    value,
  };
}


const rawRows = [
  row(
    WGI_POLITICAL_STABILITY_INDICATORS.ESTIMATE,
    -0.7857625,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS.SCORE,
    52.4723123,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS.SCORE_LOWER,
    46.2443539,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS.SCORE_UPPER,
    58.7002706,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS.STANDARD_ERROR,
    0.2223173,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS.SOURCE_COUNT,
    12,
  ),
];


const result =
  buildWgiPoliticalStabilityBundle(
    rawRows,
  );


if (
  result.status !==
  "ACCEPTED"
) {
  throw new Error(
    "Valid WGI bundle rejected",
  );
}


const mapped =
  mapWgiPoliticalStabilityToObservationInput({
    bundle:
      result.bundle,

    raw_rows:
      rawRows,

    source_url:
      "https://api.worldbank.org/v2/country/IND/indicator/GOV_WGI_PV.EST?source=3",
  });


const observation =
  buildObservation(
    mapped,
  );


if (
  observation.source_id !==
    "world_bank_wgi_political_stability"
) {
  throw new Error(
    "WGI source mismatch",
  );
}


if (
  observation.metric !==
    "political_stability_absolute_score"
) {
  throw new Error(
    "WGI metric mismatch",
  );
}


if (
  observation.value_numeric !==
    52.4723123
) {
  throw new Error(
    "WGI score mismatch",
  );
}


if (
  observation.provenance
    .standard_error !==
    0.2223173 ||
  observation.provenance
    .source_count !==
    12
) {
  throw new Error(
    "WGI uncertainty provenance lost",
  );
}


if (
  observation.provenance
    .methodology_status !==
    "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "WGI evidence escaped GRO v0.2 boundary",
  );
}


if (
  !/^[0-9a-f]{64}$/.test(
    observation.raw_hash,
  ) ||
  !/^[0-9a-f]{64}$/.test(
    observation.normalized_hash,
  )
) {
  throw new Error(
    "WGI observation hashes invalid",
  );
}


const repeated =
  buildObservation(
    mapped,
  );


if (
  repeated.observation_id !==
    observation.observation_id ||
  repeated.raw_hash !==
    observation.raw_hash ||
  repeated.normalized_hash !==
    observation.normalized_hash
) {
  throw new Error(
    "WGI observation is not deterministic",
  );
}


console.log({
  observation_id:
    observation.observation_id,

  country_iso3:
    observation.country_iso3,

  metric:
    observation.metric,

  score:
    observation.value_numeric,

  standard_error:
    observation.provenance
      .standard_error,

  source_count:
    observation.provenance
      .source_count,

  raw_hash:
    observation.raw_hash,

  normalized_hash:
    observation.normalized_hash,
});


console.log(
  "PASS: WGI BUNDLE MAPS TO buildObservation()",
);

console.log(
  "PASS: WGI UNCERTAINTY + SOURCE COUNT PRESERVED",
);

console.log(
  "PASS: WGI HASHES + OBSERVATION ID ARE DETERMINISTIC",
);

console.log(
  "PASS: WGI POLITICAL STABILITY REMAINS OUTSIDE GRO v0.2",
);

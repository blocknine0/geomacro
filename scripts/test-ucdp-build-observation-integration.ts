import {
  transformUcdpGedBatch,
} from "../src/lib/ucdp-ged-source-adapter";

import {
  mapUcdpGedToObservationInput,
} from "../src/lib/ucdp-ged-observation-mapper";

import {
  buildObservation,
} from "./lib-live-source-utils.mjs";


const raw = {
  id:
    9001,

  date_start:
    "2025-07-01",

  date_end:
    "2025-07-02",

  country:
    "India",

  conflict_new_id:
    500,

  dyad_new_id:
    600,

  type_of_violence:
    1,

  best:
    8,

  low:
    6,

  high:
    10,

  deaths_civilians:
    1,

  deaths_unknown:
    0,

  latitude:
    28.6,

  longitude:
    77.2,
};


const source = {
  transport:
    "API" as const,

  dataset_version:
    "26.1" as const,

  retrieved_at:
    "2026-09-06T07:30:00.000Z",

  source_url:
    "https://ucdpapi.pcr.uu.se/api/gedevents/26.1",

  licence:
    "CC BY 4.0" as const,
};


const batch =
  transformUcdpGedBatch({
    rows: [
      raw,
    ],

    source,

    resolveCountryIso3:
      country =>
        country ===
        "India"
          ? "IND"
          : null,
  });


if (
  batch.accepted.length !==
  1
) {
  throw new Error(
    "Expected one accepted UCDP row",
  );
}


const accepted =
  batch.accepted[0];


const mapped =
  mapUcdpGedToObservationInput({
    normalized:
      accepted.normalized,

    raw:
      accepted.raw,

    source:
      accepted.source,
  });


const observation =
  buildObservation(
    mapped,
  );


if (
  observation.source_id !==
    "ucdp_ged"
) {
  throw new Error(
    "source_id mismatch",
  );
}


if (
  observation.category !==
    "GEOPOLITICS"
) {
  throw new Error(
    "category mismatch",
  );
}


if (
  observation.metric !==
    "conflict_event_best_estimate_deaths"
) {
  throw new Error(
    "metric mismatch",
  );
}


if (
  observation.quality_status !==
    "VERIFIED"
) {
  throw new Error(
    "quality status mismatch",
  );
}


if (
  observation
    .commercial_eligibility_status !==
    "VERIFIED"
) {
  throw new Error(
    "commercial eligibility mismatch",
  );
}


if (
  !/^[0-9a-f]{64}$/.test(
    observation.raw_hash,
  )
) {
  throw new Error(
    "raw_hash is not SHA-256",
  );
}


if (
  !/^[0-9a-f]{64}$/.test(
    observation.normalized_hash,
  )
) {
  throw new Error(
    "normalized_hash is not SHA-256",
  );
}


if (
  observation.observation_id !==
  `ucdp_ged_${observation.normalized_hash.slice(0, 32)}`
) {
  throw new Error(
    "observation_id is not deterministic",
  );
}


/*
 * Rebuild the same observation.
 *
 * Hashes must remain identical because
 * canonical source evidence is identical.
 */
const repeated =
  buildObservation(
    mapped,
  );


if (
  repeated.raw_hash !==
    observation.raw_hash ||
  repeated.normalized_hash !==
    observation.normalized_hash ||
  repeated.observation_id !==
    observation.observation_id
) {
  throw new Error(
    "Repeated observation construction is not deterministic",
  );
}


if (
  observation.provenance
    .methodology_status !==
  "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "UCDP evidence escaped GRO v0.2 boundary",
  );
}


console.log({
  observation_id:
    observation.observation_id,

  source_id:
    observation.source_id,

  country_iso3:
    observation.country_iso3,

  metric:
    observation.metric,

  value_numeric:
    observation.value_numeric,

  raw_hash:
    observation.raw_hash,

  normalized_hash:
    observation.normalized_hash,

  methodology_status:
    observation.provenance
      .methodology_status,
});


console.log(
  "PASS: UCDP MAPPER INTEGRATES WITH EXISTING buildObservation()",
);

console.log(
  "PASS: RAW + NORMALIZED SHA-256 HASHES ARE GENERATED",
);

console.log(
  "PASS: OBSERVATION ID IS DETERMINISTIC",
);

console.log(
  "PASS: IDENTICAL INPUT PRODUCES IDENTICAL HASHES",
);

console.log(
  "PASS: UCDP EVIDENCE REMAINS OUTSIDE GRO v0.2",
);

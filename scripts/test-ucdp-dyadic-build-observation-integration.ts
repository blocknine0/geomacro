import {
  transformUcdpDyadicRecord,
} from "../src/lib/ucdp-dyadic-contract";

import {
  mapUcdpDyadicEvidenceToObservationInput,
} from "../src/lib/ucdp-dyadic-observation-mapper";

import {
  buildObservation,
} from "./lib-live-source-utils.mjs";


const raw = {
  dyad_id:
    101,

  conflict_id:
    77,

  location:
    "Example Interstate Conflict",

  side_a:
    "State A",

  side_a_id:
    1,

  side_b:
    "State B",

  side_b_id:
    2,

  year:
    2025,

  type_of_conflict:
    2,

  intensity_level:
    2,

  start_date:
    "2025-01-01",

  start_date2:
    "2025-02-01",

  ep_end_date:
    null,
};


const result =
  transformUcdpDyadicRecord(
    raw,
  );


if (
  result.status !==
    "ACCEPTED"
) {
  throw new Error(
    "Valid interstate dyad rejected",
  );
}


const mapped =
  mapUcdpDyadicEvidenceToObservationInput({
    evidence:
      result.evidence,

    raw,

    source_url:
      "https://ucdpapi.pcr.uu.se/api/dyadic/26.1",
  });


const observation =
  buildObservation(
    mapped,
  );


if (
  observation.source_id !==
    "ucdp_dyadic"
) {
  throw new Error(
    "UCDP Dyadic source mismatch",
  );
}


if (
  observation.metric !==
    "interstate_conflict_dyad"
) {
  throw new Error(
    "UCDP Dyadic metric mismatch",
  );
}


if (
  observation.value_numeric !==
    2
) {
  throw new Error(
    "UCDP Dyadic intensity mismatch",
  );
}


if (
  observation.provenance
    .type_of_conflict !==
    2
) {
  throw new Error(
    "Interstate type not preserved",
  );
}


if (
  observation.provenance
    .methodology_status !==
    "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "UCDP Dyadic escaped GRO v0.2 boundary",
  );
}


if (
  observation
    .commercial_eligibility_status !==
    "REVIEW_REQUIRED"
) {
  throw new Error(
    "UCDP Dyadic commercial gate lost",
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
    "UCDP Dyadic hashes invalid",
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
    "UCDP Dyadic observation is not deterministic",
  );
}


console.log({
  observation_id:
    observation.observation_id,

  metric:
    observation.metric,

  value_numeric:
    observation.value_numeric,

  value_text:
    observation.value_text,

  observed_at:
    observation.observed_at,

  commercial_eligibility_status:
    observation
      .commercial_eligibility_status,

  raw_hash:
    observation.raw_hash,

  normalized_hash:
    observation.normalized_hash,
});


console.log(
  "PASS: UCDP DYADIC EVIDENCE MAPS TO buildObservation()",
);

console.log(
  "PASS: INTERSTATE INTENSITY + DYAD IDENTITY PRESERVED",
);

console.log(
  "PASS: UCDP DYADIC HASHES ARE DETERMINISTIC",
);

console.log(
  "PASS: UCDP DYADIC REMAINS EVIDENCE-ONLY",
);

import {
  buildSanctionsProgramEvidence,
} from "../src/lib/sanctions-evidence-contract";

import {
  mapSanctionsEvidenceToObservationInput,
} from "../src/lib/sanctions-observation-mapper";

import {
  buildObservation,
} from "./lib-live-source-utils.mjs";


const evidence =
  buildSanctionsProgramEvidence({
    source:
      "OFAC_SDN",

    program:
      "IRAN",

    designation_count:
      674,

    retrieved_at:
      "2026-09-06T08:30:00.000Z",

    source_url:
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
  });


const mapped =
  mapSanctionsEvidenceToObservationInput(
    evidence,
  );


if (
  mapped.countryIso3 !==
    "IRN"
) {
  throw new Error(
    "Mapped sanctions country mismatch",
  );
}


const observation =
  buildObservation(
    mapped,
  );


if (
  observation.source_id !==
    "ofac_sanctions_program"
) {
  throw new Error(
    "Sanctions source_id mismatch",
  );
}


if (
  observation.metric !==
    "sanctions_program_designation_count"
) {
  throw new Error(
    "Sanctions metric mismatch",
  );
}


if (
  observation.value_numeric !==
    674
) {
  throw new Error(
    "Sanctions designation count mismatch",
  );
}


if (
  observation.provenance
    .methodology_status !==
    "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "Sanctions evidence escaped GRO v0.2 boundary",
  );
}


if (
  observation.provenance
    .commercial_status !==
    "REVIEW_REQUIRED"
) {
  throw new Error(
    "Sanctions source-policy review state was not preserved in provenance",
  );
}


if (
  observation
    .commercial_eligibility_status !==
    "UNVERIFIED"
) {
  throw new Error(
    "Review-required sanctions evidence must persist as DB-valid UNVERIFIED",
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
    "Sanctions observation hashes invalid",
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
    "Sanctions observation is not deterministic",
  );
}


console.log({
  observation_id:
    observation.observation_id,

  country_iso3:
    observation.country_iso3,

  metric:
    observation.metric,

  value_numeric:
    observation.value_numeric,

  commercial_eligibility_status:
    observation
      .commercial_eligibility_status,

  source_policy_status:
    observation.provenance
      .commercial_status,

  raw_hash:
    observation.raw_hash,

  normalized_hash:
    observation.normalized_hash,
});


console.log(
  "PASS: SANCTIONS EVIDENCE MAPS TO buildObservation()",
);

console.log(
  "PASS: SANCTIONS OBSERVATION HASHES ARE DETERMINISTIC",
);

console.log(
  "PASS: REVIEW_REQUIRED MAPS TO DB-VALID UNVERIFIED",
);

console.log(
  "PASS: SANCTIONS REMAIN OUTSIDE GRO v0.2",
);

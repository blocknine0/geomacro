import {
  transformUcdpGedBatch,
} from "../src/lib/ucdp-ged-source-adapter";

import {
  mapUcdpGedToObservationInput,
} from "../src/lib/ucdp-ged-observation-mapper";


const raw = {
  id:
    555,

  date_start:
    "2025-06-01",

  date_end:
    "2025-06-03",

  country:
    "India",

  conflict_new_id:
    101,

  dyad_new_id:
    202,

  type_of_violence:
    1,

  best:
    7,

  low:
    5,

  high:
    9,

  deaths_civilians:
    2,

  deaths_unknown:
    0,

  latitude:
    28.61,

  longitude:
    77.21,
};


const batch =
  transformUcdpGedBatch({
    source: {
      transport:
        "API",

      dataset_version:
        "26.1",

      retrieved_at:
        "2026-09-06T07:00:00.000Z",

      source_url:
        "https://ucdpapi.pcr.uu.se/api/gedevents/26.1",

      licence:
        "CC BY 4.0",
    },

    resolveCountryIso3:
      country =>
        country ===
        "India"
          ? "IND"
          : null,

    rows: [
      raw,
    ],
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


if (
  accepted.raw !==
  raw
) {
  throw new Error(
    "Original raw UCDP row was not preserved",
  );
}


const mapped =
  mapUcdpGedToObservationInput({
    normalized:
      accepted.normalized,

    raw:
      accepted.raw,

    source:
      accepted.source,
  });


if (
  mapped.sourceId !==
    "ucdp_ged" ||
  mapped.category !==
    "GEOPOLITICS" ||
  mapped.metric !==
    "conflict_event_best_estimate_deaths"
) {
  throw new Error(
    "Observation identity mapping mismatch",
  );
}


if (
  mapped.signalType !==
    "conflict_exposure" ||
  mapped.eventType !==
    "organized_violence_event"
) {
  throw new Error(
    "Conflict observation semantics mismatch",
  );
}


if (
  mapped.provenance.dataset_version !==
    "26.1" ||
  mapped.provenance.licence !==
    "CC BY 4.0"
) {
  throw new Error(
    "Source provenance not preserved",
  );
}


if (
  mapped.provenance.methodology_status !==
    "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "UCDP evidence escaped GRO v0.2 boundary",
  );
}


if (
  mapped.rawPayload.id !==
    555
) {
  throw new Error(
    "Raw payload was not preserved for hashing",
  );
}


console.log(
  mapped,
);

console.log(
  "PASS: RAW UCDP ROW IS PRESERVED FOR RAW HASHING",
);

console.log(
  "PASS: NORMALIZED UCDP EVIDENCE MAPS TO buildObservation INPUT",
);

console.log(
  "PASS: VERSION + LICENCE + SOURCE PROVENANCE PRESERVED",
);

console.log(
  "PASS: CONFLICT EVIDENCE REMAINS OUTSIDE GRO v0.2",
);

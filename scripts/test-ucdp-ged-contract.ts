import {
  transformUcdpGedRecord,
} from "../src/lib/ucdp-ged-contract";


const accepted =
  transformUcdpGedRecord({
    country_iso3:
      "IND",

    raw: {
      id:
        12345,

      date_start:
        "2025-01-10",

      date_end:
        "2025-01-12",

      country:
        "India",

      conflict_new_id:
        100,

      dyad_new_id:
        200,

      type_of_violence:
        1,

      best:
        12,

      low:
        10,

      high:
        15,

      deaths_civilians:
        3,

      deaths_unknown:
        1,

      latitude:
        28.6,

      longitude:
        77.2,
    },
  });


if (
  accepted.status !==
  "ACCEPTED"
) {
  throw new Error(
    "Valid UCDP record rejected",
  );
}


if (
  accepted.normalized.metric !==
  "conflict_event_best_estimate_deaths"
) {
  throw new Error(
    "Unexpected UCDP metric",
  );
}


if (
  accepted.normalized
    .provenance
    .methodology_status !==
  "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "UCDP evidence must remain outside frozen GRO v0.2",
  );
}


const unmapped =
  transformUcdpGedRecord({
    country_iso3:
      null,

    raw: {
      id:
        1,

      date_start:
        "2025-01-01",

      date_end:
        "2025-01-02",

      country:
        "Unknown",

      best:
        2,
    },
  });


if (
  unmapped.status !==
    "REJECTED" ||
  unmapped.reason !==
    "country_unmapped_or_invalid"
) {
  throw new Error(
    "Unmapped country must fail closed",
  );
}


const badDeaths =
  transformUcdpGedRecord({
    country_iso3:
      "USA",

    raw: {
      id:
        2,

      date_start:
        "2025-01-01",

      date_end:
        "2025-01-02",

      country:
        "United States",

      best:
        -1,
    },
  });


if (
  badDeaths.status !==
    "REJECTED" ||
  badDeaths.reason !==
    "missing_or_invalid_best_deaths"
) {
  throw new Error(
    "Negative deaths must fail closed",
  );
}


const badDates =
  transformUcdpGedRecord({
    country_iso3:
      "BRA",

    raw: {
      id:
        3,

      date_start:
        "2025-02-10",

      date_end:
        "2025-02-01",

      country:
        "Brazil",

      best:
        1,
    },
  });


if (
  badDates.status !==
    "REJECTED" ||
  badDates.reason !==
    "event_start_after_end"
) {
  throw new Error(
    "Invalid date ordering must fail closed",
  );
}


console.log(
  accepted.normalized,
);


console.log(
  "PASS: VALID UCDP GED RECORD NORMALIZES DETERMINISTICALLY",
);

console.log(
  "PASS: UNMAPPED COUNTRIES FAIL CLOSED",
);

console.log(
  "PASS: INVALID FATALITY VALUES FAIL CLOSED",
);

console.log(
  "PASS: INVALID EVENT DATE ORDER FAILS CLOSED",
);

console.log(
  "PASS: UCDP CONFLICT EVIDENCE DOES NOT ENTER GRO v0.2",
);

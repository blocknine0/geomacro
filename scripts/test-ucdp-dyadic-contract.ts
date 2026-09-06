import {
  transformUcdpDyadicRecord,
} from "../src/lib/ucdp-dyadic-contract";


const accepted =
  transformUcdpDyadicRecord({
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
      1,

    start_date:
      "2025-01-01",

    start_date2:
      "2025-02-01",

    ep_end_date:
      null,
  });


if (
  accepted.status !==
    "ACCEPTED"
) {
  throw new Error(
    "Valid interstate dyad rejected",
  );
}


if (
  accepted.evidence
    .type_of_conflict !==
    2
) {
  throw new Error(
    "Interstate type lost",
  );
}


if (
  accepted.evidence
    .methodology_status !==
    "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "Dyadic evidence escaped GRO v0.2 boundary",
  );
}


const intrastate =
  transformUcdpDyadicRecord({
    dyad_id:
      102,

    conflict_id:
      78,

    side_a:
      "Government",

    side_a_id:
      1,

    side_b:
      "Rebel Group",

    side_b_id:
      99,

    year:
      2025,

    type_of_conflict:
      3,

    intensity_level:
      1,
  });


if (
  intrastate.status !==
    "REJECTED" ||
  intrastate.reason !==
    "not_interstate_conflict"
) {
  throw new Error(
    "Non-interstate dyad must fail closed",
  );
}


const missing =
  transformUcdpDyadicRecord({
    dyad_id:
      103,

    conflict_id:
      79,

    side_a:
      "State A",

    year:
      2025,

    type_of_conflict:
      2,
  });


if (
  missing.status !==
    "REJECTED" ||
  missing.reason !==
    "missing_required_dyad_identity"
) {
  throw new Error(
    "Incomplete interstate dyad must fail closed",
  );
}


console.log(
  accepted.evidence,
);

console.log(
  "PASS: TYPE_OF_CONFLICT=2 IS ACCEPTED AS INTERSTATE EVIDENCE",
);

console.log(
  "PASS: NON-INTERSTATE DYADS FAIL CLOSED",
);

console.log(
  "PASS: INCOMPLETE DYAD IDENTITIES FAIL CLOSED",
);

console.log(
  "PASS: UCDP DYADIC EVIDENCE REMAINS OUTSIDE GRO v0.2",
);

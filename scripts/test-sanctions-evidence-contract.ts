import {
  buildSanctionsProgramEvidence,
} from "../src/lib/sanctions-evidence-contract";


const direct =
  buildSanctionsProgramEvidence({
    source:
      "OFAC_SDN",

    program:
      "RUSSIA-EO14024",

    designation_count:
      6348,

    retrieved_at:
      "2026-09-06T08:30:00.000Z",

    source_url:
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
  });


if (
  direct.attribution_mode !==
    "DIRECT_JURISDICTION" ||
  direct.jurisdiction_iso3 !==
    "RUS"
) {
  throw new Error(
    "Direct sanctions attribution failed",
  );
}


const thematic =
  buildSanctionsProgramEvidence({
    source:
      "OFAC_SDN",

    program:
      "SDGT",

    designation_count:
      3259,

    retrieved_at:
      "2026-09-06T08:30:00.000Z",

    source_url:
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
  });


if (
  thematic.attribution_mode !==
    "NO_DIRECT_JURISDICTION"
) {
  throw new Error(
    "Thematic sanctions program incorrectly received country attribution",
  );
}


const unknown =
  buildSanctionsProgramEvidence({
    source:
      "OFAC_SDN",

    program:
      "FUTURE-UNKNOWN-PROGRAM",

    designation_count:
      1,

    retrieved_at:
      "2026-09-06T08:30:00.000Z",

    source_url:
      "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML",
  });


if (
  unknown.attribution_mode !==
    "NO_DIRECT_JURISDICTION" ||
  unknown.attribution_reason !==
    "REQUIRES_SEPARATE_REVIEW"
) {
  throw new Error(
    "Unknown sanctions program did not fail closed",
  );
}


for (
  const evidence of
  [
    direct,
    thematic,
    unknown,
  ]
) {
  if (
    evidence.methodology_status !==
      "EVIDENCE_ONLY_NOT_IN_GRO_V02"
  ) {
    throw new Error(
      "Sanctions evidence escaped GRO v0.2 boundary",
    );
  }

  if (
    evidence.commercial_status !==
      "REVIEW_REQUIRED"
  ) {
    throw new Error(
      "Sanctions commercial gate opened prematurely",
    );
  }
}


console.log(
  direct,
);

console.log(
  thematic,
);

console.log(
  unknown,
);


console.log(
  "PASS: DIRECT OFAC PROGRAMS PRODUCE EXPLICIT JURISDICTION EVIDENCE",
);

console.log(
  "PASS: THEMATIC PROGRAMS PRODUCE NON-DIRECT EVIDENCE",
);

console.log(
  "PASS: UNKNOWN PROGRAMS FAIL CLOSED",
);

console.log(
  "PASS: SANCTIONS EVIDENCE REMAINS COMMERCIAL-REVIEW GATED",
);

console.log(
  "PASS: SANCTIONS EVIDENCE REMAINS OUTSIDE GRO v0.2",
);

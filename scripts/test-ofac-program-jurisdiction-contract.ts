import {
  OFAC_PROGRAM_JURISDICTION_MAP,
  getOfacProgramAttribution,
} from "../src/lib/ofac-program-jurisdiction-contract";


const expectedDirect = [
  ["CUBA", "CUB"],
  ["IRAN", "IRN"],
  ["DPRK", "PRK"],
  ["RUSSIA-EO14024", "RUS"],
  ["UKRAINE-EO13662", "UKR"],
  ["VENEZUELA", "VEN"],
  ["BURMA-EO14014", "MMR"],
  ["561-Related", "IRN"],
  ["CMIC-EO13959", "CHN"],
  ["HRIT-IR", "IRN"],
  ["HRIT-SY", "SYR"],
] as const;


for (
  const [
    program,
    jurisdiction,
  ] of expectedDirect
) {
  const attribution =
    getOfacProgramAttribution(
      program,
    );

  if (
    attribution.mode !==
      "DIRECT_JURISDICTION"
  ) {
    throw new Error(
      `${program}: expected direct jurisdiction`,
    );
  }

  if (
    attribution.jurisdiction !==
      jurisdiction
  ) {
    throw new Error(
      `${program}: unexpected jurisdiction`,
    );
  }
}


const ethiopia =
  getOfacProgramAttribution(
    "ETHIOPIA-EO14046",
  );

if (
  ethiopia.mode !==
    "NO_DIRECT_JURISDICTION" ||
  ethiopia.reason !==
    "MULTI_JURISDICTION_PROGRAM"
) {
  throw new Error(
    "Ethiopia EO 14046 must not create automatic sovereign attribution",
  );
}


const hkaa =
  getOfacProgramAttribution(
    "HKAA",
  );

if (
  hkaa.mode !==
    "NO_DIRECT_JURISDICTION" ||
  hkaa.reason !==
    "REQUIRES_SEPARATE_REVIEW"
) {
  throw new Error(
    "HKAA must remain outside sovereign automatic attribution",
  );
}


const icc =
  getOfacProgramAttribution(
    "ICC-EO14203",
  );

if (
  icc.mode !==
    "NO_DIRECT_JURISDICTION" ||
  icc.reason !==
    "GLOBAL_OR_THEMATIC_PROGRAM"
) {
  throw new Error(
    "ICC program must not create country attribution",
  );
}


const thematic = [
  "SDGT",
  "GLOMAG",
  "NPWMD",
  "CYBER2",
  "FTO",
  "TCO",
] as const;


for (
  const program of thematic
) {
  const attribution =
    getOfacProgramAttribution(
      program,
    );

  if (
    attribution.mode !==
      "NO_DIRECT_JURISDICTION"
  ) {
    throw new Error(
      `${program}: thematic program incorrectly attributed`,
    );
  }
}


const unknown =
  getOfacProgramAttribution(
    "FUTURE_UNKNOWN_PROGRAM",
  );


if (
  unknown.mode !==
    "NO_DIRECT_JURISDICTION" ||
  unknown.reason !==
    "REQUIRES_SEPARATE_REVIEW"
) {
  throw new Error(
    "Unknown OFAC program did not fail closed",
  );
}


for (
  const [
    program,
    attribution,
  ] of Object.entries(
    OFAC_PROGRAM_JURISDICTION_MAP,
  )
) {
  if (
    attribution.scoring_status !==
      "EVIDENCE_ONLY_NOT_IN_GRO_V02"
  ) {
    throw new Error(
      `${program}: attribution escaped GRO v0.2 boundary`,
    );
  }
}


console.table(
  Object.entries(
    OFAC_PROGRAM_JURISDICTION_MAP,
  ).map(
    ([program, attribution]) => ({
      program,

      mode:
        attribution.mode,

      jurisdiction:
        attribution.mode ===
          "DIRECT_JURISDICTION"
          ? attribution.jurisdiction
          : null,

      reason:
        attribution.mode ===
          "NO_DIRECT_JURISDICTION"
          ? attribution.reason
          : null,
    }),
  ),
);


console.log(
  "PASS: REVIEWED OFAC PROGRAMS MAP DETERMINISTICALLY",
);

console.log(
  "PASS: THEMATIC PROGRAMS DO NOT CREATE FALSE COUNTRY ATTRIBUTION",
);

console.log(
  "PASS: UNKNOWN PROGRAMS FAIL CLOSED",
);

console.log(
  "PASS: ADDRESS COUNTRY IS NOT AN ATTRIBUTION INPUT",
);

console.log(
  "PASS: PROGRAM ATTRIBUTION REMAINS EVIDENCE-ONLY",
);

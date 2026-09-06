import {
  SANCTIONS_SOURCES,
  getSanctionsSource,
} from "../src/lib/sanctions-source-contract";


if (
  SANCTIONS_SOURCES.length !==
  3
) {
  throw new Error(
    "Unexpected sanctions source count",
  );
}


for (
  const source of
  SANCTIONS_SOURCES
) {
  if (
    source.commercial_gate !==
    "REVIEW_REQUIRED"
  ) {
    throw new Error(
      `${source.source_key}: commercial gate opened prematurely`,
    );
  }

  if (
    source.customer_raw_redistribution !==
    false
  ) {
    throw new Error(
      `${source.source_key}: raw redistribution must remain disabled`,
    );
  }

  if (
    source.scoring_status !==
    "EVIDENCE_ONLY_NOT_IN_GRO_V02"
  ) {
    throw new Error(
      `${source.source_key}: sanctions evidence escaped GRO v0.2 boundary`,
    );
  }
}


const ofac =
  getSanctionsSource(
    "ofac_sdn",
  );


if (
  ofac.implementation_gate !==
    "INTERFACE_VERIFIED"
) {
  throw new Error(
    "OFAC SDN interface should be verified",
  );
}


const unsc =
  getSanctionsSource(
    "unsc_consolidated",
  );


if (
  unsc.implementation_gate !==
    "INTERFACE_VERIFIED"
) {
  throw new Error(
    "UNSC official XML interface should be verified",
  );
}


console.table(
  SANCTIONS_SOURCES.map(
    source => ({
      source:
        source.source_key,

      authority:
        source.authority,

      commercial:
        source.commercial_gate,

      implementation:
        source.implementation_gate,

      scoring:
        source.scoring_status,
    }),
  ),
);


console.log(
  "PASS: SANCTIONS SOURCES REMAIN COMMERCIAL-REVIEW GATED",
);

console.log(
  "PASS: OFAC INTERFACE STATUS IS DISTINCT FROM COMMERCIAL ELIGIBILITY",
);

console.log(
  "PASS: UNSC EXACT INTERFACE REMAINS FAIL-CLOSED",
);

console.log(
  "PASS: RAW CUSTOMER REDISTRIBUTION DISABLED",
);

console.log(
  "PASS: SANCTIONS EVIDENCE REMAINS OUTSIDE GRO v0.2",
);

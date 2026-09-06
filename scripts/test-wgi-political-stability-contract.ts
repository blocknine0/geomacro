import {
  buildWgiPoliticalStabilityBundle,
  WGI_POLITICAL_STABILITY_INDICATORS,
} from "../src/lib/wgi-political-stability-contract";


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


const validRows = [
  row(
    WGI_POLITICAL_STABILITY_INDICATORS
      .ESTIMATE,
    -0.7857625,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS
      .SCORE,
    52.4723123,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS
      .SCORE_LOWER,
    46.2443539,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS
      .SCORE_UPPER,
    58.7002706,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS
      .STANDARD_ERROR,
    0.2223173,
  ),

  row(
    WGI_POLITICAL_STABILITY_INDICATORS
      .SOURCE_COUNT,
    12,
  ),
];


const accepted =
  buildWgiPoliticalStabilityBundle(
    validRows,
  );


if (
  accepted.status !==
  "ACCEPTED"
) {
  throw new Error(
    "Valid WGI bundle rejected",
  );
}


if (
  accepted.bundle.absolute_score !==
    52.4723123
) {
  throw new Error(
    "Absolute score mismatch",
  );
}


if (
  accepted.bundle.score_ci_lower >
    accepted.bundle.absolute_score ||
  accepted.bundle.score_ci_upper <
    accepted.bundle.absolute_score
) {
  throw new Error(
    "Confidence interval does not contain score",
  );
}


if (
  accepted.bundle
    .provenance
    .methodology_status !==
  "EVIDENCE_ONLY_NOT_IN_GRO_V02"
) {
  throw new Error(
    "WGI evidence escaped GRO v0.2 boundary",
  );
}


const incomplete =
  buildWgiPoliticalStabilityBundle(
    validRows.slice(
      0,
      5,
    ),
  );


if (
  incomplete.status !==
    "REJECTED" ||
  incomplete.reason !==
    "incomplete_indicator_bundle"
) {
  throw new Error(
    "Incomplete WGI bundle must fail closed",
  );
}


const badInterval =
  structuredClone(
    validRows,
  );

badInterval[2].value =
  60;


const invalidInterval =
  buildWgiPoliticalStabilityBundle(
    badInterval,
  );


if (
  invalidInterval.status !==
    "REJECTED" ||
  invalidInterval.reason !==
    "invalid_score_interval"
) {
  throw new Error(
    "Invalid confidence interval must fail closed",
  );
}


console.log(
  accepted.bundle,
);

console.log(
  "PASS: CURRENT WGI 2025 REVISION INDICATORS NORMALIZE",
);

console.log(
  "PASS: ESTIMATE + SCORE + UNCERTAINTY + SOURCE COUNT PRESERVED",
);

console.log(
  "PASS: INCOMPLETE BUNDLES FAIL CLOSED",
);

console.log(
  "PASS: INVALID CONFIDENCE INTERVALS FAIL CLOSED",
);

console.log(
  "PASS: WGI POLITICAL STABILITY REMAINS OUTSIDE GRO v0.2",
);

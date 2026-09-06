import {
  evaluateGeopoliticsDimensionCoverage,
  type GeopoliticsDimensionCoverageInput,
} from "../src/lib/geopolitics-dimension-coverage";


const india:
  GeopoliticsDimensionCoverageInput = {
    country_iso3:
      "IND",

    dimensions: {
      FORCED_DISPLACEMENT:
        "AVAILABLE",

      CONFLICT_EXPOSURE:
        "NOT_YET_IMPLEMENTED",

      POLITICAL_INSTABILITY:
        "NOT_YET_IMPLEMENTED",

      SANCTIONS_COERCION:
        "NOT_YET_IMPLEMENTED",

      INTERSTATE_TENSION:
        "NOT_YET_IMPLEMENTED",
    },
  };


const result =
  evaluateGeopoliticsDimensionCoverage(
    india,
  );


if (
  result
    .has_any_structural_geopolitical_signal !==
  true
) {
  throw new Error(
    "Expected structural geopolitical signal",
  );
}


if (
  result
    .has_full_structural_geopolitical_coverage !==
  false
) {
  throw new Error(
    "Single dimension must not imply full geopolitical coverage",
  );
}


if (
  result.available_dimensions.length !==
  1
) {
  throw new Error(
    "Expected one available geopolitical dimension",
  );
}


if (
  result
    .not_yet_implemented_dimensions
    .length !==
  4
) {
  throw new Error(
    "Expected four future geopolitical dimensions",
  );
}


console.log(
  result,
);


console.log(
  "PASS: ANY GEOPOLITICAL SIGNAL IS DISTINCT FROM FULL COVERAGE",
);

console.log(
  "PASS: UNHCR FORCED DISPLACEMENT CAN BE ONE STRUCTURAL DIMENSION",
);

console.log(
  "PASS: FUTURE DIMENSIONS REMAIN EXPLICITLY NOT IMPLEMENTED",
);

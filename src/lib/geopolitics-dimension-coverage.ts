export const GEOPOLITICS_DIMENSION_COVERAGE_VERSION =
  "geopolitics-dimension-coverage-v0.1.0" as const;


export type GeopoliticalDimension =
  | "FORCED_DISPLACEMENT"
  | "CONFLICT_EXPOSURE"
  | "POLITICAL_INSTABILITY"
  | "SANCTIONS_COERCION"
  | "INTERSTATE_TENSION";


export type GeopoliticalDimensionStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE"
  | "NOT_YET_IMPLEMENTED";


export type GeopoliticsDimensionCoverageInput = {
  country_iso3: string;

  dimensions: Record<
    GeopoliticalDimension,
    GeopoliticalDimensionStatus
  >;
};


export type GeopoliticsDimensionCoverageResult = {
  version:
    typeof GEOPOLITICS_DIMENSION_COVERAGE_VERSION;

  country_iso3:
    string;

  available_dimensions:
    GeopoliticalDimension[];

  partial_dimensions:
    GeopoliticalDimension[];

  unavailable_dimensions:
    GeopoliticalDimension[];

  not_yet_implemented_dimensions:
    GeopoliticalDimension[];

  has_any_structural_geopolitical_signal:
    boolean;

  has_full_structural_geopolitical_coverage:
    boolean;

  coverage_ratio:
    number;
};


function normalizeIso3(
  value: string,
): string {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      iso3,
    )
  ) {
    throw new Error(
      "country_iso3 must be ISO3",
    );
  }

  return iso3;
}


export function evaluateGeopoliticsDimensionCoverage(
  input: GeopoliticsDimensionCoverageInput,
): GeopoliticsDimensionCoverageResult {
  const countryIso3 =
    normalizeIso3(
      input.country_iso3,
    );

  const entries =
    Object.entries(
      input.dimensions,
    ) as Array<
      [
        GeopoliticalDimension,
        GeopoliticalDimensionStatus,
      ]
    >;


  const available =
    entries
      .filter(
        ([, status]) =>
          status ===
          "AVAILABLE",
      )
      .map(
        ([dimension]) =>
          dimension,
      );


  const partial =
    entries
      .filter(
        ([, status]) =>
          status ===
          "PARTIAL",
      )
      .map(
        ([dimension]) =>
          dimension,
      );


  const unavailable =
    entries
      .filter(
        ([, status]) =>
          status ===
          "UNAVAILABLE",
      )
      .map(
        ([dimension]) =>
          dimension,
      );


  const notYetImplemented =
    entries
      .filter(
        ([, status]) =>
          status ===
          "NOT_YET_IMPLEMENTED",
      )
      .map(
        ([dimension]) =>
          dimension,
      );


  /*
   * Any AVAILABLE or PARTIAL implemented
   * geopolitical dimension counts as some
   * structural geopolitical intelligence.
   */
  const hasAnyStructuralSignal =
    available.length > 0 ||
    partial.length > 0;


  /*
   * Full structural coverage requires every
   * defined dimension to be AVAILABLE.
   *
   * This deliberately prevents one UNHCR
   * dimension from being described as full
   * geopolitical coverage.
   */
  const fullCoverage =
    entries.every(
      ([, status]) =>
        status ===
        "AVAILABLE",
    );


  const implemented =
    entries.filter(
      ([, status]) =>
        status !==
        "NOT_YET_IMPLEMENTED",
    );


  const coveredImplemented =
    implemented.filter(
      ([, status]) =>
        status ===
          "AVAILABLE" ||
        status ===
          "PARTIAL",
    );


  const ratio =
    implemented.length === 0
      ? 0
      : coveredImplemented.length /
        implemented.length;


  return {
    version:
      GEOPOLITICS_DIMENSION_COVERAGE_VERSION,

    country_iso3:
      countryIso3,

    available_dimensions:
      available,

    partial_dimensions:
      partial,

    unavailable_dimensions:
      unavailable,

    not_yet_implemented_dimensions:
      notYetImplemented,

    has_any_structural_geopolitical_signal:
      hasAnyStructuralSignal,

    has_full_structural_geopolitical_coverage:
      fullCoverage,

    coverage_ratio:
      ratio,
  };
}

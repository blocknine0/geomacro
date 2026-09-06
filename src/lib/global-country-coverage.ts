export const GLOBAL_COVERAGE_VERSION =
  "global-country-coverage-v1.0.0" as const;

export const LOCALIZATION_CONTRACT_VERSION =
  "risk-localization-v1.0.0" as const;

export type CountryCoverageStatus =
  | "FULL"
  | "PARTIAL"
  | "SPARSE"
  | "NO_CURRENT_SIGNAL";

export type CountryCoverageInput = {
  evidence_count: number;
  unique_event_count: number;
  independent_source_count: number;
  latest_signal_at?: string | null;
  as_of?: string;
};

export type CountryCoverageResult = {
  version:
    typeof GLOBAL_COVERAGE_VERSION;

  status:
    CountryCoverageStatus;

  evidence_count:
    number;

  unique_event_count:
    number;

  independent_source_count:
    number;

  latest_signal_at:
    string | null;

  age_hours:
    number | null;

  reason_codes:
    string[];
};

function finiteCount(
  value: number,
) {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return Math.floor(value);
}

function ageHours(
  latest:
    string | null | undefined,
  asOf:
    string,
): number | null {
  if (!latest) return null;

  const latestDate =
    new Date(latest);

  const asOfDate =
    new Date(asOf);

  if (
    Number.isNaN(
      latestDate.getTime(),
    ) ||
    Number.isNaN(
      asOfDate.getTime(),
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    (
      asOfDate.getTime() -
      latestDate.getTime()
    ) /
      3_600_000,
  );
}

export function
evaluateCountryCoverage(
  input: CountryCoverageInput,
): CountryCoverageResult {
  const evidenceCount =
    finiteCount(
      input.evidence_count,
    );

  const eventCount =
    finiteCount(
      input.unique_event_count,
    );

  const sourceCount =
    finiteCount(
      input.independent_source_count,
    );

  const asOf =
    input.as_of ??
    new Date().toISOString();

  const age =
    ageHours(
      input.latest_signal_at,
      asOf,
    );

  const reasons:
    string[] = [];

  let status:
    CountryCoverageStatus;

  if (
    evidenceCount === 0 &&
    eventCount === 0
  ) {
    status =
      "NO_CURRENT_SIGNAL";

    reasons.push(
      "no_current_country_signal",
    );
  } else if (
    evidenceCount === 0 &&
    eventCount > 0
  ) {
    status =
      "SPARSE";

    reasons.push(
      "supporting_country_event_without_primary_evidence",
    );
  } else if (
    eventCount === 0
  ) {
    status =
      "SPARSE";

    reasons.push(
      "country_evidence_without_structured_event",
    );
  } else if (
    age !== null &&
    age > 72
  ) {
    status =
      "NO_CURRENT_SIGNAL";

    reasons.push(
      "country_signal_outside_72h_window",
    );
  } else if (
    evidenceCount >= 8 &&
    eventCount >= 3 &&
    sourceCount >= 4
  ) {
    status =
      "FULL";

    reasons.push(
      "sufficient_multi_event_multi_source_coverage",
    );
  } else if (
    evidenceCount >= 3 &&
    eventCount >= 2 &&
    sourceCount >= 2
  ) {
    status =
      "PARTIAL";

    reasons.push(
      "usable_but_limited_country_coverage",
    );
  } else {
    status =
      "SPARSE";

    reasons.push(
      "insufficient_country_evidence_depth",
    );
  }

  return {
    version:
      GLOBAL_COVERAGE_VERSION,

    status,

    evidence_count:
      evidenceCount,

    unique_event_count:
      eventCount,

    independent_source_count:
      sourceCount,

    latest_signal_at:
      input.latest_signal_at ??
      null,

    age_hours:
      age === null
        ? null
        : Math.round(
            age * 1000,
          ) / 1000,

    reason_codes:
      reasons,
  };
}

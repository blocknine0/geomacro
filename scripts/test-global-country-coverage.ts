import {
  evaluateCountryCoverage,
} from "../src/lib/global-country-coverage";

const AS_OF =
  "2026-09-05T14:00:00.000Z";

const tests = [
  {
    name:
      "full",

    input: {
      evidence_count: 10,
      unique_event_count: 4,
      independent_source_count: 6,
      latest_signal_at:
        "2026-09-05T13:00:00.000Z",
      as_of:
        AS_OF,
    },

    expected:
      "FULL",
  },
  {
    name:
      "partial",

    input: {
      evidence_count: 4,
      unique_event_count: 2,
      independent_source_count: 2,
      latest_signal_at:
        "2026-09-05T13:00:00.000Z",
      as_of:
        AS_OF,
    },

    expected:
      "PARTIAL",
  },
  {
    name:
      "supporting event only",

    input: {
      evidence_count: 0,
      unique_event_count: 2,
      independent_source_count: 0,
      latest_signal_at:
        null,
      as_of:
        AS_OF,
    },

    expected:
      "SPARSE",
  },
  {
    name:
      "no signal",

    input: {
      evidence_count: 0,
      unique_event_count: 0,
      independent_source_count: 0,
      latest_signal_at:
        null,
      as_of:
        AS_OF,
    },

    expected:
      "NO_CURRENT_SIGNAL",
  },
] as const;

for (
  const test of tests
) {
  const result =
    evaluateCountryCoverage(
      test.input,
    );

  console.log({
    test:
      test.name,

    status:
      result.status,

    reasons:
      result.reason_codes,
  });

  if (
    result.status !==
      test.expected
  ) {
    throw new Error(
      `${test.name}: expected ${test.expected}, got ${result.status}`,
    );
  }
}

console.log(
  "PASS: global country coverage semantics clean",
);

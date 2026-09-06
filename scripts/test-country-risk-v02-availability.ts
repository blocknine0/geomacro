import {
  determineCompositeAvailability,
} from "../src/lib/country-risk-v02-availability";


const cases =
  [
    {
      event_available:
        true,
      macro_available:
        true,
      expected:
        "FULL",
      score:
        true,
    },

    {
      event_available:
        true,
      macro_available:
        false,
      expected:
        "EVENT_ONLY",
      score:
        true,
    },

    {
      event_available:
        false,
      macro_available:
        true,
      expected:
        "MACRO_ONLY",
      score:
        false,
    },

    {
      event_available:
        false,
      macro_available:
        false,
      expected:
        "UNAVAILABLE",
      score:
        false,
    },
  ] as const;


for (
  const testCase of cases
) {
  const result =
    determineCompositeAvailability({
      event_available:
        testCase.event_available,

      macro_available:
        testCase.macro_available,
    });


  console.log(result);


  if (
    result.status !==
    testCase.expected
  ) {
    throw new Error(
      `Expected ${testCase.expected}, got ${result.status}`,
    );
  }


  if (
    result.composite_score_available !==
    testCase.score
  ) {
    throw new Error(
      `${testCase.expected}: composite availability mismatch`,
    );
  }
}


console.log(
  "PASS: COMPOSITE AVAILABILITY POLICY CLEAN",
);

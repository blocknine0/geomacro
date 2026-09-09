import {
  describe,
  expect,
  it,
} from "vitest";

import {
  runInstitutionalCorridorDemo,
} from "../../scripts/run-institutional-corridor-demo";

describe(
  "institutional corridor integration demo",
  () => {
    it(
      "cryptographically verifies a signed structured Risk Object and returns a non-authorizing treasury decision",
      () => {
        const result =
          runInstitutionalCorridorDemo();

        expect(result.mode).toBe(
          "SIMULATION_FIXTURE",
        );
        expect(
          result.risk_object
            .cryptographic_valid,
        ).toBe(true);
        expect(
          result.risk_object
            .verification_status,
        ).toBe("VERIFIED");
        expect(
          result.risk_gate
            .recommended_action,
        ).toBe(
          "REQUIRE_HUMAN_APPROVAL",
        );
        expect(
          result.risk_gate
            .execution_authorized,
        ).toBe(false);
        expect(
          result.risk_gate
            .counterfactual.blockers,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "positive_delta",
            }),
          ]),
        );
        expect(
          result.local_processing_latency_ms
            .total,
        ).toBeGreaterThanOrEqual(0);
      },
    );
  },
);
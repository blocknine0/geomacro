import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HOME = readFileSync(
  "src/components/home/commercial-home.tsx",
  "utf8",
);

function currentPilotFlow(source: string): string {
  const start = source.indexOf(
    "Planned controlled workflow",
  );
  const end = source.indexOf(
    "Who Geomacro is for",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("homepage Risk Gate control ordering", () => {
  it("keeps Risk Gate response before customer policy and preserves non-authorization", () => {
    const flow = currentPilotFlow(HOME);

    const recommendation = flow.indexOf(
      "Risk Gate recommendation returned",
    );
    const policy = flow.indexOf(
      "Customer policy decides what happens next",
    );
    const nonAuthorization = flow.indexOf(
      "Geomacro does not authorize or execute the transaction",
    );
    const executionAuthorized = flow.indexOf(
      "execution_authorized",
    );

    expect(recommendation).toBeGreaterThanOrEqual(0);
    expect(policy).toBeGreaterThan(recommendation);
    expect(nonAuthorization).toBeGreaterThan(policy);
    expect(executionAuthorized).toBeGreaterThan(nonAuthorization);
  });

  it("does not reintroduce policy-before-recommendation ordering", () => {
    const flow = currentPilotFlow(HOME);

    const recommendation = flow.indexOf(
      "Risk Gate recommendation returned",
    );
    const policy = flow.indexOf(
      "Customer policy decides what happens next",
    );

    expect(recommendation).toBeGreaterThanOrEqual(0);
    expect(policy).toBeGreaterThan(recommendation);
    expect(flow).not.toContain(
      '"Customer policy decides what happens next",\n                 "Risk Gate recommendation returned"',
    );
  });
});

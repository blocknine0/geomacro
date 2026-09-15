import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HOME = readFileSync(
  "src/components/home/commercial-home.tsx",
  "utf8",
);

function currentPilotFlow(source: string): string {
  const start = source.indexOf(
    "Current Private Pilot control flow",
  );
  const end = source.indexOf(
    "Geomacro does not authorize or execute the transaction",
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("homepage Risk Gate control ordering", () => {
  it("keeps Risk Gate response before customer policy and customer execution", () => {
    const flow = currentPilotFlow(HOME);

    const recommendation = flow.indexOf(
      "Risk Gate recommendation returned to the customer's system",
    );
    const policy = flow.indexOf(
      "Customer-owned policy applied by the customer system",
    );
    const execution = flow.indexOf(
      "Any downstream execution remains customer-controlled",
    );

    expect(recommendation).toBeGreaterThanOrEqual(0);
    expect(policy).toBeGreaterThan(recommendation);
    expect(execution).toBeGreaterThan(policy);
  });

  it("does not reintroduce the old policy-before-recommendation sequence", () => {
    const flow = currentPilotFlow(HOME);

    expect(flow).not.toContain(
      '"Customer-owned policy applied by the customer system",\n                "Recommendation returned to the customer\'s system"',
    );
  });
});

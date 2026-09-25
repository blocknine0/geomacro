import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("live x402 prelaunch safety probe", () => {
  it("requires fail-closed production behavior before activation", () => {
    const source = readFileSync("scripts/agentic/verify-live-x402-prelaunch-availability.mjs", "utf8");

    expect(source).toContain("response.status === 422");
    expect(source).toContain("result.deliverable === false");
    expect(source).toContain("body.payment_required_now === false");
    expect(source).toContain("body.execution_authorized === false");
    expect(source).toContain("all_representative_cases_fail_closed");
  });
});

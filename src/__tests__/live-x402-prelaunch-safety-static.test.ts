import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("live x402 prelaunch safety probe", () => {
  it("allows no-charge testnet readiness without authorizing production funds", () => {
    const source = readFileSync("scripts/agentic/verify-live-x402-prelaunch-availability.mjs", "utf8");

    expect(source).toContain('const BASE_SEPOLIA_NETWORK = "eip155:84532"');
    expect(source).toContain("response.status === 422");
    expect(source).toContain("result.deliverable === false");
    expect(source).toContain("response.status === 200");
    expect(source).toContain("result.deliverable === true");
    expect(source).toContain("result.network === BASE_SEPOLIA_NETWORK");
    expect(source).toContain("body.payment_required_now === false");
    expect(source).toContain("body.execution_authorized === false");
    expect(source).toContain("all_representative_cases_safe_prelaunch");
    expect(source).toContain("all_available_cases_testnet_only");
    expect(source).toContain("payable_production_resources_advertised: 0");
  });
});

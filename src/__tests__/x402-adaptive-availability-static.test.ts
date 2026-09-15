import fs from "node:fs";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync("src/routes/api.x402.risk.availability.ts", "utf8");
const resolver = fs.readFileSync("src/lib/agent-query-deliverability.server.ts", "utf8");

describe("x402 adaptive availability surface", () => {
  it("is explicitly no-charge and fail-closed", () => {
    expect(route).toContain("payment_required_now: false");
    expect(route).toContain("chargeable: availability.deliverable");
    expect(route).toContain("AVAILABILITY_CHECK_UNAVAILABLE");
    expect(route).not.toContain("settleCoinbaseX402");
    expect(route).not.toContain("verifyCoinbaseX402");
  });

  it("uses deterministic query planning and governed warehouse deliverability", () => {
    expect(route).toContain("buildAgentQueryPlan");
    expect(route).toContain("checkAgentQueryDeliverability");
    expect(resolver).toContain("loadStructuralContext");
    expect(resolver).toContain("STALE_REQUIRED_DATA");
    expect(resolver).toContain("INSUFFICIENT_COVERAGE");
  });
});

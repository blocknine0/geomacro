import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const probes = [
  "scripts/agentic/verify-live-x402-prelaunch-availability.mjs",
  "scripts/agentic/verify-live-x402-country-availability-census.mjs",
];
function refusalCodes(source: string) {
  const body = source.match(/const SAFE_FAIL_CLOSED_CODES = new Set\(\[([\s\S]*?)\]\);/u)?.[1];
  if (!body) throw new Error("SAFE_FAIL_CLOSED_CODES missing");
  return new Set([...body.matchAll(/"([A-Z_]+)"/gu)].map(x => x[1]));
}

describe("#1827 x402 stale evidence must not trigger payment or unsafe prelaunch", () => {
  it.each(probes)("treats true stale-data refusal as safe but NEVER available: %s", (path) => {
    const source = readFileSync(path, "utf8");
    const allowed = refusalCodes(source);
    expect(allowed.has("STALE_REQUIRED_DATA")).toBe(true);
    expect(allowed.has("INSUFFICIENT_COVERAGE")).toBe(true);
    expect(allowed.has("COMMERCIAL_SOURCE_NOT_ELIGIBLE")).toBe(true);
    expect(allowed.has("AVAILABLE")).toBe(false);
    expect(allowed.has("RATE_LIMITED")).toBe(false);
    expect(allowed.has("PAYMENT_REQUIRED")).toBe(false);
    const safeRefusal = (args: {
      status: number; deliverable: boolean; code: string;
      paymentRequired: boolean; execution: boolean; hash: string;
    }) => (
      args.status === 422 && !args.deliverable &&
      args.paymentRequired === false && args.execution === false &&
      /^[0-9a-f]{64}$/u.test(args.hash) && allowed.has(args.code)
    );
    const original = {
      status: 422, deliverable: false, code: "STALE_REQUIRED_DATA",
      paymentRequired: false, execution: false, hash: "a".repeat(64),
    };
    expect(safeRefusal(original)).toBe(true);
    expect(safeRefusal({ ...original, status: 200 })).toBe(false);
    expect(safeRefusal({ ...original, status: 402 })).toBe(false);
    expect(safeRefusal({ ...original, paymentRequired: true })).toBe(false);
    expect(safeRefusal({ ...original, execution: true })).toBe(false);
    expect(safeRefusal({ ...original, deliverable: true })).toBe(false);
    expect(safeRefusal({ ...original, hash: "" })).toBe(false);
    expect(safeRefusal({ ...original, code: "AVAILABLE" })).toBe(false);
    expect(safeRefusal({ ...original, code: "UNKNOWN" })).toBe(false);
    expect(source).toContain("payment_required_now === false");
    expect(source).toContain("execution_authorized === false");
    expect(source).toContain("response.status === 422");
  });
  it("never counts failed-closed cases toward 195+ deliverable commercial paths", () => {
    const prelaunch = readFileSync(probes[0], "utf8");
    const census = readFileSync(probes[1], "utf8");
    expect(prelaunch).toContain("all_representative_cases_available: allRepresentativeAvailable");
    expect(prelaunch).toContain("if (REQUIRE_REPRESENTATIVE_AVAILABLE && !allRepresentativeAvailable)");
    expect(census).toContain('outcome: "FAIL_CLOSED"');
    expect(census).toContain("const available = results.filter((row) => row.outcome === \"AVAILABLE\")");
    expect(census).toContain("available.length < MIN_DELIVERABLE");
    expect(census).toContain("X402_COUNTRY_DELIVERABILITY_BELOW_1414_TARGET");
  });
});

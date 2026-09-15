import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("industry-ready website contract", () => {
  it("makes coverage state explicit without inventing a universal country count", () => {
    const section = read("src/components/home/industry-readiness-section.tsx");

    expect(section).toContain("Coverage is data-driven and auditable");
    expect(section).toContain("AVAILABLE");
    expect(section).toContain("UNAVAILABLE");
    expect(section).toContain("NOT_CONFIGURED");
    expect(section).toContain("INSUFFICIENT_COVERAGE");
    expect(section.toLowerCase()).not.toContain("all countries supported");
    expect(section.toLowerCase()).not.toContain("global coverage guaranteed");
  });

  it("preserves the no-charge-unavailable invariant in public product copy", () => {
    const section = read("src/components/home/industry-readiness-section.tsx");
    const availability = read("src/routes/api.x402.risk_.availability.ts");
    const paid = read("src/routes/api.x402.intelligence.ts");

    expect(section).toContain("No payment is requested when required coverage is unavailable, stale or commercially ineligible");
    expect(availability).toContain("payment_required_now: false");
    expect(availability).toContain("Geomacro will not request or settle payment while required coverage is unavailable, stale, or commercially ineligible");
    expect(paid).toContain("if (!availability.deliverable)");
    expect(paid).toContain("no payment is accepted");
  });

  it("does not present staged paid-agent access as open real-funds production", () => {
    const section = read("src/components/home/industry-readiness-section.tsx");
    const readiness = read("docs/COINBASE_X402_MAINNET_READINESS.md");

    expect(section).toContain("real-funds activation is a separate launch gate");
    expect(readiness).toContain("REAL-FUNDS GATE LOCKED");
    expect(section.toLowerCase()).not.toContain("mainnet live");
  });

  it("keeps the machine decision boundary non-authorizing", () => {
    const section = read("src/components/home/industry-readiness-section.tsx");

    expect(section).toContain("execution_authorized=false");
    expect(section).toContain("Customer identity, permissions, policy, funds and any downstream action remain customer-controlled");
  });
});

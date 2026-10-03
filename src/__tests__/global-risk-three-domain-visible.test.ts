import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/global-risk.tsx", "utf8");
const cards = readFileSync("src/components/gri/global-risk-domain-indices.tsx", "utf8");
const assembler = readFileSync("src/lib/global-risk-assemble.ts", "utf8");

describe("Global Risk three-domain visibility", () => {
  it("keeps the fixed three-domain cards on the Global Risk route in addition to the combined GRI workspace", () => {
    expect(route).toContain("GlobalRiskDomainIndices");
    expect(route).toContain("GlobalRiskWorkspace");
    expect(route).toContain("<GlobalRiskDomainIndices />");
    expect(route).toContain("<GlobalRiskWorkspace />");
  });

  it("renders all three canonical domain cards from a fixed specification instead of the variable driver list", () => {
    expect(cards).toContain('key: "geopolitics"');
    expect(cards).toContain('key: "macro"');
    expect(cards).toContain('key: "rare_earth"');
    expect(cards).toContain('name: "Geopolitical Risk Index"');
    expect(cards).toContain('name: "Macroeconomic Risk Index"');
    expect(cards).toContain('name: "Critical Minerals Risk Index"');
    expect(cards).toContain("DOMAIN_INDEX_SPECS.map");
    expect(cards).toContain("data?.domainIndices[spec.key]");
    expect(cards).toContain("Three risk indices, always visible");
    expect(cards).toContain("keeps showing that domain&apos;s last verified reading");
    expect(cards).not.toContain("data.drivers.map");
    expect(cards).not.toContain('"Unavailable"');
  });

  it("retains the newest verified reading for each domain instead of dropping a missing current-domain update", () => {
    expect(assembler).toContain("snapshots.findIndex");
    expect(assembler).toContain('snapshot.verification_status === "verified"');
    expect(assembler).toContain('readingStatus: currentIndex === 0 ? "current" : "last_verified"');
    expect(assembler).toContain("readingSnapshotId: currentSnapshot.id");
    expect(assembler).toContain("readingAsOf: currentSnapshot.as_of");
  });
});

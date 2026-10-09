import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/global-risk.tsx", "utf8");
const workspace = readFileSync("src/components/gri/global-risk-domain-indices.tsx", "utf8");
const assembler = readFileSync("src/lib/global-risk-assemble.ts", "utf8");

describe("Global Risk three-domain visibility", () => {
  it("renders one dedicated three-index workspace without the duplicate combined GRI workspace", () => {
    expect(route).toContain("GlobalRiskDomainIndices");
    expect(route).toContain("component: GlobalRiskDomainIndices");
    expect(route).not.toContain("GlobalRiskWorkspace");
    expect(route).not.toContain("RiskIndicesWorkspace");
  });

  it("renders all three canonical domain cards and all three domain history charts", () => {
    expect(workspace).toContain('key: "geopolitics"');
    expect(workspace).toContain('key: "macro"');
    expect(workspace).toContain('key: "rare_earth"');
    expect(workspace).toContain('name: "Geopolitical Risk Index"');
    expect(workspace).toContain('name: "Macroeconomic Risk Index"');
    expect(workspace).toContain('name: "Critical Minerals Risk Index"');
    expect(workspace).toContain("DOMAIN_INDEX_SPECS.map");
    expect(workspace).toContain("data.domainIndices[spec.key]");
    expect(workspace).toContain("Three risks. Three separate indices.");
    expect(workspace).toContain("Compare each risk domain on its own scale");
    expect(workspace).toContain("<RiskChart");
    expect(workspace).toContain('const TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D"]');
    expect(workspace).not.toContain("data.drivers.map");
  });

  it("retains the newest verified reading for each domain instead of dropping a missing current-domain update", () => {
    expect(assembler).toContain("snapshots.findIndex");
    expect(assembler).toContain('snapshot.verification_status === "verified"');
    expect(assembler).toContain("now - readingAt <= GRI_CURRENT_READING_WINDOW_HOURS * HOUR");
    expect(assembler).toContain('? "current"');
    expect(assembler).toContain(': "last_verified"');
    expect(assembler).toContain("readingStatus:");
    expect(assembler).toContain("readingSnapshotId: currentSnapshot.id");
    expect(assembler).toContain("readingAsOf: currentSnapshot.as_of");
  });
});

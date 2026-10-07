import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public intelligence routing contract", () => {
  it("reads verified B2 first and uses canonical scored events for recovery", () => {
    const publicRead = read("src/lib/public-intelligence.functions.ts");
    expect(publicRead).toContain("readB2PublicIntelligence");
    expect(publicRead).toContain('from("events")');
    expect(publicRead).not.toContain('from("live_structured_events")');
    expect(publicRead).toContain("PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS");
  });

  it("provides a real public event-detail route", () => {
    expect(existsSync(join(ROOT, "src/routes/event.$eventId.tsx"))).toBe(true);
    expect(read("src/routes/intelligence.tsx")).toContain('to="/event/$eventId"');
    expect(read("src/components/intelligence/event-detail-workspace.tsx")).toContain("No wallet is required to read this page");
  });

  it("keeps the public shell wallet-free", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).not.toContain("useWallet");
    expect(shell).not.toContain("ConnectButton");
  });

  it("keeps Global Risk and standalone Risk Indices on independent read paths", () => {
    const globalRiskRoute = read("src/routes/global-risk.tsx");
    const riskIndicesRoute = read("src/routes/risk-indices.tsx");
    expect(globalRiskRoute).toContain("GlobalRiskDomainIndices");
    expect(riskIndicesRoute).toContain("RiskIndicesWorkspace");
    expect(read("src/lib/use-global-risk.ts")).toContain("GLOBAL_RISK_EDGE_URL");
    expect(read("src/lib/use-risk-indices.ts")).toContain("RISK_INDICES_EDGE_URL");
  });
});

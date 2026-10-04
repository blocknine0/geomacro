import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("locked Global Risk and Risk Indices production health contract", () => {
  it("smokes client-loaded risk pages using SSR-stable markers without changing their loaded implementations", () => {
    const globalRoute = read("src/routes/global-risk.tsx");
    const globalComponent = read("src/components/gri/global-risk-domain-indices.tsx");
    const indicesComponent = read("src/components/risk-indices/risk-indices-workspace.tsx");
    const workflow = read(".github/workflows/production-website-health.yml");
    const loadedMarker = "Three risks. Three separate indices.";
    const globalSsrMarker = "Geomacro Global Risk";
    const indicesSsrMarker = "Geomacro Risk Indices";

    expect(globalRoute).toContain('import { GlobalRiskDomainIndices } from "@/components/gri/global-risk-domain-indices"');
    expect(globalRoute).toContain("component: GlobalRiskDomainIndices");
    expect(globalComponent).toContain(loadedMarker);
    expect(globalComponent).toContain(globalSsrMarker);
    expect(indicesComponent).toContain(loadedMarker);
    expect(indicesComponent).toContain(indicesSsrMarker);
    expect(indicesComponent).toContain("useRiskIndices");
    expect(workflow).toContain(`/global-risk|${globalSsrMarker}`);
    expect(workflow).toContain(`/risk-indices|${indicesSsrMarker}`);
    expect(workflow).not.toContain("/global-risk|How global risk is moving");
    expect(workflow).not.toContain(`/risk-indices|${loadedMarker}`);
  });
});

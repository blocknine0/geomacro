import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("locked Global Risk production health contract", () => {
  it("smokes the finalized three-index page without changing its implementation", () => {
    const route = read("src/routes/global-risk.tsx");
    const component = read("src/components/gri/global-risk-domain-indices.tsx");
    const workflow = read(".github/workflows/production-website-health.yml");
    const loadedMarker = "Three risks. Three separate indices.";
    const ssrMarker = "Geomacro Global Risk";

    expect(route).toContain('import { GlobalRiskDomainIndices } from "@/components/gri/global-risk-domain-indices"');
    expect(route).toContain("component: GlobalRiskDomainIndices");
    expect(component).toContain(loadedMarker);
    expect(component).toContain(ssrMarker);
    expect(workflow).toContain(`/global-risk|${ssrMarker}`);
    expect(workflow).not.toContain("/global-risk|How global risk is moving");
  });
});

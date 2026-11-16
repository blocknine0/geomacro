import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryApiPricing } from "../components/category-api-pricing";
import { ApiEndpointDirectory } from "../components/api-endpoint-directory";
import { GEOMACRO_PUBLIC_API_ENDPOINTS } from "../lib/public-api-endpoints";

const categoryPaths = [
  "/api/v1/risk-gate",
];

describe("sitewide branded public API URLs", () => {
  it("prints the unified geomacro.live Risk Gate endpoint on each category row", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing));
    expect(html.match(/geomacro\.live \/api\/v1\/risk-gate/g)?.length).toBeGreaterThanOrEqual(3);
    for (const path of categoryPaths) expect(html).toContain(`geomacro.live ${path}`);
    expect(html).not.toContain("/api/v1/intelligence/geopolitics");
    expect(html).not.toContain("/api/v1/intelligence/macro-fx");
    expect(html).not.toContain("/api/v1/intelligence/critical-minerals");
    expect(html).not.toMatch(/>POST</);
  });
  it("removes HTTP method badges from the complete public endpoint directory", () => {
    const html = renderToStaticMarkup(createElement(ApiEndpointDirectory));
    for (const endpoint of GEOMACRO_PUBLIC_API_ENDPOINTS) {
      expect(html).toContain(`geomacro.live ${endpoint.path}`);
    }
    expect(html).not.toContain(">POST<");
    expect(html).not.toContain(">GET / POST<");
    expect(html).toContain("GEOMACRO Intelligence API");
    expect(html).toContain("GEOMACRO Geopolitics API");
    expect(html).toContain("GEOMACRO Macro/FX API");
    expect(html).toContain("GEOMACRO Critical Minerals API");
  });
  it("preserves actual HTTP methods in the machine-readable source catalog", () => {
    for (const endpoint of GEOMACRO_PUBLIC_API_ENDPOINTS) {
      expect(endpoint.methods.length).toBeGreaterThan(0);
    }
    expect(GEOMACRO_PUBLIC_API_ENDPOINTS.find(x => x.id === "risk_gate")?.methods)
      .toContain("POST");
    expect(GEOMACRO_PUBLIC_API_ENDPOINTS.find(x => x.id === "pricing")?.methods)
      .toEqual(["GET"]);
  });
});

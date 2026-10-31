import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryApiPricing } from "../components/category-api-pricing";
import { ApiEndpointDirectory } from "../components/api-endpoint-directory";
import { GEOMACRO_PUBLIC_API_ENDPOINTS } from "../lib/public-api-endpoints";

const categoryPaths = [
  "/api/v1/intelligence/geopolitics",
  "/api/v1/intelligence/macro-fx",
  "/api/v1/intelligence/critical-minerals",
  "/api/v1/intelligence/query",
];

describe("sitewide branded public API URLs", () => {
  it("prints exactly the requested geomacro.live + API path on the Store for all four intelligence endpoints", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing));
    for (const path of categoryPaths) {
      expect(html).toContain(`geomacro.live ${path}`);
      expect(html).not.toContain(`POST ${path}`);
    }
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
    expect(GEOMACRO_PUBLIC_API_ENDPOINTS.find(x => x.id === "geopolitics")?.methods)
      .toContain("POST");
    expect(GEOMACRO_PUBLIC_API_ENDPOINTS.find(x => x.id === "pricing")?.methods)
      .toEqual(["GET"]);
  });
});

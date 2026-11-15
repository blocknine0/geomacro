import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryApiPricing } from "./category-api-pricing";
import { GEOMACRO_CAPABILITY_PRICES } from "@/lib/capability-pricing-catalog";

describe("three-category API pricing presentation", () => {
  it("defaults to endpoint discovery without hiding the unified endpoint",()=>{
    const html=renderToStaticMarkup(createElement(CategoryApiPricing));
    expect((html.match(/data-api-id=/g)??[])).toHaveLength(3);
    expect(html).not.toContain('data-price-usdc=');
    expect(html).not.toContain('href="#product-catalog"');
    expect(html).toContain("geomacro.live /api/v1/risk-gate");
  });
  it("shows three category rows on one canonical endpoint with Predge-parity Risk Gate pricing", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing, {showPrices:true}));
    expect((html.match(/data-api-id=/g) ?? [])).toHaveLength(3);
    expect(html).toContain('data-api-id="geopolitics"');
    expect(html).toContain("GEOMACRO Geopolitics API");
    expect(html).toContain("geomacro.live /api/v1/risk-gate");
    expect(html).toContain('data-api-id="macro_fx"');
    expect(html).toContain("GEOMACRO Macro/FX API");
    expect(html).toContain("data-risk-gate-category=\"macro-fx\"");
    expect(html).toContain('data-api-id="critical_minerals"');
    expect(html).toContain("GEOMACRO Critical Minerals API");
    expect(html).toContain("data-risk-gate-category=\"critical-minerals\"");
    expect(html.match(/geomacro\.live \/api\/v1\/risk-gate/g)?.length).toBeGreaterThanOrEqual(3);
    for (const [variant, amount] of Object.entries(GEOMACRO_CAPABILITY_PRICES.risk_gate_bundle)) {
      expect((html.match(new RegExp(`data-variant="${variant}" data-price-usdc="${amount}"`, "g")) ?? []))
        .toHaveLength(3);
    }
    expect(html).toContain("data-prepaid-credit-costs=\"15,20,30\"");
    expect(html).toContain("Official GEOMACRO Commercial Risk Gate");
    expect(html).toContain("Ed25519 GRO provenance");
  });

  it("explains category parameters and keeps payment activation gated", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing));
    expect(html).toContain("category: geopolitics | macro-fx | critical-minerals");
    expect(html).toContain("country_iso3");
    expect(html).toContain("payment activation remains separately gated");
  });
});

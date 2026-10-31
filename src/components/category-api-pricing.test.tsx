import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryApiPricing } from "./category-api-pricing";
import { GEOMACRO_CAPABILITY_PRICES } from "@/lib/capability-pricing-catalog";

describe("three-category API pricing presentation", () => {
  it("defaults to endpoint discovery with a link to the single Store schedule",()=>{
    const html=renderToStaticMarkup(createElement(CategoryApiPricing));
    expect((html.match(/data-api-id=/g)??[])).toHaveLength(3);
    expect(html).not.toContain('data-price-usdc=');
    expect(html).toContain('href="#product-catalog"');
  });
  it("shows all three canonical category endpoints with the same approved intelligence-query prices", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing, {showPrices:true}));
    expect((html.match(/data-api-id=/g) ?? [])).toHaveLength(3);
    expect(html).toContain('data-api-id="geopolitics"');
    expect(html).toContain("GEOMACRO Geopolitics API");
    expect(html).toContain("/api/v1/intelligence/geopolitics");
    expect(html).toContain('data-api-id="macro_fx"');
    expect(html).toContain("GEOMACRO Macro/FX API");
    expect(html).toContain("/api/v1/intelligence/macro-fx");
    expect(html).toContain('data-api-id="critical_minerals"');
    expect(html).toContain("GEOMACRO Critical Minerals API");
    expect(html).toContain("/api/v1/intelligence/critical-minerals");
    for (const [variant, amount] of Object.entries(GEOMACRO_CAPABILITY_PRICES.intelligence_query)) {
      expect((html.match(new RegExp(`data-variant="${variant}" data-price-usdc="${amount}"`, "g")) ?? []))
        .toHaveLength(3);
    }
  });

  it("explains shared billing and does not claim a published price activates payment", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing));
    expect(html).toContain("no category surcharge");
    expect(html).toContain("not three separate merchant resources or separate charges");
    expect(html).toContain("GEOMACRO Intelligence API");
    expect(html).not.toContain("POST ");
    expect(html).toContain("Production USDC payments remain locked pending separate approval.");
  });
});

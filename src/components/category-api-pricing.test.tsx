import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryApiPricing } from "./category-api-pricing";

describe("three-category API pricing presentation", () => {
  it("defaults to endpoint discovery without the paused Store price schedule",()=>{
    const html=renderToStaticMarkup(createElement(CategoryApiPricing));
    expect((html.match(/data-api-id=/g)??[])).toHaveLength(3);
    expect(html).not.toContain('data-price-usdc=');
    expect(html).not.toContain('href="#product-catalog"');
    expect(html).toContain("checkout remains disabled");
  });
  it("shows one unified endpoint and the Predge-parity prices across all three categories", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing, {showPrices:true}));
    expect((html.match(/data-api-id=/g) ?? [])).toHaveLength(3);
    expect(html).toContain('data-api-id="geopolitics"');
    expect(html).toContain("GEOMACRO Geopolitics API");
    expect(html).toContain("geomacro.live /api/v1/risk-gate");
    expect((html.match(/geomacro\.live \/api\/v1\/risk-gate/g)??[])).toHaveLength(3);
    expect(html).toContain('data-api-id="macro_fx"');
    expect(html).toContain("GEOMACRO Macro/FX API");
    expect(html).toContain('data-api-id="critical_minerals"');
    expect(html).toContain("GEOMACRO Critical Minerals API");
    for (const [variant, amount] of Object.entries({basic_focused:"0.15",standard:"0.20",complex_full:"0.30"})) {
      expect((html.match(new RegExp(`data-variant="${variant}" data-price-usdc="${amount}"`, "g")) ?? []))
        .toHaveLength(3);
    }
    expect(html).toContain("category: geopolitics | macro-fx | critical-minerals");
    expect(html).toContain("Focused (BASIC)");
    expect(html).toContain("Complex multi-source (COMPLEX)");
  });

  it("explains shared billing and does not claim a published price activates payment", () => {
    const html = renderToStaticMarkup(createElement(CategoryApiPricing));
    expect(html).toContain("no category surcharge");
    expect(html).toContain("Official GEOMACRO Commercial Risk Gate");
    expect(html).toContain("Ed25519-signed derived intelligence");
    expect(html).toContain("Base USDC x402 or prepaid credits");
    expect(html).toContain("geomacro.live /api/v1/risk-gate");
    expect(html).toContain("explicit production billing approval");
  });
});

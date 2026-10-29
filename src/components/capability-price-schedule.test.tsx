import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapabilityPriceSchedule } from "./capability-price-schedule";
import { ApiKeysNotice } from "./api-keys-notice";
import { CategoryApiPricing } from "./category-api-pricing";
import { StructuredProductSetup } from "./structured-product-setup";
import { publicCapabilityPricingCatalog } from "@/lib/capability-pricing-catalog";

describe("store catalog and launch availability", () => {
  it("renders exactly one price inventory across the complete Store content",()=>{
    const html=renderToStaticMarkup(createElement('main',null,
      createElement(CategoryApiPricing),createElement(CapabilityPriceSchedule),createElement(StructuredProductSetup)));
    expect((html.match(/data-price-usdc=/g)??[])).toHaveLength(12);
    expect((html.match(/data-capability="intelligence_query"/g)??[])).toHaveLength(1);
    expect(html).not.toMatch(/<option[^>]*>[^<]*USDC/);
  });
  it("shows API outputs without repeating the Store price schedule", () => {
    const html=renderToStaticMarkup(createElement(CapabilityPriceSchedule,{compact:true}));
    expect((html.match(/<article /g)??[])).toHaveLength(7);
    expect(html).not.toContain("data-price-usdc=");
    expect(html).toContain('/pricing#product-catalog');
    expect(html).toContain("What you receive");
  });
  it("renders every approved capability and exact variant price from the canonical schedule", () => {
    const html = renderToStaticMarkup(createElement(CapabilityPriceSchedule));
    expect((html.match(/<article /g) ?? [])).toHaveLength(7);
    expect((html.match(/data-price-usdc=/g) ?? [])).toHaveLength(12);
    for (const product of publicCapabilityPricingCatalog()) {
      expect(html).toContain(`data-capability="${product.capability}"`);
      for (const variant of product.variants) {
        expect(html).toContain(`data-variant="${variant.variant}" data-price-usdc="${variant.amount_usdc}"`);
      }
    }
  });
  it("keeps enquiry actions distinct from payment and labels pilot scope", () => {
    const html = renderToStaticMarkup(createElement(CapabilityPriceSchedule));
    expect((html.match(/mailto:contact@geomacro.live/g) ?? [])).toHaveLength(6);
    expect(html).toContain("Coming Soon · Not available for purchase");
    expect(html).toContain("Risk Gate is planned for a later launch");
    expect(html).toContain("Self-service checkout coming soon");
    expect(html).toContain("Private pilot");
    expect(html).toContain("physical routes are not modeled");
    expect(html).not.toContain('data-capability="gri_read"');
    expect(html).not.toContain("Buy now");
    expect(html).not.toContain("Connect wallet");
  });
  it("states API key and checkout availability before the catalog", () => {
    const html = renderToStaticMarkup(createElement(ApiKeysNotice));
    expect(html).toContain("API keys");
    expect(html).toContain("Coming soon");
    expect(html).toContain("Self-service access and checkout are not open yet.");
  });
});

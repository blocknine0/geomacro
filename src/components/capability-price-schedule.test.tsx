import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapabilityPriceSchedule } from "./capability-price-schedule";
import { ApiKeysNotice } from "./api-keys-notice";
import { capabilityPricingCatalog } from "@/lib/capability-pricing-catalog";

describe("store catalog and launch availability", () => {
  it("renders every approved capability and exact variant price from the canonical schedule", () => {
    const html = renderToStaticMarkup(createElement(CapabilityPriceSchedule));
    expect((html.match(/<article /g) ?? [])).toHaveLength(8);
    expect((html.match(/data-price-usdc=/g) ?? [])).toHaveLength(14);
    for (const product of capabilityPricingCatalog()) {
      expect(html).toContain(`data-capability="${product.capability}"`);
      for (const variant of product.variants) {
        expect(html).toContain(`data-variant="${variant.variant}" data-price-usdc="${variant.amount_usdc}"`);
      }
    }
  });
  it("keeps enquiry actions distinct from payment and labels pilot scope", () => {
    const html = renderToStaticMarkup(createElement(CapabilityPriceSchedule));
    expect((html.match(/mailto:contact@geomacro.live/g) ?? [])).toHaveLength(8);
    expect(html).toContain("Self-service checkout coming soon");
    expect(html).toContain("Private pilot");
    expect(html).toContain("physical routes are not modeled");
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

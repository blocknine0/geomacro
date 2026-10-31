import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GEOMACRO_CARD_TO_USDC_READINESS,
  GEOMACRO_CARD_TO_USDC_PRODUCTS,
  cardToUsdcCanOpenCheckout,
} from "../lib/card-to-usdc-readiness";
import { publicGeomacroPaidPricingManifest } from "../lib/geomacro-paid-pricing-manifest.server";
const page=readFileSync("src/components/low-barrier-pricing.tsx","utf8");
describe("hosted card to USDC customer checkout is safely non-payable until provider onboarding",()=>{
  it("offers the approved six products without collecting customer funds",()=>{
    expect(GEOMACRO_CARD_TO_USDC_PRODUCTS.map(x=>x.price_usd)).toEqual([9,29,99,5,15,30]);
    expect(GEOMACRO_CARD_TO_USDC_PRODUCTS.every(x=>!x.checkout_enabled)).toBe(true);
    expect(cardToUsdcCanOpenCheckout()).toBe(false);
    expect(GEOMACRO_CARD_TO_USDC_READINESS.checkout_url).toBeNull();
    expect(GEOMACRO_CARD_TO_USDC_READINESS.credits_issued).toBe(0);
    expect(GEOMACRO_CARD_TO_USDC_READINESS.payment_attempts).toBe(0);
  });
  it("does not assert unverified India merchant/card-to-Base support or renew cards",()=>{
    expect(GEOMACRO_CARD_TO_USDC_READINESS.merchant_verified).toBe(false);
    expect(GEOMACRO_CARD_TO_USDC_READINESS.native_base_usdc_settlement_verified).toBe(false);
    expect(GEOMACRO_CARD_TO_USDC_READINESS.webhook_authenticity_verified).toBe(false);
    expect(GEOMACRO_CARD_TO_USDC_READINESS.durable_idempotent_funding_verified).toBe(false);
    expect(GEOMACRO_CARD_TO_USDC_READINESS.automatic_subscription_card_renewal_enabled).toBe(false);
  });
  it("publishes accurate readiness in the unified Store and machine catalog",()=>{
    expect(page).toContain("GEOMACRO_CARD_TO_USDC_READINESS.checkout_status");
    expect(page).toContain("Awaiting merchant approval");
    expect(page).not.toContain("href=\"https://moonpay");
    const manifest=publicGeomacroPaidPricingManifest();
    expect(manifest.card_to_usdc_settlement.enabled).toBe(false);
    expect(manifest.card_to_usdc_products).toEqual(GEOMACRO_CARD_TO_USDC_PRODUCTS);
    expect(manifest.payment_authorized).toBe(false);
  });
});

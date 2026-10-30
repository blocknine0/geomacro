import { describe, it, expect } from "vitest";
import {GEOMACRO_LAUNCH_SUBSCRIPTIONS,GEOMACRO_LAUNCH_CREDIT_PACKS,
  GEOMACRO_LAUNCH_X402,GEOMACRO_LAUNCH_CHECKOUT,GEOMACRO_LAUNCH_PRICING_VERSION} from "./launch-pricing";
import {GEOMACRO_ACCESS_TIERS} from "./commercial-access-contract";
import {COMMERCIAL_OFFER_REGISTRY,structuredDeliveryPolicy} from "./structured-data-entitlement-registry";
import {publicGeomacroPaidPricingManifest} from "./geomacro-paid-pricing-manifest.server";
import {publicCapabilityPricingCatalog} from "./capability-pricing-catalog";

describe("founder-approved low-barrier pricing for new sales",()=>{
  it("publishes exactly three monthly plans at 9/29/99 USD",()=>{
    expect(GEOMACRO_LAUNCH_PRICING_VERSION).toBe("geomacro.low-barrier-pricing.v2");
    expect(GEOMACRO_LAUNCH_SUBSCRIPTIONS.map(x=>[x.monthly_price_usd,x.credits_per_30_days]))
      .toEqual([[9,1000],[29,5000],[99,25000]]);
    for(const plan of GEOMACRO_LAUNCH_SUBSCRIPTIONS){
      expect(GEOMACRO_ACCESS_TIERS[plan.id].credits_per_30_days).toBe(plan.credits_per_30_days);
      expect(COMMERCIAL_OFFER_REGISTRY[(plan.id+"_monthly") as keyof typeof COMMERCIAL_OFFER_REGISTRY]
        .entitlement_kind).toBe("subscription");
    }
    expect(structuredDeliveryPolicy("starter_dev","risk_gate_bundle").allowed).toBe(false);
    expect(structuredDeliveryPolicy("pro_analyst","risk_gate_bundle").allowed).toBe(false);
    expect(structuredDeliveryPolicy("business_pilot","risk_gate_bundle").allowed).toBe(true);
  });
  it("keeps all three one-time packs non-recurring and exact",()=>{
    expect(GEOMACRO_LAUNCH_CREDIT_PACKS.map(x=>[x.price_usd,x.credits]))
      .toEqual([[5,100],[15,500],[30,1500]]);
    expect(COMMERCIAL_OFFER_REGISTRY.prepaid_starter_100.entitlement_kind).toBe("prepaid");
    expect(COMMERCIAL_OFFER_REGISTRY.prepaid_standard_500.entitlement_kind).toBe("prepaid");
    expect(COMMERCIAL_OFFER_REGISTRY.prepaid_growth_1500.entitlement_kind).toBe("prepaid");
  });
  it("quotes only two to five cents for every public x402 capability variant",()=>{
    expect(GEOMACRO_LAUNCH_X402.network).toBe("eip155:8453");
    expect(GEOMACRO_LAUNCH_X402.intelligence_complexity_usdc)
      .toEqual({focused:"0.02",standard:"0.03",complex_multi_source:"0.05"});
    for(const row of publicCapabilityPricingCatalog())for(const variant of row.variants){
      expect(Number(variant.amount_usdc)).toBeGreaterThanOrEqual(0.02);
      expect(Number(variant.amount_usdc)).toBeLessThanOrEqual(0.05);
    }
  });
  it("never represents a catalog, mock or Stripe link placeholder as live money",()=>{
    const m=publicGeomacroPaidPricingManifest();
    expect(m.launch_pricing_version).toBe(GEOMACRO_LAUNCH_PRICING_VERSION);
    expect(m.subscriptions).toEqual(GEOMACRO_LAUNCH_SUBSCRIPTIONS);
    expect(m.one_time_credit_packs).toEqual(GEOMACRO_LAUNCH_CREDIT_PACKS);
    expect(m.checkout_readiness).toEqual(GEOMACRO_LAUNCH_CHECKOUT);
    expect(m.payment_authorized).toBe(false);
    expect(GEOMACRO_LAUNCH_CHECKOUT.stripe_subscription_checkout_active).toBe(false);
    expect(GEOMACRO_LAUNCH_CHECKOUT.payment_confirmed_credit_issuance_active).toBe(false);
  });
});

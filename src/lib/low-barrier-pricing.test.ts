import {describe,expect,it} from "vitest";
import {GEOMACRO_SUBSCRIPTIONS,GEOMACRO_ONE_TIME_PACKS,GEOMACRO_AGENT_MICROPAYMENT,GEOMACRO_LOW_BARRIER_VERSION} from "./low-barrier-pricing";
import {GEOMACRO_ACCESS_TIERS} from "./commercial-access-contract";
import {publicGeomacroPaidPricingManifest} from "./geomacro-paid-pricing-manifest.server";
describe("founder low-barrier public new-sale pricing",()=>{
 it("publishes three monthly tiers and one-time packs",()=>{
   expect(GEOMACRO_LOW_BARRIER_VERSION).toBe("geomacro.low-barrier.v1");
   expect(GEOMACRO_SUBSCRIPTIONS.map(x=>[x.price_usd,x.credits_per_30_days])).toEqual([[9,1000],[29,5000],[99,25000]]);
   expect(GEOMACRO_ONE_TIME_PACKS.map(x=>[x.price_usd,x.credits])).toEqual([[5,100],[15,500],[30,1500]]);
   for(const tier of GEOMACRO_SUBSCRIPTIONS){
     expect(GEOMACRO_ACCESS_TIERS[tier.id].credits_per_30_days).toBe(tier.credits_per_30_days);
     expect(GEOMACRO_ACCESS_TIERS[tier.id].public_price_usd).toBe(tier.price_usd);
   }
   expect(GEOMACRO_ACCESS_TIERS.analyst_pilot.pricing_reference).toBe("RETIRED_FOR_NEW_SALES");
   expect(GEOMACRO_ACCESS_TIERS.api_pilot.pricing_reference).toBe("RETIRED_FOR_NEW_SALES");
 });
 it("offers Base x402 at 0.02–0.05 without unauthorized funds",()=>{
   const x=publicGeomacroPaidPricingManifest();
   expect(x.launch_pricing_version).toBe(GEOMACRO_LOW_BARRIER_VERSION);
   expect(x.subscriptions).toBe(GEOMACRO_SUBSCRIPTIONS);
   expect(x.one_time_credit_packs).toBe(GEOMACRO_ONE_TIME_PACKS);
   expect(x.agent_x402.network).toBe("eip155:8453");
   expect(x.subscription_checkout_status).toBe("NOT_YET_VERIFIED");
   expect(x.credit_pack_checkout_status).toBe("NOT_YET_VERIFIED");
   expect(x.payment_authorized).toBe(false);
   expect(GEOMACRO_AGENT_MICROPAYMENT.minimum_usdc).toBe("0.02");
   expect(GEOMACRO_AGENT_MICROPAYMENT.maximum_usdc).toBe("0.05");
   for(const row of x.capabilities)for(const v of row.variants){
     expect(Number(v.price_usdc)).toBeGreaterThanOrEqual(0.02);
     expect(Number(v.price_usdc)).toBeLessThanOrEqual(0.05);
   }
   expect(x.capabilities.some(x=>x.capability==="gri_read")).toBe(false);
 });
});

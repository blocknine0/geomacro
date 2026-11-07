import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {GEOMACRO_CREDIT_COSTS,GEOMACRO_CREDIT_CONTRACT_VERSION,GEOMACRO_ACCESS_TIERS} from "./commercial-access-contract";
import {GEOMACRO_SUBSCRIPTIONS,GEOMACRO_ONE_TIME_PACKS} from "./low-barrier-pricing";
import {STRUCTURED_TIER_REGISTRY} from "./structured-data-entitlement-registry";
import {publicGeomacroPaidPricingManifest} from "./geomacro-paid-pricing-manifest.server";
import {GEOMACRO_NEW_SALE_TIER_CAPABILITIES,GEOMACRO_CUSTOMER_METERABLE_CAPABILITIES} from "./credit-metering-policy.mjs";
import {CUSTOMER_CREDIT_CONTRACT,CUSTOMER_CREDIT_COSTS,CUSTOMER_ENABLED_CAPABILITIES,customerPaidCapabilityPolicy} from "../../workers/control-plane/src/customer-paid-ledger.mjs";

describe("Store, pricing API and D1 paid-credit parity: NO FUNDS",()=>{
 it("uses identical pricing sources, unchanged plan and pack rates",()=>{
  const m=publicGeomacroPaidPricingManifest();
  expect(CUSTOMER_CREDIT_COSTS).toBe(GEOMACRO_CREDIT_COSTS);
  expect(CUSTOMER_CREDIT_CONTRACT).toBe(GEOMACRO_CREDIT_CONTRACT_VERSION);
  expect(m.prepaid_credit_contract_version).toBe(CUSTOMER_CREDIT_CONTRACT);
  expect(m.prepaid_credit_costs).toBe(CUSTOMER_CREDIT_COSTS);
  expect(m.customer_paid_api_activation_authorized).toBe(false);
  expect(m.payment_authorized).toBe(false);
  expect(m.prepaid_vs_direct_usdc).toBe("SEPARATE_BILLING_MODES_NO_IMPLIED_USDC_PER_CREDIT");
  expect(m.one_time_credit_packs).toEqual(GEOMACRO_ONE_TIME_PACKS);
  expect(m.subscriptions).toEqual(GEOMACRO_SUBSCRIPTIONS);
  expect(GEOMACRO_SUBSCRIPTIONS.map(x=>[x.price_usd,x.credits_per_30_days]))
   .toEqual([[9,1000],[29,5000],[99,25000]]);
  expect(GEOMACRO_ONE_TIME_PACKS.map(x=>[x.price_usd,x.credits]))
   .toEqual([[5,100],[15,500],[30,1500]]);
  for(const p of GEOMACRO_SUBSCRIPTIONS){
   const tier=GEOMACRO_ACCESS_TIERS[p.id];
   expect(tier.public_price_usd).toBe(p.price_usd);
   expect(tier.credits_per_30_days).toBe(p.credits_per_30_days);
   expect(STRUCTURED_TIER_REGISTRY[p.id].included_capabilities)
    .toEqual(GEOMACRO_NEW_SALE_TIER_CAPABILITIES[p.id]);
  }
  for(const p of m.capabilities)for(const v of p.variants){
   expect(v.prepaid_credit_cost).toBe(CUSTOMER_CREDIT_COSTS[p.capability]);
   expect(v.prepaid_customer_metering_staged)
    .toBe(CUSTOMER_ENABLED_CAPABILITIES.includes(p.capability));
  }
 });
 it("locks immutable SQL trigger costs to the same source",()=>{
  const sql=readFileSync("workers/control-plane/migrations/0096_customer_prepaid_pack_spend.sql","utf8");
  for(const [capability,cost] of Object.entries(GEOMACRO_CREDIT_COSTS))
   expect(sql).toContain(`WHEN '${capability}' THEN ${cost}`);
  expect(sql).toContain("CUSTOMER_LOCKED_CAPABILITY_COST_REQUIRED");
 });
 it("does not authorize unavailable Risk Gate or retired GRI to funded customers",()=>{
  expect(GEOMACRO_ACCESS_TIERS.starter_dev.structured_data.risk_gate).toBe(false);
  expect(GEOMACRO_ACCESS_TIERS.pro_analyst.structured_data.risk_gate).toBe(false);
  for(const tier of ["starter_dev","pro_analyst","business_pilot","credits_100","credits_500","credits_1500"])
   for(const capability of ["gri_read","risk_gate_bundle","risk_gate_basic_focused","risk_gate_standard","risk_gate_complex_full"])
    expect(customerPaidCapabilityPolicy(tier,capability)).toBe(false);
  expect(CUSTOMER_ENABLED_CAPABILITIES).toEqual(GEOMACRO_CUSTOMER_METERABLE_CAPABILITIES);
  expect(GEOMACRO_NEW_SALE_TIER_CAPABILITIES.business_pilot).toContain("risk_gate_bundle");
 });
});

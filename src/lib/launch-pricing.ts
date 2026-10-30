/** Canonical GeoMacro launch pricing, effective for new sales.
 * Catalog alone never authorizes payment, subscription or credit grants.
 */
export const GEOMACRO_LAUNCH_PRICING_VERSION = "geomacro.low-barrier-pricing.v2" as const;
export const GEOMACRO_LAUNCH_SUBSCRIPTIONS = [
  {id:"starter_dev",name:"Starter / Dev",monthly_price_usd:9,monthly_price_cents:900,
    credits_per_30_days:1000,audience:"Developers, students and traders",
    benefits:["Three-category structured intelligence","API access within credits"]},
  {id:"pro_analyst",name:"Pro Analyst",monthly_price_usd:29,monthly_price_cents:2900,
    credits_per_30_days:5000,audience:"Commodity analysts and supply-chain teams",
    benefits:["Three-category structured intelligence","Critical Minerals alerts (activation pending)"]},
  {id:"business_pilot",name:"Business Pilot",monthly_price_usd:99,monthly_price_cents:9900,
    credits_per_30_days:25000,audience:"Fintech and import-export startups",
    benefits:["Three-category structured intelligence","Full corridor Risk Gate (eligibility gated)"]},
] as const;
export const GEOMACRO_LAUNCH_CREDIT_PACKS = [
  {id:"pack_starter",name:"Starter Pack",price_usd:5,price_cents:500,credits:100},
  {id:"pack_standard",name:"Standard Pack",price_usd:15,price_cents:1500,credits:500},
  {id:"pack_growth",name:"Growth Pack",price_usd:30,price_cents:3000,credits:1500},
] as const;
export const GEOMACRO_LAUNCH_X402 = {
  network:"eip155:8453",network_name:"Base",currency:"USDC",
  per_call_min_usdc:"0.02",per_call_max_usdc:"0.05",
  intelligence_complexity_usdc:{focused:"0.02",standard:"0.03",complex_multi_source:"0.05"},
  live_settlement_verified:false,
} as const;
export const GEOMACRO_LAUNCH_CHECKOUT = {
  stripe_subscription_checkout_active:false,
  one_time_topup_checkout_active:false,
  payment_confirmed_credit_issuance_active:false,
  public_x402_revenue_verified:false,
  checkout_instruction:"Contact Geomacro until verified checkout is activated",
} as const;

/** Public new-sale price policy. Historical settled purchases remain immutable. */
export const GEOMACRO_LOW_BARRIER_VERSION = "geomacro.low-barrier.v1" as const;
export const GEOMACRO_SUBSCRIPTIONS = [
  { id:"starter_dev", name:"Starter / Dev", price_usd:9, credits_per_30_days:1000,
    features:["Three intelligence categories","Structured API access","Usage dashboard"],
    audience:"Independent developers, students and traders" },
  { id:"pro_analyst", name:"Pro Analyst", price_usd:29, credits_per_30_days:5000,
    features:["Everything in Starter","Critical Minerals alerts (qualified signals only)","Structured API access"],
    audience:"Analysts and small supply-chain teams" },
  { id:"business_pilot", name:"Business Pilot", price_usd:99, credits_per_30_days:25000,
    features:["Everything in Pro","Full corridor Risk Gate (subject to live eligibility)","Structured API access"],
    audience:"Fintech and import/export teams" },
] as const;
export const GEOMACRO_ONE_TIME_PACKS = [
  { id:"starter_pack", name:"Starter", price_usd:5, credits:100 },
  { id:"standard_pack", name:"Standard", price_usd:15, credits:500 },
  { id:"growth_pack", name:"Growth", price_usd:30, credits:1500 },
] as const;
export const GEOMACRO_AGENT_MICROPAYMENT = {
  network:"eip155:8453", asset:"USDC", minimum_usdc:"0.02", maximum_usdc:"0.05",
  pricing:"Per eligible successful delivery; actual exact price resolved by capability and variant",
} as const;
/** Catalog != live sale: recurring billing and top-ups require verified checkout + idempotent credit funding. */
export const GEOMACRO_SUBSCRIPTION_CHECKOUT_STATUS="NOT_YET_VERIFIED" as const;
export const GEOMACRO_CREDIT_PACK_CHECKOUT_STATUS="NOT_YET_VERIFIED" as const;

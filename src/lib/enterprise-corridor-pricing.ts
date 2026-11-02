/**
 * Enterprise Corridor schedule requested 2026-11-02. Additive to the existing
 * founder-approved low-barrier catalog. Discovery is not live checkout.
 */
export const CORRIDOR_ENTERPRISE_VERSION="geomacro.corridor-enterprise.v1" as const;
export const CORRIDOR_ENTERPRISE_PRODUCTS=Object.freeze([
 {id:"standard_corridor",delivery:"five_part_structured",price_usd_min:"0.02",price_usd_max:"0.05",credits_min:1,credits_max:1,monthly_usd:99},
 {id:"strategic_corridor",delivery:"multi_source_corrob",price_usd_min:"0.10",price_usd_max:"0.20",credits_min:3,credits_max:5,monthly_usd:299},
 {id:"risk_gate_verification",delivery:"event_gate",price_usd_min:"0.15",price_usd_max:"0.15",credits_min:3,credits_max:3,monthly_usd:null},
 {id:"signed_gro_receipt",delivery:"signed_sha256_receipt",price_usd_min:"0.50",price_usd_max:"1.00",credits_min:10,credits_max:15,monthly_usd:null},
 {id:"corridor_webhook_stream",delivery:"threshold_alerts",price_usd_min:"499",price_usd_max:"499",credits_min:null,credits_max:null,monthly_usd:499},
] as const);
export const CORRIDOR_ENTERPRISE_PACKS=Object.freeze([
 {id:"corridor_starter",price_usd:50,credits:1000},
 {id:"corridor_professional",price_usd:250,credits:6000},
 {id:"corridor_enterprise",price_usd_min:1000,credits:null},
] as const);
export function corridorEnterprisePricingDiscovery(){
 return Object.freeze({
   schema:"geomacro.corridor-enterprise-discovery.v1",
   version:CORRIDOR_ENTERPRISE_VERSION,
   products:CORRIDOR_ENTERPRISE_PRODUCTS,
   credit_packs:CORRIDOR_ENTERPRISE_PACKS,
   existing_subscriptions_unchanged:true,
   historical_settlements_unchanged:true,
   ranges_require_exact_quote:true,
   monthly_corridor_allowance_requires_fair_use_contract:true,
   independent_source_corroboration_required:true,
   publication_time_proxy_not_incident_time:true,
   sha256_integrity_not_immutability_guarantee:true,
   raw_source_delivery:false,
   risk_gate_live_chargeable:false,
   paypal_funding_live:false,
   crypto_funding_live:false,
   webhook_stream_live:false,
   checkout_enabled:false,
   new_sales_enabled:false,
 });
}

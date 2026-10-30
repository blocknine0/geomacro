import {GEOMACRO_LAUNCH_SUBSCRIPTIONS,GEOMACRO_LAUNCH_CREDIT_PACKS,GEOMACRO_LAUNCH_X402,GEOMACRO_LAUNCH_PRICING_VERSION} from "./launch-pricing";
import {
 publicCapabilityPricingCatalog,
 GEOMACRO_CAPABILITY_PRICING_VERSION,
} from "./capability-pricing-catalog";

/** PUBLIC read-only catalog. Unlike a live 402, it NEVER authorizes charge. */
export function geomacroKeylessX402BuyerCatalog(){
 return {
  schema_version:"geomacro.keyless-x402-buyer-catalog.v1",
  service:{name:"Geomacro",origin:"https://geomacro.live",
   categories:["GEOPOLITICS","MACRO","CRITICAL_MINERALS"]},
  release_status:"DISCOVERY_ONLY_VERIFY_LIVE_PAYMENT",
  advertised_payable_now:false,
  x402:{
   version:2,
   keyless_wallet_buyer_supported_by_protocol:true,
   managed_api_keys:"COMING_SOON",
   planned_network:"eip155:8453",
   currency:"USDC",
   scheme:"exact",
   static_catalog_never_authorizes_settlement:true,
   live_payment_required_header_is_authoritative:true
  },
  discovery:{
   x402:"https://geomacro.live/.well-known/x402.json",
   openapi:"https://geomacro.live/openapi-x402.json",
   mcp:"https://geomacro.live/api/mcp",
   agent:"https://geomacro.live/api/v1/agent",
   docs:"https://geomacro.live/data-api",
   store:"https://geomacro.live/pricing"
  },
  routes:{
   no_charge_availability:{method:"POST",url:"https://geomacro.live/api/x402/risk/availability"},
   paid_candidate:{method:"POST",url:"https://geomacro.live/api/v1/intelligence/query",
    current_payability_unverified:true}
  },
  pricing_version:GEOMACRO_CAPABILITY_PRICING_VERSION,
  launch_pricing_version:GEOMACRO_LAUNCH_PRICING_VERSION,
  subscriptions:GEOMACRO_LAUNCH_SUBSCRIPTIONS,
  one_time_credit_packs:GEOMACRO_LAUNCH_CREDIT_PACKS,
  base_x402_micropayments:GEOMACRO_LAUNCH_X402,
  capabilities:publicCapabilityPricingCatalog().map(row=>({
   ...row,
   pilot:["signed_risk_object","risk_gate_bundle"].includes(row.capability),
  })),
  guardrails:{
   eligibility_before_challenge:true,
   no_charge_on_unavailable_or_stale:true,
   commercial_source_rights_required:true,
   verify_signed_output_when_contract_requires:true,
   no_double_settlement:true,
   verify_execution_authorized:false,
   raw_data_delivered:false,
   direct_wallet_execution_by_geomacro:false,
   current_production_eligible_claimed:false,
   revenues_verified_by_catalog:false
  }
 } as const;
}

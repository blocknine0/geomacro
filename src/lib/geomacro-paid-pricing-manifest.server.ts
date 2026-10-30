import {GEOMACRO_LOW_BARRIER_VERSION,GEOMACRO_SUBSCRIPTIONS,GEOMACRO_ONE_TIME_PACKS,GEOMACRO_AGENT_MICROPAYMENT,GEOMACRO_SUBSCRIPTION_CHECKOUT_STATUS,GEOMACRO_CREDIT_PACK_CHECKOUT_STATUS} from "./low-barrier-pricing";
import {
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  publicCapabilityPricingCatalog,
} from "./capability-pricing-catalog";
import {GEOMACRO_USDC_NETWORKS} from "./geomacro-multichain-usdc.server";
import {GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION,geomacroPricedStructuredOutput}
  from "./capability-structured-output-contract";
import {GEOMACRO_STRUCTURED_LICENSE_DISCOVERY} from "./geomacro-structured-commercial-license";
import {GEOMACRO_OFFICIAL_API_CATALOG,GEOMACRO_OFFICIAL_API_DISPLAY_NAMES}
  from "./geomacro-official-api-branding";

/**
 * Machine-readable founder-locked catalog. Prices are fetched from ONE
 * canonical source, never independently hardcoded for chains or endpoints.
 * Pricing discovery is NOT a payment requirement / wallet authorization.
 */
export const GEOMACRO_PAID_PRICING_PATH="/api/v1/pricing" as const;
export const GEOMACRO_PAID_PRICING_SCHEMA="geomacro.public-capability-price-catalog.v2" as const;

export function publicGeomacroPaidPricingManifest(){
  const rails=Object.values(GEOMACRO_USDC_NETWORKS);
  const catalog=publicCapabilityPricingCatalog();
  const capabilities=catalog.map(({capability,variants,launch_status,new_sales_allowed})=>({
    launch_status,new_sales_allowed,
    capability,
    variants:variants.map(price=>({
      variant:price.variant,
      price_usdc:price.amount_usdc,
      amount_atomic:price.amount_atomic,
      currency:"USDC" as const,
      decimals:6 as const,
      output_contract:price.output_contract,
      structured_delivery:geomacroPricedStructuredOutput(capability,price.variant),
      included_signed_object_charge:price.included_signed_object_charge,
      // Named supported rails are not proof that a Geomacro merchant can
      // receive a real x402 payment on any of these networks today.
      nonpayable_network_previews:rails.map(rail=>({
        network:rail.id,
        caip2:rail.caip2,
        native_usdc_asset:rail.asset,
        amount_atomic:price.amount_atomic,
        merchant_settlement_verified:false as const,
        payable_offer_issued:false as const,
      })),
    })),
    paid_delivery:"REQUIRES_EXACT_LIVE_PRODUCT_AND_SOURCE_RIGHTS_PROOF" as const,
  }));
  return Object.freeze({
    schema:GEOMACRO_PAID_PRICING_SCHEMA,
    pricing_version:GEOMACRO_CAPABILITY_PRICING_VERSION,
    pricing_status:"FOUNDER_APPROVED_LOW_BARRIER_SCHEDULE" as const,
    launch_pricing_version:GEOMACRO_LOW_BARRIER_VERSION,
    subscriptions:GEOMACRO_SUBSCRIPTIONS,
    one_time_credit_packs:GEOMACRO_ONE_TIME_PACKS,
    agent_x402:GEOMACRO_AGENT_MICROPAYMENT,
    subscription_checkout_status:GEOMACRO_SUBSCRIPTION_CHECKOUT_STATUS,
    credit_pack_checkout_status:GEOMACRO_CREDIT_PACK_CHECKOUT_STATUS,
    currency:"USDC" as const,
    usdc_decimals:6 as const,
    pricing_model:"MONTHLY_CREDITS_ONE_TIME_PACKS_AND_CAPABILITY_X402" as const,
    capability_count:capabilities.length,
    price_variant_count:capabilities.reduce((n,cap)=>n+cap.variants.length,0),
    structured_output_contract_version:GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION,
    all_prices_map_to_structured_output_contracts:true as const,
    capabilities,
    networks:rails.map(rail=>({
      id:rail.id,
      caip2:rail.caip2,
      native_usdc_asset:rail.asset,
      decimals:rail.decimals,
      merchant_settlement_verified:false as const,
    })),
    // Human-facing names start with GEOMACRO, never the HTTP verb POST.
    // Legacy official_api method/path strings remain stable for clients.
    official_api_display_names:GEOMACRO_OFFICIAL_API_DISPLAY_NAMES,
    official_api_catalog:GEOMACRO_OFFICIAL_API_CATALOG,
    official_api:{
      intelligence:"POST /api/v1/intelligence/query",
      geopolitics:"POST /api/v1/intelligence/geopolitics",
      macro_fx:"POST /api/v1/intelligence/macro-fx",
      critical_minerals:"POST /api/v1/intelligence/critical-minerals",
      agent:"POST /api/v1/agent",
      x402_nonpayable_price_preflight:"POST /api/v1/payments/preflight",
      settlement_network_discovery:"GET /api/v1/payments/networks",
    },
    commercial_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
    source_and_rights_required:true as const,
    successful_preparation_required_before_payment:true as const,
    no_subscription_required_for_one_time_or_x402:true as const,
    no_automatic_price_upgrades:true as const,
    no_extra_signed_object_fee_with_risk_gate_bundle:true as const,
    raw_upstream_data_delivered:false as const,
    source_names_and_urls_delivered:false as const,
    live_commercial_product_available_by_price_listing:false as const,
    x402_payment_requirement_issued:false as const,
    payment_authorized:false as const,
    money_transferred:false as const,
    execution_authorized:false as const,
  });
}

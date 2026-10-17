import {createHash} from "node:crypto";
import {
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  resolveGeomacroCapabilityPrice,
} from "./capability-pricing-catalog";
import {GEOMACRO_STRUCTURED_LICENSE_DISCOVERY}
  from "./geomacro-structured-commercial-license";

/**
 * Verified Circle native USDC contracts. The 3 EVM mainnets all use 6 USDC
 * decimals. These are target settlement rails, not proof that Geomacro's
 * canonical data or x402 payment facilitator is production-ready.
 * https://developers.circle.com/facilitator-service/supported-networks
 */
export const GEOMACRO_USDC_NETWORKS=Object.freeze({
  base:Object.freeze({
    id:"base",name:"Base",chain_id:8453,caip2:"eip155:8453",
    asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    asset_symbol:"USDC",decimals:6,facilitator:"circle_facilitator_service",
  }),
  arc:Object.freeze({
    id:"arc",name:"Arc",chain_id:5042,caip2:"eip155:5042",
    asset:"0x3600000000000000000000000000000000000000",
    asset_symbol:"USDC",decimals:6,facilitator:"circle_facilitator_service",
  }),
  polygon:Object.freeze({
    id:"polygon",name:"Polygon PoS",chain_id:137,caip2:"eip155:137",
    asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    asset_symbol:"USDC",decimals:6,facilitator:"circle_facilitator_service",
  }),
} as const);
export type GeomacroUsdcNetwork=keyof typeof GEOMACRO_USDC_NETWORKS;
export const GEOMACRO_USDC_NETWORKS_PATH="/api/v1/payments/networks" as const;
export const GEOMACRO_USDC_QUOTE_PREFLIGHT_PATH="/api/v1/payments/preflight" as const;
export const GEOMACRO_USDC_RAIL_SCHEMA="geomacro.usdc-rails.v1" as const;

const HASH=/^[a-f0-9]{64}$/u;
const address=/^0x[0-9a-fA-F]{40}$/u;

/** Pure canonical price + network binding, NEVER an HTTP 402/payment request. */
export function quoteGeomacroUsdcCapabilityPreflight(input:unknown){
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw Error("USDC_PREFLIGHT_INPUT_INVALID");
  const body=input as Record<string,unknown>;
  if(Object.keys(body).length!==3||
     !["capability","variant","network"].every(k=>Object.hasOwn(body,k))||
     typeof body.capability!=="string"||
     typeof body.variant!=="string"||
     typeof body.network!=="string"||
     !Object.hasOwn(GEOMACRO_USDC_NETWORKS,body.network))
    throw Error("USDC_PREFLIGHT_SCOPE_UNSUPPORTED");
  const rail=GEOMACRO_USDC_NETWORKS[body.network as GeomacroUsdcNetwork];
  if(!address.test(rail.asset))throw Error("USDC_NATIVE_ASSET_INVALID");
  const price=resolveGeomacroCapabilityPrice(body.capability,body.variant);
  const binding={
    pricing_version:GEOMACRO_CAPABILITY_PRICING_VERSION,
    capability:price.capability,variant:price.variant,
    network:rail.caip2,asset:rail.asset,
    amount_usdc:price.amount_usdc,amount_atomic:price.amount_atomic,
    decimals:rail.decimals,
    source_license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id,
  };
  const sha=createHash("sha256").update(JSON.stringify(binding),"utf8").digest("hex");
  if(!HASH.test(sha))throw Error("USDC_QUOTE_BINDING_FAILED");
  return Object.freeze({
    schema:"geomacro.usdc-price-preflight.v1",
    ok:true,network_id:rail.id,...binding,quote_binding_sha256:sha,
    // No customer has authorized this preview; an unverified source, hot
    // product or facilitator cannot produce a payable requirement.
    quotation_type:"NON_PAYABLE_CATALOG_PREVIEW",
    settlement_facilitator:rail.facilitator,
    x402_scheme:"exact",x402_version:2,
    source_rights_and_freshness_checked:false,
    exact_live_product_deliverability_verified:false,
    receiver_wallet_verified:false,
    facilitator_runtime_verified:false,
    payment_requirement_issued:false,
    payment_authorized:false,chargeable:false,
    money_transferred:false,execution_authorized:false,
    raw_upstream_material_delivered:false,
    canonical_intelligence_path:"/api/v1/intelligence/query",
    canonical_agent_path:"/api/v1/agent",
  });
}
export function publicGeomacroUsdcRailDiscovery(){
  return {
    schema:GEOMACRO_USDC_RAIL_SCHEMA,ok:true,
    chain_policy:"NATIVE_CIRCLE_USDC_ONLY",
    network_count:3,
    networks:Object.values(GEOMACRO_USDC_NETWORKS).map(rail=>({
      ...rail,scheme:"exact" as const,x402_version:2 as const,
      // Rail support from Circle != Geomacro merchant activation.
      protocol_supported:true,merchant_settlement_ready:false,
      production_verification_required:true,
    })),
    official_facilitator_documentation:"https://developers.circle.com/facilitator-service",
    license:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
    pricing_version:GEOMACRO_CAPABILITY_PRICING_VERSION,
    preflight_path:GEOMACRO_USDC_QUOTE_PREFLIGHT_PATH,
    endpoints:{
      intelligence:"/api/v1/intelligence/query",
      agent:"/api/v1/agent",geopolitics:"/api/v1/intelligence/geopolitics",
      macro_fx:"/api/v1/intelligence/macro-fx",
      critical_minerals:"/api/v1/intelligence/critical-minerals",
      mcp:"/api/mcp",a2a:"/api/a2a",
    },
    raw_data_delivery:false,
    all_three_merchant_settlements_verified:false,
    settlement_authorized:false,real_money_acknowledged:false,
    customer_charge_authorized:false,
  };
}

import {createHash} from "node:crypto";
import {resolveSharedUsdcReceiver} from "./shared-usdc-receiver.server";
import approvedRecipient from "../../config/mainnet-usdc-recipient.json";
import {
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  isPublicStoreCapability,
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
export {GEOMACRO_USDC_NATIVE_RAILS as GEOMACRO_USDC_NETWORKS}
  from "./usdc-native-rail-identities";
import {GEOMACRO_USDC_NATIVE_RAILS as GEOMACRO_USDC_NETWORKS}
  from "./usdc-native-rail-identities";
export type {GeomacroUsdcNetwork} from "./usdc-native-rail-identities";
import type {GeomacroUsdcNetwork} from "./usdc-native-rail-identities";

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
  if(!isPublicStoreCapability(body.capability))throw Error("CAPABILITY_RETIRED_NO_CHARGE");
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
export function publicGeomacroUsdcRailDiscovery(
  env:Record<string,string|undefined>=process.env,
){
  let receiver:string|null=null,receiverState="RECEIVER_NOT_CONFIGURED";
  try{
    receiver=resolveSharedUsdcReceiver(env);
    receiverState="RECEIVER_CONFIGURED_CONTROL_NOT_ATTESTED";
  }catch(error){
    if(error instanceof Error&&error.message==="SHARED_USDC_RECEIVER_MISMATCH")
      receiverState="RECEIVER_CONFIGURATION_MISMATCH";
    else if(error instanceof Error&&error.message==="SHARED_USDC_RECEIVER_INVALID")
      receiverState="RECEIVER_CONFIGURATION_INVALID";
    else if(error instanceof Error&&error.message==="SHARED_USDC_RECEIVER_NOT_OWNER_APPROVED")
      receiverState="RECEIVER_NOT_OWNER_APPROVED";
  }
  // Only report cryptographic control after the LIVE configured recipient
  // matches the owner-signed pin. This is never a live transfer/fee/settlement
  // receipt, and a stale production secret may not inherit the attestation.
  const ownerProof=approvedRecipient.ownership_proof;
  const walletControlVerified=receiver!==null &&
    approvedRecipient.wallet_control_verified===true &&
    approvedRecipient.merchant_settlement_verified===false &&
    ownerProof?.scheme==="EIP191_PERSONAL_SIGN" &&
    ownerProof.authorization_scope==="WALLET_OWNERSHIP_PROOF_ONLY" &&
    ownerProof.recovered_address.toLowerCase()===receiver.toLowerCase() &&
    approvedRecipient.receiver.toLowerCase()===receiver.toLowerCase();
  if(walletControlVerified)receiverState="RECEIVER_CONFIGURED_CONTROL_ATTESTED";
  return {
    schema:GEOMACRO_USDC_RAIL_SCHEMA,ok:true,
    chain_policy:"NATIVE_CIRCLE_USDC_ONLY",
    network_count:3,
    receiving_policy:"ONE_SHARED_EVM_MERCHANT_ADDRESS",
    receiving_address_control_and_configuration_require_verification:true,
    native_facilitator_distinct_from_gateway_batching:true,
    merchant_receiver:{state:receiverState,address:receiver,
      same_address_configuration_verified:receiver!==null,
      wallet_control_verified:walletControlVerified},
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

/**
 * Read-only facilitator policy. This DOES NOT authorize payment.
 * An active payment/quote must never be silently re-routed.
 */
export const NETWORKS=Object.freeze({
  base:Object.freeze({network:"eip155:8453",asset:"0x833589fCD6eDb6E08f4C7C32D4f71b54bdA02913"}),
  polygon:Object.freeze({network:"eip155:137",asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"}),
  arc:Object.freeze({network:"eip155:5042",asset:"0x3600000000000000000000000000000000000000"}),
});
export const PROVIDERS=Object.freeze({
  xpay:Object.freeze({url:"https://facilitator.xpay.sh",networks:Object.freeze(["base"]),fees:"advertised_zero_and_gas_sponsored"}),
  dexter:Object.freeze({url:"https://x402.dexter.cash",networks:Object.freeze(["base","polygon"]),fees:"advertised_zero_facilitator_fee_and_gas_sponsored"}),
  payai:Object.freeze({url:"https://facilitator.payai.network",networks:Object.freeze(["base","polygon"]),fees:"1000_lifetime_credits_then_variable"}),
});
export function supportsExactV2(provider,payload,chain){
  if(!Object.hasOwn(PROVIDERS,provider)||!Object.hasOwn(NETWORKS,chain)||
      !PROVIDERS[provider].networks.includes(chain)||!payload||typeof payload!=="object")return false;
  const id=NETWORKS[chain].network;
  if(Array.isArray(payload.kinds)){
    return payload.kinds.some(k=>k&&k.x402Version===2&&k.scheme==="exact"&&k.network===id);
  }
  // xpay documents a separate v2 network-list response and exact-only support.
  if(provider==="xpay"&&chain==="base"&&Array.isArray(payload.supportedNetworks)){
    return payload.supportedNetworks.some(k=>k&&k.version==="v2"&&k.networkId===id);
  }
  return false;
}
export function auditOptions(chain,readbacks={}){
  if(!Object.hasOwn(NETWORKS,chain))return [];
  const order=chain==="base"?["xpay","dexter","payai"]:
    chain==="polygon"?["dexter","payai"]:[];
  return order.map(provider=>({
    provider,endpoint:PROVIDERS[provider].url,
    network:NETWORKS[chain].network,asset:NETWORKS[chain].asset,
    fees:PROVIDERS[provider].fees,
    supportedNow:supportsExactV2(provider,readbacks[provider],chain),
    merchantSettlementReady:false,paymentEnabled:false,
    status:"READ_ONLY_NETWORK_CAPABILITY_NOT_SETTLEMENT_PROOF",
  }));
}
export function paymentAdmission({protocol,chain,paymentSignaturePresent=false,
  quoteAlreadyIssued=false,settlementPending=false}={}){
  if(protocol!=="x402-v2-exact")return{allowed:false,reason:"UNSUPPORTED_PROTOCOL"};
  if(!Object.hasOwn(NETWORKS,chain))return{allowed:false,reason:"UNSUPPORTED_CHAIN"};
  if(paymentSignaturePresent||quoteAlreadyIssued||settlementPending){
    return{allowed:false,reason:"NEVER_SWITCH_PROVIDER_AFTER_QUOTE_OR_SIGNATURE"};
  }
  return{allowed:false,reason:"OWNER_AND_PRODUCTION_SETTLEMENT_ACCEPTANCE_REQUIRED"};
}
export function feeOnlyEstimate(priceAtomic,feeUsd){
  if(!/^[1-9][0-9]{0,11}$/.test(String(priceAtomic))||
    typeof feeUsd!=="number"||!Number.isFinite(feeUsd)||feeUsd<0)throw Error("BAD_FEE_ESTIMATE");
  const grossUsd=Number(priceAtomic)/1000000;
  return {grossUsd,facilitatorFeeUsd:feeUsd,afterFacilitatorUsd:Math.max(0,grossUsd-feeUsd),
    verifiedNetProfit:false};
}

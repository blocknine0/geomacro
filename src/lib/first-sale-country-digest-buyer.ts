import {resolveGeomacroCapabilityPrice} from "./capability-pricing-catalog";
import {validateBuyerUsdcOffer} from "./usdc-buyer-quote";

/**
 * The first real-money offer is one verified historical structural country
 * digest, not a generic live/signed risk object and never a catalogue-only
 * automatic charge. Both steps use exactly the same request bytes.
 */
export const FIRST_SALE_CAPABILITY="structural_country_digest" as const;
export const FIRST_SALE_VARIANT="standard" as const;
export const FIRST_SALE_PRICE=resolveGeomacroCapabilityPrice(
 FIRST_SALE_CAPABILITY,FIRST_SALE_VARIANT
);

export const FIRST_SALE_TOPIC_BY_CATEGORY={
 geopolitics:"conflict_geopolitics",
 "macro-fx":"macro_risk",
 "critical-minerals":"critical_minerals",
} as const;

export type FirstSaleCategory=keyof typeof FIRST_SALE_TOPIC_BY_CATEGORY;

export function buildFirstSaleCountryDigestRequest(
 category:FirstSaleCategory,country:string,clientRequestId:string
){
 const topic=FIRST_SALE_TOPIC_BY_CATEGORY[category];
 const iso=country.trim().toUpperCase();
 if(!topic||!/^[A-Z]{3}$/.test(iso)||
    !/^[a-zA-Z0-9_-]{4,128}$/.test(clientRequestId))
  throw Error("FIRST_SALE_REQUEST_INVALID");
 return JSON.stringify({
  schema_version:"geomacro.agent-query.v1",
  product:{capability:FIRST_SALE_CAPABILITY,variant:FIRST_SALE_VARIANT},
  delivery_tier:"structural_baseline",
  fulfillment_mode:"published_only",
  subjects:[{type:"country",country_iso3:iso}],
  topics:[topic],
  detail:"compact",
  client_request_id:clientRequestId,
 });
}

const record=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==="object"&&!Array.isArray(v);

/**
 * No direct x402 POST unless a genuine, request-scoped preflight returned a
 * clean positive quote-ready state. Locked or unavailable never requests funds.
 */
export function acceptFirstSaleNoFundsPreflight(status:number,payload:unknown){
 if(status!==200){
  if(status===422||status===429||status===503)
   return {quote_ready:false,state:"NO_CHARGE_UNAVAILABLE" as const};
  return {quote_ready:false,state:"NO_CHARGE_UNVERIFIED" as const};
 }
 if(!record(payload)||payload.ok!==true||
    payload.schema_version!=="geomacro.earn-first-preflight.v1"||
    payload.delivery_tier!=="structural_baseline"||
    payload.chargeable!==false||payload.payment_required_now!==false||
    payload.execution_authorized!==false||
    !/^[a-f0-9]{64}$/.test(String(payload.query_plan_hash??"")))
  throw Error("FIRST_SALE_PREFLIGHT_FALSE_POSITIVE");
 if(payload.status==="ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED"&&
    payload.payment_rail_ready===false)
  return {quote_ready:false,state:"MERCHANT_RAIL_LOCKED" as const};
 if(payload.status!=="ELIGIBLE_FOR_X402_QUOTE"||
    payload.payment_rail_ready!==true)
  throw Error("FIRST_SALE_PREFLIGHT_RAIL_INCONSISTENT");
 return {quote_ready:true,state:"QUALIFIED_FOR_CANONICAL_QUOTE" as const};
}

/** Browser spend protection: a digest buyer is never billed as risk gate/GRO
 * or for the more expensive intelligence_query variant. Only Base may carry
 * the explicit structural Store product in the current mainnet adapter. */
export function validateFirstSaleCountryDigestQuote(value:unknown,origin:string,now=Date.now()){
 const offer=validateBuyerUsdcOffer(value,"base",origin,now);
 if(offer.quote.capability!==FIRST_SALE_CAPABILITY||
    offer.quote.variant!==FIRST_SALE_VARIANT||
    offer.amount_usdc!==FIRST_SALE_PRICE.amount_usdc||
    offer.accepted.amount!==FIRST_SALE_PRICE.amount_atomic)
  throw Error("FIRST_SALE_PRODUCT_PRICE_MISMATCH");
 return offer;
}

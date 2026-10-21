import {GEOMACRO_USDC_NATIVE_RAILS,type GeomacroUsdcNetwork} from "./usdc-native-rail-identities";
import {resolveGeomacroCapabilityPrice} from "./capability-pricing-catalog";

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
/** Browser-side spend checks. This does not attest merchant activation,
 * evidence, wallet ownership or payment. Wallet signing is a separate click. */
export function validateBuyerUsdcOffer(value:unknown,network:GeomacroUsdcNetwork,origin:string,now=Date.now()){
 if(!record(value)||value.x402Version!==2||!record(value.resource)||
    value.resource.url!==new URL("/api/v1/intelligence/query",origin).href||
    value.resource.mimeType!=="application/json"||!Array.isArray(value.accepts)||
    value.accepts.length!==1)throw Error("PAYMENT_OFFER_INVALID");
 const accepted=value.accepts[0];
 const info=record(value.extensions)&&record(value.extensions.geomacro)&&
  record(value.extensions.geomacro.info)?value.extensions.geomacro.info:null;
 const quote=info&&record(info.capability_quote)?info.capability_quote:null;
 const rail=GEOMACRO_USDC_NATIVE_RAILS[network];
 if(!record(accepted)||!quote||accepted.scheme!=="exact"||
    accepted.network!==rail.caip2||typeof accepted.asset!=="string"||
    accepted.asset.toLowerCase()!==rail.asset.toLowerCase()||
    typeof accepted.payTo!=="string"||!/^0x[0-9a-fA-F]{40}$/u.test(accepted.payTo)||
    /^0x0{40}$/iu.test(accepted.payTo)||quote.network!==rail.caip2||
    quote.asset_contract!==rail.asset.toLowerCase()||quote.recipient!==accepted.payTo.toLowerCase()||
    info?.execution_authorized!==false||
    typeof quote.quote_id!=="string"||!/^[0-9a-f]{64}$/u.test(quote.quote_id)||
    typeof quote.prepared_answer_sha256!=="string"||!/^[0-9a-f]{64}$/u.test(quote.prepared_answer_sha256)||
    typeof quote.expires_at!=="string"||!Number.isFinite(Date.parse(quote.expires_at))||
    Date.parse(quote.expires_at)<=now||typeof quote.capability!=="string"||typeof quote.variant!=="string"||
    !Number.isSafeInteger(accepted.maxTimeoutSeconds)||Number(accepted.maxTimeoutSeconds)<=0||
    Number(accepted.maxTimeoutSeconds)>605000||!record(accepted.extra)||
    !["USDC","USD Coin"].includes(String(accepted.extra.name))||accepted.extra.version!=="2"||
    accepted.extra.name==="GatewayWalletBatched")throw Error("PAYMENT_CHAIN_OR_QUOTE_MISMATCH");
 const price=resolveGeomacroCapabilityPrice(quote.capability,quote.variant);
 if(quote.version!==price.version)throw Error("PAYMENT_PRICING_VERSION_MISMATCH");
 if(accepted.amount!==price.amount_atomic||quote.amount_atomic!==price.amount_atomic||
    quote.amount_usdc!==price.amount_usdc)throw Error("PAYMENT_PRICE_MISMATCH");
 return {accepted,quote,extensions:value.extensions,amount_usdc:price.amount_usdc,rail};
}

export async function assertBuyerDeliveredBytes(raw:string,expectedHash:string){
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
 const hex=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");
 if(hex!==expectedHash)throw Error("CUSTOMER_RESPONSE_HASH_MISMATCH");
 return JSON.parse(raw) as unknown;
}

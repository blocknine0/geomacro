import {createHash} from "node:crypto";
import {isPublicStoreCapability,resolveGeomacroCapabilityPrice,
  type CapabilityPrice,type PricedCapability,
} from "./capability-pricing-catalog";
export * from "./capability-pricing-catalog";

export type CapabilityQuote=Readonly<CapabilityPrice&{
  quote_id:string;issued_at:string;expires_at:string;
  quote_window_seconds:300;request_fingerprint_sha256:string;
  network:string;asset_contract:string;recipient:string;
  availability:"VERIFIED_DELIVERABLE";
  payment_rail:"coinbase_x402"|"circle_gateway_x402"|"xpay_x402"|"dexter_x402";
  execution_authorized:false;
}>;
const SHA=/^[a-f0-9]{64}$/u;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/u;
const digest=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
/** Five-minute exact challenge bucket: re-quote at expiry, never float a price. */
export function quoteGeomacroCapability(input:Readonly<{
  capability:string;variant:string;
  requestFingerprint:string;network:string;asset:string;recipient:string;
  rail:"coinbase_x402"|"circle_gateway_x402"|"xpay_x402"|"dexter_x402";
  availabilityVerified:boolean;now?:Date;
}>):CapabilityQuote{
  if(!isPublicStoreCapability(input.capability))throw Error("CAPABILITY_RETIRED_NO_CHARGE");
  if(input.availabilityVerified!==true)throw Error("CAPABILITY_NOT_DELIVERABLE_NO_CHARGE");
  if(!SHA.test(input.requestFingerprint)||!/^eip155:\d+$/.test(input.network)||
    !ADDRESS.test(input.asset)||!ADDRESS.test(input.recipient))
    throw Error("CAPABILITY_QUOTE_SCOPE_INVALID");
  const now=input.now??new Date();
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("CAPABILITY_QUOTE_TIME_INVALID");
  const price=resolveGeomacroCapabilityPrice(input.capability,input.variant);
  const startMs=Math.floor(now.getTime()/300_000)*300_000;
  const expiresMs=startMs+300_000;
  const issued_at=new Date(startMs).toISOString();
  const expires_at=new Date(expiresMs).toISOString();
  const network=input.network,asset_contract=input.asset.toLowerCase(),
    recipient=input.recipient.toLowerCase();
  const quote_id=digest(JSON.stringify([
    price.version,price.capability,price.variant,price.amount_atomic,
    input.requestFingerprint,network,asset_contract,recipient,
    input.rail,issued_at,expires_at,"VERIFIED_DELIVERABLE",
  ]));
  return Object.freeze({
    ...price,quote_id,issued_at,expires_at,
    quote_window_seconds:300 as const,
    request_fingerprint_sha256:input.requestFingerprint,
    network,asset_contract,recipient,
    availability:"VERIFIED_DELIVERABLE" as const,
    payment_rail:input.rail,
    execution_authorized:false as const,
  });
}
export function verifyGeomacroCapabilityQuote(
  supplied:unknown,expected:CapabilityQuote,now=new Date(),
):void{
  if(!isPublicStoreCapability(expected.capability))throw Error("CAPABILITY_RETIRED_NO_CHARGE");
  if(!Number.isFinite(now.getTime())||now.getTime()>=Date.parse(expected.expires_at))
    throw Error("CAPABILITY_QUOTE_EXPIRED");
  if(!supplied||typeof supplied!=="object"||Array.isArray(supplied))
    throw Error("CAPABILITY_QUOTE_BINDING_MISSING");
  const actual=supplied as Record<string,unknown>;
  for(const [k,v]of Object.entries(expected)){
    if(actual[k]!==v)throw Error("CAPABILITY_QUOTE_BINDING_MISMATCH_"+k.toUpperCase());
  }
  if(Object.keys(actual).length!==Object.keys(expected).length)
    throw Error("CAPABILITY_QUOTE_UNKNOWN_FIELDS");
}

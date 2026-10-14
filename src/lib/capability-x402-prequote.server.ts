import { callDurableLedger, stableCommerceJson, commerceSha256 } from "./agent-commerce-delivery.server";
import { assertAcceptedCapabilityQuote } from "./capability-x402-payment-contract.server";
import { verifyGeomacroCapabilityQuote, type CapabilityQuote } from "./capability-pricing";

const SHA=/^[a-f0-9]{64}$/u;

/** Only accepts an already qualified, redacted and prepared structured result.
 * This is a byte-freeze before 402; it does not enable settlement.
 */
export async function freezeVerifiedCapabilityAnswer(input:{
  quote:CapabilityQuote;
  preparedIntelligence:Record<string,unknown>;
}):Promise<{quote:CapabilityQuote;intelligence:Record<string,unknown>}> {
  const quote=assertAcceptedCapabilityQuote(input.quote);
  if(quote.network!=="eip155:8453" ||
     quote.asset_contract!=="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")
    throw Error("CAPABILITY_PREQUOTE_ONLY_CANONICAL_BASE_USDC");
  const customerBytes=stableCommerceJson(input.preparedIntelligence);
  if (new TextEncoder().encode(customerBytes).byteLength>96*1024 ||
      commerceSha256(customerBytes)!==quote.prepared_answer_sha256)
    throw Error("CAPABILITY_PREQUOTE_CUSTOMER_BYTES_MISMATCH");
  const provider=quote.payment_rail;
  const providerEnvironment=provider==="coinbase_x402"?"mainnet":"production";
  const stored=await callDurableLedger<{ok?:boolean;quote_id?:string}>(
    "capability-prequote-freeze",{provider,providerEnvironment,quote,customerBytes});
  if(stored?.ok!==true || stored.quote_id!==quote.quote_id)
    throw Error("CAPABILITY_PREQUOTE_FREEZE_FAILED");
  return readVerifiedCapabilityAnswer({quote,requestFingerprint:quote.request_fingerprint_sha256});
}

export async function readVerifiedCapabilityAnswer(input:{
  quote:CapabilityQuote;
  requestFingerprint:string;
}):Promise<{quote:CapabilityQuote;intelligence:Record<string,unknown>}> {
  const quote=assertAcceptedCapabilityQuote(input.quote);
  if(quote.network!=="eip155:8453" ||
     quote.asset_contract!=="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")
    throw Error("CAPABILITY_PREQUOTE_ONLY_CANONICAL_BASE_USDC");
  if(!SHA.test(input.requestFingerprint) ||
      input.requestFingerprint!==quote.request_fingerprint_sha256)
    throw Error("CAPABILITY_PREQUOTE_REQUEST_MISMATCH");
  const provider=quote.payment_rail;
  const providerEnvironment=provider==="coinbase_x402"?"mainnet":"production";
  const data=await callDurableLedger<{
    ok?:boolean;quote?:unknown;customerBytes?:unknown;settlement_attempted?:unknown;
  }>("capability-prequote-readback",{provider,providerEnvironment,quoteId:quote.quote_id});
  if(data?.ok!==true||data.settlement_attempted!==false||
      typeof data.customerBytes!=="string"||
      commerceSha256(data.customerBytes)!==quote.prepared_answer_sha256)
    throw Error("CAPABILITY_PREQUOTE_READBACK_INVALID");
  verifyGeomacroCapabilityQuote(data.quote,quote);
  let value:unknown;
  try {value=JSON.parse(data.customerBytes);}catch{throw Error("CAPABILITY_PREQUOTE_JSON_INVALID");}
  if(!value||typeof value!=="object"||Array.isArray(value)||
      stableCommerceJson(value)!==data.customerBytes)
    throw Error("CAPABILITY_PREQUOTE_CUSTOMER_CONTENT_INVALID");
  return {quote,intelligence:value as Record<string,unknown>};
}

/**
 * Preserve the cryptographically frozen customer intelligence despite
 * transport-only settlement/availability metadata on the final HTTP envelope.
 *
 * The signed intelligence projection must remain canonical-byte identical.
 * Enclosing HTTP JSON, including payment metadata, is a separate delivery
 * envelope governed by the existing prepared-response ledger/hash.
 * This does not replace independent final-envelope delivery acceptance.
 */
export function assertFrozenCapabilityIntelligenceProjection(input:{
  quote:CapabilityQuote;
  frozen:Record<string,unknown>;
  delivered:Record<string,unknown>;
  addedEnvelopeKeys:readonly string[];
}):void {
  const canonical=stableCommerceJson(input.frozen);
  if(commerceSha256(canonical)!==input.quote.prepared_answer_sha256)
    throw Error("CAPABILITY_DELIVERY_FROZEN_HASH_MISMATCH");

  const allowed=new Set(input.addedEnvelopeKeys);
  if(allowed.size!==input.addedEnvelopeKeys.length ||
      [...allowed].some(key=>!["payment","availability"].includes(key) ||
        Object.prototype.hasOwnProperty.call(input.frozen,key)))
    throw Error("CAPABILITY_DELIVERY_ENVELOPE_SCOPE_INVALID");

  const projection:Record<string,unknown>=Object.create(null);
  for(const [key,value] of Object.entries(input.delivered)){
    if(!allowed.has(key))projection[key]=value;
  }
  if(stableCommerceJson(projection)!==canonical)
    throw Error("CAPABILITY_DELIVERY_SIGNED_INTELLIGENCE_MUTATED");
  for(const key of allowed){
    if(!Object.prototype.hasOwnProperty.call(input.delivered,key))
      throw Error("CAPABILITY_DELIVERY_ENVELOPE_FIELD_MISSING");
  }
}

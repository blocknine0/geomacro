import {callDurableLedger,commerceSha256,stableCommerceJson} from "./agent-commerce-delivery.server";
import {assertAcceptedCapabilityQuote} from "./capability-x402-payment-contract.server";
import type {PreparedCapabilityQuote as CapabilityQuote} from "./capability-prepared-quote.server";
import {freezeCanonicalCapabilityHttpBody} from "./capability-x402-exact-http-body.server";

/** Authenticated existing DO only. These methods never authorize payment,
 * attest source rights or replace the canonical governed response assembler. */
export async function readVerifiedCapabilityAnswer(input:{quote:CapabilityQuote;requestFingerprint:string}) {
  const quote=assertAcceptedCapabilityQuote(input.quote);
  if(input.requestFingerprint!==quote.request_fingerprint_sha256)
    throw Error("CAPABILITY_PREQUOTE_REQUEST_MISMATCH");
  const data=await callDurableLedger<{
    ok?:boolean;schema?:string;quote?:CapabilityQuote;customerBytes?:unknown;
    payment_authorized?:unknown;settlement_attempted?:unknown;expiresAtMs?:unknown;
  }>("capability-prequote-readback",{
    provider:quote.payment_rail,
    providerEnvironment:quote.payment_rail==="circle_gateway_x402"?"production":"mainnet",
    quoteId:quote.quote_id,
  });
  if(data?.ok!==true || data.schema!=="geomacro.capability-prequote.v1" ||
      data.payment_authorized!==false || data.settlement_attempted!==false ||
      data.expiresAtMs!==Date.parse(quote.expires_at) ||
      typeof data.customerBytes!=="string" ||
      commerceSha256(data.customerBytes)!==quote.prepared_answer_sha256 ||
      stableCommerceJson(assertAcceptedCapabilityQuote(data.quote!))!==stableCommerceJson(quote))
    throw Error("CAPABILITY_PREQUOTE_READBACK_INVALID");
  let value:unknown;
  try {value=JSON.parse(data.customerBytes);}catch{throw Error("CAPABILITY_PREQUOTE_JSON_INVALID");}
  const frozen=freezeCanonicalCapabilityHttpBody(value);
  if(frozen.body!==data.customerBytes)throw Error("CAPABILITY_PREQUOTE_CUSTOMER_CONTENT_INVALID");
  return {quote,intelligence:value as Record<string,unknown>,frozen};
}

export async function freezeVerifiedCapabilityAnswer(input:{
  quote:CapabilityQuote;preparedIntelligence:Record<string,unknown>;
}) {
  const quote=assertAcceptedCapabilityQuote(input.quote);
  const frozen=freezeCanonicalCapabilityHttpBody(input.preparedIntelligence);
  if(frozen.sha256!==quote.prepared_answer_sha256)
    throw Error("CAPABILITY_PREQUOTE_CUSTOMER_BYTES_MISMATCH");
  const stored=await callDurableLedger<{
    ok?:boolean;disposition?:string;quote_id?:string;prepared_answer_sha256?:string;
  }>("capability-prequote-freeze",{
    provider:quote.payment_rail,
    providerEnvironment:quote.payment_rail==="circle_gateway_x402"?"production":"mainnet",
    quote,customerBytes:frozen.body,
  });
  if(stored?.ok!==true || !["FROZEN","EXACT_REPLAY"].includes(stored.disposition??"") ||
      stored.quote_id!==quote.quote_id || stored.prepared_answer_sha256!==frozen.sha256)
    throw Error("CAPABILITY_PREQUOTE_FREEZE_FAILED");
  // Two actual authenticated requests, not two reads of a local JS object.
  const first=await readVerifiedCapabilityAnswer({quote,requestFingerprint:quote.request_fingerprint_sha256});
  const second=await readVerifiedCapabilityAnswer({quote,requestFingerprint:quote.request_fingerprint_sha256});
  if(first.frozen.body!==frozen.body || second.frozen.body!==frozen.body)
    throw Error("CAPABILITY_PREQUOTE_INDEPENDENT_READBACK_MISMATCH");
  return second;
}

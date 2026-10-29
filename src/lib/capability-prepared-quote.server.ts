import {createHash} from "node:crypto";
import {exactGeomacroUsdcRail} from "./usdc-native-rail-identities";
import {
  resolveGeomacroCapabilityPrice,
  type CapabilityQuote,
} from "./capability-pricing";

/**
 * A prepared-answer bound quote is distinct from an unbound catalogue quote.
 * Only invoke after the governed source/rights/signature and deliverability
 * checks have actually validated the same immutable customer bytes.
 * This module never signs a GRO, settles a payment or proves those rights.
 */
export type PreparedCapabilityQuote=Readonly<CapabilityQuote&{
  prepared_answer_sha256:string;
}>;

const HASH=/^[a-f0-9]{64}$/u;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/u;

const digest=(value:unknown)=>createHash("sha256").update(
  JSON.stringify(value),"utf8").digest("hex");

export function quoteGeomacroPreparedCapability(input:Readonly<{
  capability:string;variant:string;
  requestFingerprint:string;preparedAnswerSha256:string;
  network:string;asset:string;recipient:string;
  rail:"coinbase_x402"|"circle_gateway_x402"|"xpay_x402"|"dexter_x402";
  availabilityVerified:boolean;
  preparedAnswerVerified:boolean;
  now?:Date;
}>):PreparedCapabilityQuote{
  if(input.availabilityVerified!==true||input.preparedAnswerVerified!==true)
    throw Error("CAPABILITY_PREPARED_ANSWER_NOT_VERIFIED");
  // Coinbase CDP adapter currently settles only Base; Circle's separate
  // facilitator identity is eligible for a FUTURE merchant configuration on
  // Base, Arc or Polygon. Neither produces a payable offer at this stage.
  const matched=exactGeomacroUsdcRail(input.network,input.asset);
  if(!HASH.test(input.requestFingerprint)||!HASH.test(input.preparedAnswerSha256)||
      !matched||!ADDRESS.test(input.recipient)||
      !["coinbase_x402","circle_gateway_x402","xpay_x402","dexter_x402"].includes(input.rail)||
      (input.rail==="coinbase_x402"&&matched.id!=="base")||
       (input.rail==="xpay_x402"&&matched.id!=="base")||
       (input.rail==="dexter_x402"&&!["base","polygon"].includes(matched.id)))
    throw Error("CAPABILITY_PREPARED_QUOTE_SCOPE_INVALID");
  const now=input.now??new Date();
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("CAPABILITY_PREPARED_QUOTE_TIME_INVALID");
  const price=resolveGeomacroCapabilityPrice(input.capability,input.variant);
  const issuedMs=Math.floor(now.getTime()/300_000)*300_000;
  const issued_at=new Date(issuedMs).toISOString();
  const expires_at=new Date(issuedMs+300_000).toISOString();
  const network=input.network;
  const asset_contract=input.asset.toLowerCase();
  const recipient=input.recipient.toLowerCase();
  const request_fingerprint_sha256=input.requestFingerprint;
  const prepared_answer_sha256=input.preparedAnswerSha256;
  const availability="VERIFIED_DELIVERABLE" as const;
  const payment_rail=input.rail;
  const quote_id=digest([
    price.version,price.capability,price.variant,price.amount_atomic,
    request_fingerprint_sha256,network,asset_contract,recipient,
    payment_rail,issued_at,expires_at,availability,prepared_answer_sha256,
  ]);
  return Object.freeze({
    ...price,quote_id,issued_at,expires_at,
    quote_window_seconds:300 as const,
    request_fingerprint_sha256,
    network,asset_contract,recipient,availability,payment_rail,
    prepared_answer_sha256,execution_authorized:false as const,
  });
}

/**
 * Fail-closed verification against the production Durable Object quote
 * admission contract. Does NOT substitute the live DO readback, ledger claim,
 * cryptographic GRO proof or legally verified source rights.
 */
export function verifyGeomacroPreparedCapabilityQuote(
  supplied:unknown,
  input:Parameters<typeof quoteGeomacroPreparedCapability>[0],
  now=input.now??new Date(),
):PreparedCapabilityQuote{
  if(!Number.isFinite(now.getTime()))
    throw Error("CAPABILITY_PREPARED_QUOTE_TIME_INVALID");
  const expected=quoteGeomacroPreparedCapability(input);
  if(now.getTime()<Date.parse(expected.issued_at)||
     now.getTime()>=Date.parse(expected.expires_at))
    throw Error("CAPABILITY_PREPARED_QUOTE_EXPIRED");
  if(!supplied||typeof supplied!=="object"||Array.isArray(supplied))
    throw Error("CAPABILITY_PREPARED_QUOTE_MISSING");
  const actual=supplied as Record<string,unknown>;
  if(Object.keys(actual).length!==Object.keys(expected).length||
     Object.entries(expected).some(([k,v])=>actual[k]!==v))
    throw Error("CAPABILITY_PREPARED_QUOTE_BINDING_INVALID");
  return expected;
}

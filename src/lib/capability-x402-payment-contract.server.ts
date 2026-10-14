import { createHash } from "node:crypto";
import {
  quoteGeomacroCapability, verifyGeomacroCapabilityQuote, resolveGeomacroCapabilityPrice,
  type CapabilityQuote,
} from "./capability-pricing";
import {
  coinbaseX402PaymentRequirements,
  type CoinbaseX402Config,
} from "./coinbase-x402.server";
import {
  CIRCLE_X402_BASE_MAINNET_NETWORK, CIRCLE_X402_BASE_MAINNET_USDC,
  type CircleGatewayPaymentRequirement,
  type CircleGatewayProductionConfig,
} from "./circle-gateway-x402-production.server";

const SHA256=/^[a-f0-9]{64}$/u;
const isRecord=(value:unknown):value is Record<string,unknown> =>
  value!==null && typeof value==="object" && !Array.isArray(value);
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");

/**
 * Payment quote validation DOES NOT promote an unverified answer or authorize
 * money. The server must independently qualify and freeze the exact prepared
 * response before calling this; client values are never the price authority.
 */
export function assertAcceptedCapabilityQuote(
  quote: CapabilityQuote, now:Date=new Date(),
): CapabilityQuote {
  if (!SHA256.test(quote.prepared_answer_sha256 ?? "")) {
    throw Error("X402_CAPABILITY_PREPARED_BYTES_REQUIRED");
  }
  const start=Date.parse(quote.issued_at);
  if (!Number.isFinite(start) || start>now.getTime() ||
      !Number.isFinite(now.getTime())) throw Error("X402_CAPABILITY_QUOTE_TIME_INVALID");
  const canonical=quoteGeomacroCapability({
    capability:quote.capability,variant:quote.variant,
    requestFingerprint:quote.request_fingerprint_sha256,
    preparedAnswerSha256:quote.prepared_answer_sha256,
    network:quote.network,asset:quote.asset_contract,
    recipient:quote.recipient,rail:quote.payment_rail,
    availabilityVerified:true,now:new Date(start),
  });
  verifyGeomacroCapabilityQuote(quote,canonical,now);
  const approved=resolveGeomacroCapabilityPrice(quote.capability,quote.variant);
  if(quote.amount_atomic!==approved.amount_atomic ||
     quote.amount_usdc!==approved.amount_usdc) throw Error("X402_CAPABILITY_PRICE_NOT_APPROVED");
  return canonical;
}

export function coinbaseRequirementsForCapabilityQuote(
  config:CoinbaseX402Config, quote:CapabilityQuote, now?:Date,
) {
  const accepted=assertAcceptedCapabilityQuote(quote,now);
  if(accepted.payment_rail!=="coinbase_x402" ||
      accepted.network!==config.network ||
      accepted.asset_contract!==config.asset.toLowerCase() ||
      accepted.recipient!==config.payTo.toLowerCase()) {
    throw Error("X402_COINBASE_QUOTE_SCOPE_MISMATCH");
  }
  // Preserve all Coinbase facilitator/network/asset terms while replacing
  // the legacy flat configured price with the ONLY approved amount.
  return coinbaseX402PaymentRequirements({
    ...config,priceUsdc:accepted.amount_usdc,amountAtomic:accepted.amount_atomic,
  });
}

export function circleRequirementsForCapabilityQuote(
  config:CircleGatewayProductionConfig,
  supported:CircleGatewayPaymentRequirement,
  quote:CapabilityQuote,now?:Date,
):CircleGatewayPaymentRequirement {
  const accepted=assertAcceptedCapabilityQuote(quote,now);
  if(accepted.payment_rail!=="circle_gateway_x402" ||
      accepted.network!==CIRCLE_X402_BASE_MAINNET_NETWORK ||
      accepted.asset_contract!==CIRCLE_X402_BASE_MAINNET_USDC.toLowerCase() ||
      accepted.recipient!==config.sellerAddress.toLowerCase() ||
      supported.network!==accepted.network ||
      supported.asset.toLowerCase()!==accepted.asset_contract ||
      supported.payTo.toLowerCase()!==accepted.recipient ||
      supported.scheme!=="exact") throw Error("X402_CIRCLE_QUOTE_SCOPE_MISMATCH");
  return {...supported,amount:accepted.amount_atomic};
}

export function capabilityQuotePaymentExtension(quote:CapabilityQuote,now?:Date) {
  const accepted=assertAcceptedCapabilityQuote(quote,now);
  return {geomacro:{info:{capability_quote:accepted}}};
}

/** Fail closed before facilitator.verify or any claim. Both under- and
 * over-payment are invalid; previously signed amounts never silently change.
 * The actual provider settlement remains governed by its old ACKs.
 */
export function assertCapabilityPaymentBinding(
  payload:unknown, quote:CapabilityQuote,
  requirement:Readonly<{scheme:string;network:string;asset:string;amount:string;payTo:string}>,
  now?:Date,
) {
  const expected=assertAcceptedCapabilityQuote(quote,now);
  if(!isRecord(payload)||!isRecord(payload.accepted) ||
     !isRecord(payload.extensions)||!isRecord(payload.extensions.geomacro) ||
     !isRecord(payload.extensions.geomacro.info)) {
    throw Error("X402_CAPABILITY_PAYMENT_BINDING_MISSING");
  }
  const accepted=payload.accepted;
  if(accepted.scheme!=="exact" || accepted.scheme!==requirement.scheme ||
     accepted.network!==expected.network || accepted.network!==requirement.network ||
     String(accepted.asset??"").toLowerCase()!==expected.asset_contract ||
     String(accepted.asset??"").toLowerCase()!==requirement.asset.toLowerCase() ||
     String(accepted.payTo??"").toLowerCase()!==expected.recipient ||
     String(accepted.payTo??"").toLowerCase()!==requirement.payTo.toLowerCase() ||
     String(accepted.amount??"")!==expected.amount_atomic ||
     String(accepted.amount??"")!==requirement.amount) {
    throw Error("X402_CAPABILITY_PAYMENT_TERMS_MISMATCH");
  }
  verifyGeomacroCapabilityQuote(
    payload.extensions.geomacro.info.capability_quote,expected,now,
  );
}

/** Scope an existing Durable Object claim to the exact accepted quote and
 * frozen answer hash. The DO continues to enforce atomic amount + recipient,
 * idempotent replay and no concurrent settlement.
 */
export function capabilityLedgerRequestFingerprint(quote:CapabilityQuote,now?:Date) {
  const accepted=assertAcceptedCapabilityQuote(quote,now);
  return digest(JSON.stringify([
    "geomacro.capability-claim.v1",accepted.quote_id,
    accepted.request_fingerprint_sha256,accepted.prepared_answer_sha256,
    accepted.amount_atomic,accepted.network,accepted.asset_contract,
    accepted.recipient,accepted.payment_rail,
  ]));
}

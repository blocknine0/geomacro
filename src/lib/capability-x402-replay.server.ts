import {callDurableLedger,commerceReferenceHash,commerceFingerprint} from "./agent-commerce-delivery.server";
import {
  assertCapabilityPaymentBinding,capabilityLedgerRequestFingerprint,
  coinbaseRequirementsForCapabilityQuote,circleRequirementsForCapabilityQuote,
} from "./capability-x402-payment-contract.server";
import type {PreparedCapabilityQuote as CapabilityQuote} from "./capability-prepared-quote.server";
import type {CoinbaseX402Config} from "./coinbase-x402.server";
import type {CircleGatewayProductionConfig,CircleGatewayPaymentRequirement}
  from "./circle-gateway-x402-production.server";

/** Historical price validation is safe ONLY for the delivered-only DO
 * readback. The ordinary quote path must enforce current expiry.
 */
function quotedInstant(quote:CapabilityQuote) {
  const issued=Date.parse(quote.issued_at);
  if(!Number.isFinite(issued)||!Number.isSafeInteger(issued))throw Error("X402_REPLAY_ISSUED_AT_INVALID");
  return new Date(issued+1000);
}

export async function readAlreadyDeliveredCapabilityReplay(input:{
  quote:CapabilityQuote;
  paymentPayload:unknown;
  paymentFingerprint:string;
  requestFingerprint:string;
  config:CoinbaseX402Config|CircleGatewayProductionConfig;
  circleRequirement?:CircleGatewayPaymentRequirement;
}):Promise<null|{response:Record<string,unknown>;responseSha256:string;
  settlementReference:string|null;settlementNetwork:string|null}> {
  const {quote,config}=input;
  if(input.paymentFingerprint.length!==64||!(/^[a-f0-9]{64}$/u.test(input.paymentFingerprint)) ||
     quote.request_fingerprint_sha256!==input.requestFingerprint ||
     !input.paymentPayload||typeof input.paymentPayload!=="object" ||
     (input.paymentPayload as Record<string,unknown>).x402Version!==2)
    throw Error("X402_REPLAY_BINDING_INVALID");
  const instant=quotedInstant(quote);
  let requirement;
  let providerEnvironment;
  let rail;
  if(quote.payment_rail==="coinbase_x402"&&"payTo" in config){
    requirement=coinbaseRequirementsForCapabilityQuote(config,quote,instant);
    providerEnvironment="mainnet";rail="coinbase_cdp_exact";
  } else if(quote.payment_rail==="circle_gateway_x402"&&"sellerAddress" in config&&
            input.circleRequirement){
    requirement=circleRequirementsForCapabilityQuote(config,input.circleRequirement,quote,instant);
    providerEnvironment="production";rail="circle_gateway_batch";
  } else throw Error("X402_REPLAY_PROVIDER_SCOPE_INVALID");
  assertCapabilityPaymentBinding(input.paymentPayload,quote,requirement,instant);
  const requestFingerprint=capabilityLedgerRequestFingerprint(quote,instant);
  const record=await callDurableLedger<{
    disposition?:string;response_payload?:unknown;response_sha256?:unknown;
    settlement_reference?:unknown;settlement_network?:unknown
  }>("replay",{
    provider:quote.payment_rail,providerEnvironment,
    paymentFingerprint:input.paymentFingerprint,requestFingerprint,
    productId:quote.payment_rail==="coinbase_x402"
      ?"geomacro_coinbase_x402_v1":"geomacro_adaptive_risk_intelligence_v1",
    rail,network:quote.network,asset:quote.asset_contract,amountAtomic:quote.amount_atomic,
    recipientHash:commerceReferenceHash(quote.recipient),
  });
  if(record?.disposition==="NOT_FOUND") return null;
  if(record?.disposition!=="REPLAY") throw Error("X402_REPLAY_RESPONSE_UNVERIFIED");
  if(!record.response_payload||typeof record.response_payload!=="object"||
     Array.isArray(record.response_payload)||typeof record.response_sha256!=="string"||
     commerceFingerprint(record.response_payload)!==record.response_sha256 ||
     record.response_sha256!==quote.prepared_answer_sha256 ||
     typeof record.settlement_reference!=="string" || !record.settlement_reference.trim())
    throw Error("X402_REPLAY_IMMUTABLE_BYTES_MISMATCH");
  return {
    response:record.response_payload as Record<string,unknown>,
    responseSha256:record.response_sha256,
    settlementReference:typeof record.settlement_reference==="string"?record.settlement_reference:null,
    settlementNetwork:typeof record.settlement_network==="string"?record.settlement_network:null,
  };
}

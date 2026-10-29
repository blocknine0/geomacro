import {randomUUID} from "node:crypto";
import {assertPreparedCapabilityBuyerValue} from "./capability-buyer-output-value.server";
import type {AgentQueryPlan} from "./agent-query-plan";
import {publicAgentQueryAvailability, type AgentQueryDeliverability} from "./agent-query-deliverability.server";
import {assembleAgentQueryResponse} from "./agent-query-response.server";
import {resolveEligiblePublishedCapabilityPrice} from "./verified-capability-coinbase-binding.server";
import {quoteGeomacroPreparedCapability} from "./capability-prepared-quote.server";
import {freezeCanonicalCapabilityHttpBody} from "./capability-x402-exact-http-body.server";
import {freezeVerifiedCapabilityAnswer} from "./capability-x402-prequote.server";
import {sanitizeAndRehashPaidPreparedResponse,assertPublicPaidOutputBoundary} from "./public-paid-output-boundary";
import {GEOMACRO_STRUCTURED_LICENSE_DISCOVERY} from "./geomacro-structured-commercial-license";
import {assertGeomacroIntelligenceResponseContract} from "./geomacro-intelligence-contract";
import {assertPricedStructuredDelivery} from "./capability-structured-delivery.server";
import {assertLockedCapabilityDataBoundary} from "./capability-priced-data-boundary.server";
import {readQualifiedStructuralEvidence} from "./agent-query-qualified-evidence.server";

/** Prepare and validate the actual product from admitted evidence. Shared by
 * no-charge setup checks and paid offers; no quote, ledger write or settlement. */
export async function assembleVerifiedCapabilityProduct(input:{
  plan:AgentQueryPlan;availability:AgentQueryDeliverability;
  clientRequestId:string|null;
}) {
  const price=resolveEligiblePublishedCapabilityPrice(input.plan,input.availability);
  const qualifiedStructural=readQualifiedStructuralEvidence(input.availability,input.plan);
  const assembled=await assembleAgentQueryResponse({
    plan:input.plan,requestId:randomUUID(),clientRequestId:input.clientRequestId,
    priceUsdc:price.amount_usdc,
    ...(qualifiedStructural?{qualifiedStructural}:{}),
  });
  if(assembled.query_plan_hash!==input.plan.query_plan_hash || assembled.execution_authorized!==false)
    throw Error("CAPABILITY_PREQUOTE_QUERY_MISMATCH");
  // Qualifying source rights and 402 pricing are not sufficient if source
  // retrieval subsequently yielded EMPTY output. Fail before durable freeze.
  assertPreparedCapabilityBuyerValue(
    input.plan,input.availability,assembled,price.amount_usdc,
  );
  if(price.capability!=="gri_read" && price.capability!=="risk_gate_bundle"){
    const decisions=assembled.decision_intelligence;
    if(!Array.isArray(decisions) || decisions.length!==input.plan.subjects.length ||
      decisions.some((row:unknown)=>{
        const value=row as {market_watch?:{schema_version?:unknown;items?:unknown}}|null;
        return value?.market_watch?.schema_version!=="geomacro.paid-market-watch.v1" ||
          !Array.isArray(value.market_watch.items);
      }))
      throw Error("PAID_MARKET_WATCH_NOT_PREPARED_NO_CHARGE");
  }
  // Fresh signed SKUs must actually carry a replay-verifiable GeoMacro
  // signature in customer bytes, not only its name/hash/issuer label.
  // Legacy already-settled frozen receipts continue their old replay contract.
  if(price.capability==="signed_risk_object" &&
     (!Array.isArray(assembled.signed_risk_objects) ||
      assembled.signed_risk_objects.length!==input.plan.subjects.length ||
      assembled.signed_risk_objects.some((row:unknown)=>{
        const signed=row as {object?:{integrity?:{signature?:unknown;signature_scheme?:unknown;signing_key_id?:unknown}}};
        const integrity=signed?.object?.integrity;
        return typeof integrity?.signature!=="string" ||
          integrity.signature.length<64 ||
          integrity.signature_scheme!=="Ed25519" ||
          typeof integrity.signing_key_id!=="string" ||
          integrity.signing_key_id.length<1;
      })))
    throw Error("SIGNED_GRO_CRYPTOGRAPHIC_SIGNATURE_NOT_DELIVERABLE");
  const prepared=sanitizeAndRehashPaidPreparedResponse(assembled,{rejectEmbeddedLinks:true});
  assertGeomacroIntelligenceResponseContract(prepared);
  assertPublicPaidOutputBoundary(prepared);
  assertPricedStructuredDelivery(prepared,price.capability,price.variant);
  assertLockedCapabilityDataBoundary(prepared,price.capability,price.variant);
  assertFrozenCapabilityCurrentForSettlement(prepared);
  return {price,prepared};
}

/** One price classifier, governed assembler and existing durable vault.
 * No client-provided evidence or flags, synthetic signature, new scoring or
 * alternate pricing engine is admitted here. Structural digests remain
 * explicitly unsigned structural data, not signed current risk objects. */
export async function prepareVerifiedCapabilityOffer(input:{
  plan:AgentQueryPlan;availability:AgentQueryDeliverability;
  clientRequestId:string|null;requestFingerprint:string;
  rail:"coinbase_x402"|"circle_gateway_x402"|"xpay_x402"|"dexter_x402";
  network:string;asset:string;recipient:string;
}) {
  // New public Risk Gate sales are on hold; existing paid frozen replays are
  // handled by the route before calling this function. No PREDGE change.
  if(input.plan.product?.capability==="risk_gate_bundle" || input.plan.topics.includes("risk_gate"))
    throw Error("RISK_GATE_COMING_SOON_NO_CHARGE");
  const {price,prepared}=await assembleVerifiedCapabilityProduct(input);
  const response=sanitizeAndRehashPaidPreparedResponse({...prepared,
    availability:publicAgentQueryAvailability(input.availability),
    payment:{required:true,provider:input.rail,
      asset:"USDC",asset_contract:input.asset.toLowerCase(),network:input.network,
      amount_atomic:price.amount_atomic,amount_usdc:price.amount_usdc,
      capability:price.capability,variant:price.variant,
      output_contract_version:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id,
      settlement_proof:"PAYMENT-RESPONSE_HEADER_ONLY",query_plan_bound:true},
  },{rejectEmbeddedLinks:true});
  assertFrozenCapabilityResponse(response);
  assertFrozenCapabilityCurrentForSettlement(response);
  const frozen=freezeCanonicalCapabilityHttpBody(response);
  const quote=quoteGeomacroPreparedCapability({
    capability:price.capability,variant:price.variant,
    requestFingerprint:input.requestFingerprint,preparedAnswerSha256:frozen.sha256,
    network:input.network,asset:input.asset,recipient:input.recipient,rail:input.rail,
    availabilityVerified:true,preparedAnswerVerified:true,
  });
  return freezeVerifiedCapabilityAnswer({quote,preparedIntelligence:response});
}

/** Validate without modifying any already quoted bytes or product hash. */
export function assertFrozenCapabilityResponse(response:Record<string,unknown>) {
  const {availability:_availability,payment:_payment,...safeIntelligence}=response;
  assertGeomacroIntelligenceResponseContract(safeIntelligence);
  assertPublicPaidOutputBoundary(response);
  const payment=response.payment;
  if(payment&&typeof payment==="object"&&!Array.isArray(payment)){
    const {capability,variant}=payment as Record<string,unknown>;
    if(typeof capability!=="string"||typeof variant!=="string")
      throw Error("CAPABILITY_STRUCTURED_DELIVERY_PRICE_MISSING");
    const selected=(response.question_interpretation as {product?:{capability?:string;variant?:string}}|undefined)?.product;
    if(selected && (selected.capability!==capability||selected.variant!==variant))
      throw Error("CAPABILITY_FROZEN_STORE_PRODUCT_MISMATCH");
    assertPricedStructuredDelivery(response,capability,variant);
    assertLockedCapabilityDataBoundary(response,capability,variant);
  }
}

/** An unexpired quote cannot renew a signed object's own earlier expiry.
 * Delivered-only replay intentionally does not call this current-data check. */
export function assertFrozenCapabilityCurrentForSettlement(response:Record<string,unknown>,now=Date.now()) {
  if(!Number.isFinite(now)) throw Error("CAPABILITY_SIGNED_PROOF_EXPIRED");
  if(!Array.isArray(response.signed_risk_objects)) throw Error("CAPABILITY_SIGNED_PROOF_EXPIRED");
  for(const row of response.signed_risk_objects) {
    const expires=Date.parse(String(row?.object?.expires_at??""));
    if(!Number.isFinite(expires)||expires<=now) throw Error("CAPABILITY_SIGNED_PROOF_EXPIRED");
  }
}

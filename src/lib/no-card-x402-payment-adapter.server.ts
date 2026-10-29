import process from "node:process";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { assertCommercialLaunchAuthorized } from "./commercial-launch-gate.server";
import { assertSharedUsdcReceiver } from "./shared-usdc-receiver.server";
import { assertAcceptedCapabilityQuote, assertCapabilityPaymentBinding,
  capabilityLedgerRequestFingerprint } from "./capability-x402-payment-contract.server";
import { readVerifiedCapabilityAnswer } from "./capability-x402-prequote.server";
import { assertFrozenCapabilityResponse, assertFrozenCapabilityCurrentForSettlement }
  from "./capability-x402-offer.server";
import { freezeCanonicalCapabilityHttpBody } from "./capability-x402-exact-http-body.server";
import { claimAgentCommerceDelivery, prepareAgentCommerceDelivery,
  completeAgentCommerceDelivery, releaseAgentCommerceDelivery, commerceFingerprint }
  from "./agent-commerce-delivery.server";
import type { PreparedCapabilityQuote } from "./capability-prepared-quote.server";

/**
 * ISOLATED ADAPTER — NOT ROUTED TO PUBLIC CHECKOUT.
 *
 * No signed payment is accepted until an explicit future production
 * review connects the canonical endpoint with current-source validation.
 * These rails never use Circle Gateway batching or Coinbase CDP credentials.
 */
export type NoCardX402Provider = "xpay_x402" | "dexter_x402";
export type NoCardQuote = PreparedCapabilityQuote & {
  payment_rail: NoCardX402Provider;
};
export const NO_CARD_X402_ACK =
  "I_AUTHORIZE_NO_CARD_FACILITATOR_REAL_USDC" as const;
export const PROVIDER_ENDPOINTS: Readonly<Record<NoCardX402Provider,string>> = Object.freeze({
  xpay_x402: "https://facilitator.xpay.sh",
  dexter_x402: "https://x402.dexter.cash",
});
const HEX_TX = /^0x[a-fA-F0-9]{64}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const VALID_NETWORKS:Readonly<Record<NoCardX402Provider,readonly string[]>> = {
  xpay_x402: ["eip155:8453"],
  dexter_x402: ["eip155:8453", "eip155:137"],
};
const NATIVE_ASSETS:Readonly<Record<string,string>> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:137": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

export function assertNoCardQuoteScope(quote:PreparedCapabilityQuote,now=new Date()): NoCardQuote {
  const accepted=assertAcceptedCapabilityQuote(quote,now);
  const provider=accepted.payment_rail;
  if(provider!=="xpay_x402" && provider!=="dexter_x402")
    throw Error("NO_CARD_PROVIDER_NOT_ALLOWED");
  if(!VALID_NETWORKS[provider].includes(accepted.network)||
      accepted.asset_contract!==NATIVE_ASSETS[accepted.network]?.toLowerCase())
    throw Error("NO_CARD_NETWORK_OR_NATIVE_USDC_MISMATCH");
  return accepted as NoCardQuote;
}

export function requirementsForNoCardQuote(quote:PreparedCapabilityQuote,now=new Date()) {
  const q=assertNoCardQuoteScope(quote,now);
  return {
    scheme:"exact" as const, network:q.network,asset:q.asset_contract,
    amount:q.amount_atomic,payTo:q.recipient,maxTimeoutSeconds:60,
    extra:{name:"USDC" as const,version:"2" as const},
  };
}

/**
 * Positive /supported means ONLY advertised capability, never live payment
 * or financial approval. The xpay /supported format is provider-specific.
 */
export async function probeNoCardX402Supported(
  provider:NoCardX402Provider, network:string,
  fetcher:typeof fetch=fetch,
) {
  if(!VALID_NETWORKS[provider]?.includes(network)) return false;
  const response=await fetcher(PROVIDER_ENDPOINTS[provider]+"/supported",{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(5500),
  });
  if(!response.ok||Number(response.headers.get("content-length")||0)>65536)
    return false;
  const raw=await response.text();
  if(raw.length>65536)return false;
  const data=JSON.parse(raw) as {
    kinds?:Array<{x402Version?:number;scheme?:string;network?:string}>;
    supportedNetworks?:Array<{version?:string;networkId?:string}>;
  };
  if(Array.isArray(data.kinds))
    return data.kinds.some(kind=>kind.x402Version===2 && kind.scheme==="exact" &&
      kind.network===network);
  if(provider==="xpay_x402" && Array.isArray(data.supportedNetworks))
    return data.supportedNetworks.some(kind=>kind.version==="v2" && kind.networkId===network);
  return false;
}

/** Fail closed on missing merchant authority, fee approval, or frozen ledger. */
export function assertNoCardProductionAuthorized(quote:PreparedCapabilityQuote) {
  const q=assertNoCardQuoteScope(quote);
  assertCommercialLaunchAuthorized(q.payment_rail);
  assertSharedUsdcReceiver(q.recipient);
  if(process.env.GEOMACRO_NO_CARD_MAINNET_ACK?.trim()!==NO_CARD_X402_ACK ||
      process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK?.trim()!=="I_ACCEPT_REAL_FUNDS_SECURITY_GATES" ||
      process.env.GEOMACRO_COMMERCE_LEDGER_BACKEND?.trim()!=="durable_object" ||
      process.env.GEOMACRO_NO_CARD_PROVIDER_FEE_APPROVED?.trim()!=="I_HAVE_VERIFIED_CURRENT_PROVIDER_FEES")
    throw Error("NO_CARD_PRODUCTION_SETTLEMENT_NOT_AUTHORIZED");
  return q;
}

type Verified={isValid:boolean;payer?:string;invalidReason?:string};
type Settled={success:boolean;transaction?:string;network?:string;payer?:string;errorReason?:string};
type ChainConfirmation={confirmed:boolean;network:string;asset:string;recipient:string;
  amountAtomic:string;transaction:string};
type Claim={disposition:string;claim_token:string|null;response_payload?:unknown;
  response_sha256?:string|null;settlement_reference?:string|null;settlement_network?:string|null};
type Adapters={
  authorize:(quote:NoCardQuote)=>void;
  loadFrozen:(quote:NoCardQuote,requestFingerprint:string)=>Promise<Record<string,unknown>>;
  claim:(input:{provider:NoCardX402Provider;paymentFingerprint:string;
    requestFingerprint:string;quote:NoCardQuote;clientRequestId:string|null})=>Promise<Claim>;
  verify:(payload:Record<string,unknown>,requirement:ReturnType<typeof requirementsForNoCardQuote>)=>Promise<Verified>;
  revalidateCurrent:(quote:NoCardQuote,prepared:Record<string,unknown>)=>Promise<boolean>;
  prepare:(provider:NoCardX402Provider,paymentFingerprint:string,
    token:string,prepared:Record<string,unknown>)=>Promise<string>;
  settle:(payload:Record<string,unknown>,requirement:ReturnType<typeof requirementsForNoCardQuote>)=>Promise<Settled>;
  confirmChain:(settlement:Settled,quote:NoCardQuote)=>Promise<ChainConfirmation>;
  complete:(provider:NoCardX402Provider,paymentFingerprint:string,token:string,
    payer:string|null,settled:Settled)=>Promise<void>;
  release:(provider:NoCardX402Provider,paymentFingerprint:string,token:string,
    code:string,manualReview:boolean)=>Promise<void>;
};

/**
 * Independent, dependency-injected lifecycle for deterministic no-funds tests.
 * No facade using this function is exposed through GeoMacro's public router.
 * The real facade below always enforces independent founder/security ACKs.
 *
 * Distinct stages: exact quote -> frozen DO readback -> atomic claim -> verify
 * -> current evidence -> durable prepare -> settle -> independent chain
 * confirmation -> complete -> immutable response. Unknown settlement is
 * NEVER retried automatically.
 */
export async function executeNoCardPreparedPurchase(input:{
  quote:PreparedCapabilityQuote;paymentPayload:Record<string,unknown>;
  requestFingerprint:string;clientRequestId?:string|null;
}, deps:Adapters) {
  const quote=assertNoCardQuoteScope(input.quote);
  const requirement=requirementsForNoCardQuote(quote);
  if(!SHA.test(input.requestFingerprint)||
      input.requestFingerprint!==quote.request_fingerprint_sha256)
    throw Error("NO_CARD_REQUEST_BINDING_MISMATCH");
  assertCapabilityPaymentBinding(input.paymentPayload,quote,requirement);
  deps.authorize(quote);

  const prepared=await deps.loadFrozen(quote,input.requestFingerprint);
  assertFrozenCapabilityResponse(prepared);
  const preparedHash=freezeCanonicalCapabilityHttpBody(prepared).sha256;
  if(preparedHash!==quote.prepared_answer_sha256)
    throw Error("NO_CARD_FROZEN_BYTES_HASH_MISMATCH");

  const paymentFingerprint=commerceFingerprint(input.paymentPayload);
  const ledgerRequestFingerprint=capabilityLedgerRequestFingerprint(quote);
  const claim=await deps.claim({
    provider:quote.payment_rail,paymentFingerprint,
    requestFingerprint:ledgerRequestFingerprint,quote,
    clientRequestId:input.clientRequestId??null,
  });
  if(claim.disposition==="REPLAY"){
    if(!claim.response_payload || claim.response_sha256!==preparedHash ||
        commerceFingerprint(claim.response_payload)!==commerceFingerprint(prepared) ||
        !claim.settlement_reference||!HEX_TX.test(claim.settlement_reference) ||
        claim.settlement_network!==quote.network)
      throw Error("NO_CARD_REPLAY_RECEIPT_MISMATCH");
    return {response:prepared,receipt:claim.settlement_reference,replayed:true,chargedAgain:false};
  }
  if(claim.disposition!=="CLAIMED"||!claim.claim_token)
    throw Error("NO_CARD_SETTLEMENT_IN_PROGRESS_OR_RECONCILIATION_REQUIRED");
  const token=claim.claim_token;
  const release=async(code:string,manualReview:boolean)=>{
    await deps.release(quote.payment_rail,paymentFingerprint,token,code,manualReview);
  };
  let verified:Verified;
  try{
    verified=await deps.verify(input.paymentPayload,requirement);
  }catch{
    await release("VERIFY_UNAVAILABLE_NO_SETTLEMENT",false);
    throw Error("NO_CARD_VERIFICATION_UNAVAILABLE");
  }
  if(!verified.isValid){
    await release("INVALID_SIGNED_PAYMENT",false);
    throw Error("NO_CARD_SIGNED_PAYMENT_INVALID");
  }
  try{
    const current=await deps.revalidateCurrent(quote,prepared);
    if(current!==true)throw Error("EVIDENCE_NOT_CURRENT");
    assertNoCardQuoteScope(quote);
    assertFrozenCapabilityCurrentForSettlement(prepared);
    const stagedSha=await deps.prepare(quote.payment_rail,paymentFingerprint,token,prepared);
    if(stagedSha!==preparedHash)throw Error("PREPARED_LEDGER_BYTES_MISMATCH");
  }catch{
    await release("PRE_SETTLEMENT_EVIDENCE_OR_LEDGER_FAILURE",false);
    throw Error("NO_CARD_PRE_SETTLEMENT_HOLD_NO_CHARGE");
  }

  let settled:Settled;
  try{
    settled=await deps.settle(input.paymentPayload,requirement);
  }catch{
    await release("AMBIGUOUS_SETTLEMENT_LOCK",true);
    throw Error("NO_CARD_SETTLEMENT_AMBIGUOUS_RECONCILE_FIRST");
  }
  if(!settled.success || !settled.transaction || !HEX_TX.test(settled.transaction) ||
      settled.network!==quote.network){
    await release("SETTLEMENT_FAILED_OR_UNVERIFIABLE",true);
    throw Error("NO_CARD_SETTLEMENT_RECONCILIATION_REQUIRED");
  }
  try{
    const chain=await deps.confirmChain(settled,quote);
    if(chain.confirmed!==true || chain.transaction!==settled.transaction ||
      chain.network!==quote.network || chain.asset.toLowerCase()!==quote.asset_contract ||
      chain.recipient.toLowerCase()!==quote.recipient ||
      chain.amountAtomic!==quote.amount_atomic)
      throw Error("CHAIN_RECEIPT_SCOPE_MISMATCH");
    await deps.complete(quote.payment_rail,paymentFingerprint,token,
      settled.payer??verified.payer??null,settled);
  }catch{
    await release("POST_SETTLEMENT_CHAIN_OR_LEDGER_RECONCILE",true).catch(()=>undefined);
    throw Error("NO_CARD_POST_SETTLEMENT_RECONCILIATION_REQUIRED");
  }
  return {response:prepared,receipt:settled.transaction,replayed:false,chargedAgain:false};
}

/** Actual live client: URL is source-code allowlisted, never buyer-controlled. */
export function noCardProviderClient(provider:NoCardX402Provider) {
  return new HTTPFacilitatorClient({url:PROVIDER_ENDPOINTS[provider],timeoutMs:15000});
}

/**
 * Production ledger integration, ready for a reviewed route to call.
 * No actual chain confirmation callback has been installed; callers MUST
 * implement independently verified transaction/log/finality checking.
 * No publicly accessible API path calls this function at present.
 */
export async function runNoCardMainnetPreparedPurchase(input:{
  quote:PreparedCapabilityQuote;paymentPayload:Record<string,unknown>;
  requestFingerprint:string;clientRequestId?:string|null;
  revalidateCurrent:(quote:NoCardQuote,prepared:Record<string,unknown>)=>Promise<boolean>;
  confirmChain:(settlement:Settled,quote:NoCardQuote)=>Promise<ChainConfirmation>;
}) {
  const quote=assertNoCardProductionAuthorized(input.quote);
  const supported=await probeNoCardX402Supported(quote.payment_rail,quote.network);
  if(!supported)throw Error("NO_CARD_PROVIDER_CURRENT_SUPPORT_UNVERIFIED");
  const client=noCardProviderClient(quote.payment_rail);
  const env="mainnet";
  return executeNoCardPreparedPurchase(input,{
    authorize:assertNoCardProductionAuthorized,
    loadFrozen:async(q,fp)=>{
      const x=await readVerifiedCapabilityAnswer({quote:q,requestFingerprint:fp});
      return x.intelligence;
    },
    claim:async({provider,paymentFingerprint,requestFingerprint,quote:q,clientRequestId})=>
      claimAgentCommerceDelivery({
        provider,providerEnvironment:env,paymentFingerprint,requestFingerprint,
        productId:"geomacro_adaptive_risk_intelligence_v1",
        clientRequestId,sourceChannel:"geomacro_canonical_structured",
        rail:provider,network:q.network,asset:q.asset_contract,
        amountAtomic:q.amount_atomic,recipientReference:q.recipient,
      }),
    verify:async(payload,req)=>client.verify(
      payload as Parameters<typeof client.verify>[0],
      req as Parameters<typeof client.verify>[1]) as Promise<Verified>,
    revalidateCurrent:input.revalidateCurrent,
    prepare:async(provider,paymentFingerprint,token,prepared)=>{
      const result=await prepareAgentCommerceDelivery({provider,providerEnvironment:env,
        paymentFingerprint,claimToken:token,responsePayload:prepared});
      return result.responseSha256;
    },
    settle:async(payload,req)=>client.settle(
      payload as Parameters<typeof client.settle>[0],
      req as Parameters<typeof client.settle>[1]) as Promise<Settled>,
    confirmChain:input.confirmChain,
    complete:async(provider,paymentFingerprint,token,payer,settled)=>{
      await completeAgentCommerceDelivery({provider,providerEnvironment:env,paymentFingerprint,
        claimToken:token,payerReference:payer,
        settlementReference:settled.transaction!,settlementNetwork:settled.network!});
    },
    release:async(provider,paymentFingerprint,token,code,manualReview)=>{
      await releaseAgentCommerceDelivery({provider,providerEnvironment:env,paymentFingerprint,
        claimToken:token,failureCode:code,manualReview});
    },
  });
}

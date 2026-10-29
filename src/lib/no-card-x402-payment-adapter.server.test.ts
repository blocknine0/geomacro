import { describe, it, expect, vi } from "vitest";
import { quoteGeomacroPreparedCapability } from "./capability-prepared-quote.server";
import { freezeCanonicalCapabilityHttpBody } from "./capability-x402-exact-http-body.server";
import { commerceFingerprint } from "./agent-commerce-delivery.server";
import { executeNoCardPreparedPurchase, assertNoCardQuoteScope,
  requirementsForNoCardQuote, assertNoCardProductionAuthorized, assertNoCardFeeCeiling } from "./no-card-x402-payment-adapter.server";

// No live data can be commercially valid in a synthetic no-funds fixture.
// The real guarded production entrypoint MUST use the canonical validators.
vi.mock("./capability-x402-offer.server", () => ({
  assertFrozenCapabilityResponse: vi.fn(() => undefined),
  assertFrozenCapabilityCurrentForSettlement: vi.fn(() => undefined),
}));

const TX = "0x" + "a".repeat(64);
const RECIPIENT = "0x" + "1".repeat(40);
const PREPARED = Object.freeze({
  schema_version: "test-only.synthetic-not-commercial",
  signed_risk_objects: [],
  assertion: "NO_FUNDS_ONLY",
});
const SHA = freezeCanonicalCapabilityHttpBody(PREPARED).sha256;
const fp = "f".repeat(64);
const base = {
  capability: "structural_country_digest",
  variant: "standard",
  requestFingerprint: fp,
  preparedAnswerSha256: SHA,
  recipient: RECIPIENT,
  availabilityVerified: true,
  preparedAnswerVerified: true,
} as const;
function fixture(provider:"xpay_x402"|"dexter_x402" = "xpay_x402", polygon=false) {
  const quote = quoteGeomacroPreparedCapability({
    ...base, rail: provider, network: polygon?"eip155:137":"eip155:8453",
    asset:polygon?"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359":
      "0x833589fCD6eDb6E08f4C7C32D4f71b54bdA02913",
  });
  const r = requirementsForNoCardQuote(quote);
  const paymentPayload = {
    x402Version: 2, accepted: {...r},
    extensions: {geomacro:{info:{capability_quote:quote}}},
    payload: {nonce: "test-only-not-valid-signature"},
  };
  const makeDeps = () => {
    const authorize = vi.fn(() => undefined);
    const loadFrozen = vi.fn(async() => PREPARED as unknown as Record<string,unknown>);
    const claim = vi.fn(async()=>({disposition:"CLAIMED",claim_token:"synthetic-token"}));
    const verify = vi.fn(async()=>({isValid:true,payer:"0x"+"2".repeat(40)}));
    const revalidateCurrent = vi.fn(async()=>true);
    const prepare = vi.fn(async()=>SHA);
    const settle = vi.fn(async()=>({success:true,transaction:TX,network:quote.network,payer:"0x"+"2".repeat(40)}));
    const confirmChain = vi.fn(async()=>({confirmed:true,transaction:TX,network:quote.network,
      asset:quote.asset_contract,recipient:quote.recipient,amountAtomic:quote.amount_atomic}));
    const complete = vi.fn(async()=>undefined);
    const release = vi.fn(async()=>undefined);
    return {authorize,loadFrozen,claim,verify,revalidateCurrent,prepare,settle,
      confirmChain,complete,release};
  };
  return {quote,paymentPayload,makeDeps};
}

describe("No-card mainnet x402 candidate adapters — NO FUNDS", () => {
  it("validates provider/network/asset scope, not arbitrary Arc or bridged USDC", () => {
    const x = fixture();
    expect(assertNoCardQuoteScope(x.quote).network).toBe("eip155:8453");
    const p = fixture("dexter_x402",true);
    expect(assertNoCardQuoteScope(p.quote).network).toBe("eip155:137");
    expect(()=>quoteGeomacroPreparedCapability({
      ...base,rail:"xpay_x402",network:"eip155:137",
      asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    })).toThrow();
    expect(()=>quoteGeomacroPreparedCapability({
      ...base,rail:"dexter_x402",network:"eip155:5042",
      asset:"0x3600000000000000000000000000000000000000",
    })).toThrow();
  });
  it("simulates one claim / durable prepare / settlement / chain confirmation / delivery",async()=>{
    const f=fixture(); const deps=f.makeDeps();
    const out=await executeNoCardPreparedPurchase({
      quote:f.quote,paymentPayload:f.paymentPayload,requestFingerprint:fp,
    },deps);
    expect(out.replayed).toBe(false);
    expect(out.receipt).toBe(TX);
    expect(deps.claim).toHaveBeenCalledTimes(1);
    expect(deps.verify).toHaveBeenCalledTimes(1);
    expect(deps.prepare).toHaveBeenCalledTimes(1);
    expect(deps.settle).toHaveBeenCalledTimes(1);
    expect(deps.confirmChain).toHaveBeenCalledTimes(1);
    expect(deps.complete).toHaveBeenCalledTimes(1);
    expect(deps.release).not.toHaveBeenCalled();
  });
  it("rejects wrong signed amount before claim or settlement",async()=>{
    const f=fixture();const deps=f.makeDeps();
    const altered={...f.paymentPayload,accepted:{...f.paymentPayload.accepted,amount:"30000"}};
    await expect(executeNoCardPreparedPurchase({
      quote:f.quote,paymentPayload:altered,requestFingerprint:fp,
    },deps)).rejects.toThrow();
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.settle).not.toHaveBeenCalled();
  });
  it("invalid signature is a no-charge failure and releases claim",async()=>{
    const f=fixture();const deps=f.makeDeps();deps.verify.mockResolvedValueOnce({isValid:false,payer:""});
    await expect(executeNoCardPreparedPurchase({
      quote:f.quote,paymentPayload:f.paymentPayload,requestFingerprint:fp,
    },deps)).rejects.toThrow("NO_CARD_SIGNED_PAYMENT_INVALID");
    expect(deps.release).toHaveBeenCalledWith("xpay_x402",expect.any(String),
      "synthetic-token","INVALID_SIGNED_PAYMENT",false);
    expect(deps.settle).not.toHaveBeenCalled();
  });
  it("stale data stops before settlement",async()=>{
    const f=fixture();const deps=f.makeDeps();deps.revalidateCurrent.mockResolvedValueOnce(false);
    await expect(executeNoCardPreparedPurchase({
      quote:f.quote,paymentPayload:f.paymentPayload,requestFingerprint:fp,
    },deps)).rejects.toThrow("NO_CARD_PRE_SETTLEMENT_HOLD_NO_CHARGE");
    expect(deps.settle).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith("xpay_x402",expect.any(String),
      "synthetic-token","PRE_SETTLEMENT_EVIDENCE_OR_LEDGER_FAILURE",false);
  });
  it("unknown settlement is frozen for manual reconciliation and never retried",async()=>{
    const f=fixture();const deps=f.makeDeps();deps.settle.mockRejectedValueOnce(Error("network response missing"));
    await expect(executeNoCardPreparedPurchase({
      quote:f.quote,paymentPayload:f.paymentPayload,requestFingerprint:fp,
    },deps)).rejects.toThrow("NO_CARD_SETTLEMENT_AMBIGUOUS_RECONCILE_FIRST");
    expect(deps.settle).toHaveBeenCalledTimes(1);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith("xpay_x402",expect.any(String),
      "synthetic-token","AMBIGUOUS_SETTLEMENT_LOCK",true);
  });
  it("on-chain token / amount mismatch blocks post-settlement paid delivery",async()=>{
    const f=fixture("dexter_x402",true);const deps=f.makeDeps();
    deps.confirmChain.mockResolvedValueOnce({confirmed:true,transaction:TX,network:"eip155:137",
      asset:f.quote.asset_contract,recipient:f.quote.recipient,amountAtomic:"1"});
    await expect(executeNoCardPreparedPurchase({
      quote:f.quote,paymentPayload:f.paymentPayload,requestFingerprint:fp,
    },deps)).rejects.toThrow("NO_CARD_POST_SETTLEMENT_RECONCILIATION_REQUIRED");
    expect(deps.complete).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith("dexter_x402",expect.any(String),
      "synthetic-token","POST_SETTLEMENT_CHAIN_OR_LEDGER_RECONCILE",true);
  });
  it("an already delivered receipt is replayed without another verify or settle",async()=>{
    const f=fixture();const deps=f.makeDeps();
    deps.claim.mockResolvedValueOnce({
      disposition:"REPLAY",claim_token:null,response_payload:PREPARED,response_sha256:SHA,
      settlement_reference:TX,settlement_network:f.quote.network,
    } as never);
    const out=await executeNoCardPreparedPurchase({
      quote:f.quote,paymentPayload:f.paymentPayload,requestFingerprint:fp,
    },deps);
    expect(out.replayed).toBe(true);
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.settle).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
    expect(commerceFingerprint(out.response)).toBe(commerceFingerprint(PREPARED));
  });
  it("real funds remain locked without separate production approvals",()=>{
    const f=fixture();
    expect(()=>assertNoCardProductionAuthorized(f.quote)).toThrow();
  });
});

describe("Fee budget: owner-attested fee, never net profit",()=>{
  it("permits zero fee and prevents PayAI-sized fees on a 2-cent SKU",()=>{
    const q=fixture().quote;
    expect(assertNoCardFeeCeiling(q,"0").feeAtomic).toBe("0");
    expect(assertNoCardFeeCeiling(q,"0.001").maxAtomic).toBe("1000");
    expect(()=>assertNoCardFeeCeiling(q,"0.00197")).toThrow();
    expect(()=>assertNoCardFeeCeiling(q,"0.00362")).toThrow();
    expect(()=>assertNoCardFeeCeiling(q,"")).toThrow();
    expect(()=>assertNoCardFeeCeiling(q,"-0.01")).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { buildAgentQueryPlan } from "./agent-query-plan";
import type { AgentQueryDeliverability } from "./agent-query-deliverability.server";
import { assertCoinbasePaymentBinding, coinbaseX402PaymentRequirements,
  type CoinbaseX402Config } from "./coinbase-x402.server";
import { resolveEligibleCoinbaseCapabilityConfig } from "./verified-capability-coinbase-binding.server";

const noFundsConfig: CoinbaseX402Config = {
  environment:"testnet",commercialEnvironment:"testnet",network:"eip155:84532",
  networkName:"Base Sepolia",chainId:"84532",
  asset:"0x0000000000000000000000000000000000000001",
  payTo:"0x0000000000000000000000000000000000000002",
  priceUsdc:"0.05",amountAtomic:"50000",apiKeyId:null,apiKeySecret:null,
};
const country = [{type:"country" as const,country_iso3:"USA"}];
const baselinePlan = () => buildAgentQueryPlan({
  schema_version:"geomacro.agent-query.v1",
  subjects:country,topics:["critical_minerals"],
  delivery_tier:"structural_baseline",fulfillment_mode:"published_only",detail:"compact",
});
const availability = (plan: ReturnType<typeof baselinePlan>): AgentQueryDeliverability => ({
  deliverable:true,code:"AVAILABLE",query_plan_hash:plan.query_plan_hash,
  checked_at:"2026-10-15T00:00:00.000Z",missing_modules:[],stale_modules:[],
  ineligible_source_ids:[],source_contracts:[{
    source_id:"governed-derived-source",commercial_usage_status:"DERIVED_ONLY",
    attribution_required:false,raw_redistribution_allowed:false,licence_name:"Derived commercial usage",
  }],subjects:[{
    subject:plan.subjects[0],status:"AVAILABLE",available_modules:["critical_minerals"],
    latest_evidence_at:"2026-10-14T00:00:00.000Z",
    required_source_ids:["governed-derived-source"],governed_fallback_modules:[],
  }],
});

describe("verified canonical x402 capability-price binding — no funds",()=>{
  it("quotes the approved 0.02 USDC structural country digest, not the old flat 0.05",()=>{
    const plan=baselinePlan();
    const priced=resolveEligibleCoinbaseCapabilityConfig(plan,availability(plan),noFundsConfig,
      new Date("2026-10-15T00:00:00.000Z"));
    expect(priced.priceUsdc).toBe("0.02");
    expect(priced.amountAtomic).toBe("20000");
    expect(coinbaseX402PaymentRequirements(priced).amount).toBe("20000");
    expect(noFundsConfig.amountAtomic).toBe("50000"); // no shared config mutation
    const payment={x402Version:2,accepted:coinbaseX402PaymentRequirements(priced)};
    expect(()=>assertCoinbasePaymentBinding(payment,priced)).not.toThrow();
    expect(()=>assertCoinbasePaymentBinding({
      ...payment,accepted:{...payment.accepted,amount:"50000"},
    },priced)).toThrow("PAYMENT_AMOUNT_MISMATCH");
  });

  it("never derives a price from an unverified or price-tampered buyer plan",()=>{
    const plan=baselinePlan();
    const expected=availability(plan);
    expect(()=>resolveEligibleCoinbaseCapabilityConfig(plan,{
      ...expected,query_plan_hash:"a".repeat(64)},noFundsConfig)).toThrow();
    for(const changed of [
      {...expected,deliverable:false,code:"INSUFFICIENT_COVERAGE" as const},
      {...expected,missing_modules:["critical_minerals"]},
      {...expected,stale_modules:["critical_minerals"]},
      {...expected,source_contracts:[]},
      {...expected,source_contracts:[{...expected.source_contracts[0],attribution_required:true}]},
      {...expected,subjects:[{...expected.subjects[0],latest_evidence_at:null}]},
      {...expected,subjects:[{...expected.subjects[0],available_modules:[]}]},
    ])expect(()=>resolveEligibleCoinbaseCapabilityConfig(plan,changed,noFundsConfig)).toThrow();
    expect(()=>resolveEligibleCoinbaseCapabilityConfig(plan,expected,noFundsConfig,
      new Date("2026-10-13T00:00:00.000Z"))).toThrow();
  });

  it("cannot price an unsigned signed-risk product or an unproven GRI read",()=>{
    const plan=buildAgentQueryPlan({
      subjects:country,topics:["macro_risk"],detail:"compact",
      delivery_tier:"signed_risk_intelligence",
    });
    const a={...availability(baselinePlan()),query_plan_hash:plan.query_plan_hash};
    expect(()=>resolveEligibleCoinbaseCapabilityConfig(plan,a,noFundsConfig))
      .toThrow("CAPABILITY_PRICE_SIGNED_RISK_PROOF_REQUIRED");
  });
});

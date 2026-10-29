import test from "node:test";
import assert from "node:assert/strict";
import {NETWORKS,PROVIDERS,supportsExactV2,auditOptions,paymentAdmission,feeOnlyEstimate}
  from "../lib/no-card-x402-facilitator-policy.mjs";
const exact=id=>({kinds:[{x402Version:2,scheme:"exact",network:id}]});
test("Base and Polygon proposed, Arc never invented",()=>{
  assert.deepEqual(Object.keys(NETWORKS),["base","polygon","arc"]);
  assert.equal(auditOptions("arc").length,0);
  assert.deepEqual(PROVIDERS.xpay.networks,["base"]);
  assert.deepEqual(auditOptions("invalid"),[]);
});
test("exact V2 only, no v1, testnet, wrong network or misleading shape",()=>{
  assert.equal(supportsExactV2("dexter",exact("eip155:137"),"polygon"),true);
  assert.equal(supportsExactV2("dexter",exact("eip155:80002"),"polygon"),false);
  assert.equal(supportsExactV2("payai",{kinds:[{x402Version:1,scheme:"exact",network:"polygon"}]},"polygon"),false);
  assert.equal(supportsExactV2("payai",{kinds:[{x402Version:2,scheme:"upto",network:"eip155:8453"}]},"base"),false);
  assert.equal(supportsExactV2("xpay",{supportedNetworks:[{version:"v2",networkId:"eip155:8453"}]},"base"),true);
  assert.equal(supportsExactV2("xpay",{supportedNetworks:[{version:"v2",networkId:"eip155:137"}]},"polygon"),false);
  assert.equal(supportsExactV2("dexter",{supportedNetworks:[{version:"v2",networkId:"eip155:137"}]},"polygon"),false);
});
test("positive support never activates settlement",()=>{
  const row=auditOptions("base",{xpay:exact("eip155:8453")})[0];
  assert.equal(row.supportedNow,true);
  assert.equal(row.paymentEnabled,false);
  assert.equal(row.merchantSettlementReady,false);
});
test("signed payment, issued quote, pending settlement cannot switch providers",()=>{
  for(const field of ["paymentSignaturePresent","quoteAlreadyIssued","settlementPending"]){
    const result=paymentAdmission({protocol:"x402-v2-exact",chain:"base",[field]:true});
    assert.equal(result.allowed,false);
    assert.equal(result.reason,"NEVER_SWITCH_PROVIDER_AFTER_QUOTE_OR_SIGNATURE");
  }
  assert.equal(paymentAdmission({protocol:"x402-v2-exact",chain:"base"}).allowed,false);
  assert.equal(paymentAdmission({protocol:"x402-v2-exact",chain:"arc"}).allowed,false);
});
test("fee-only margin is not a verified profit",()=>{
  assert.deepEqual(feeOnlyEstimate("20000",0.00197),{
    grossUsd:0.02,facilitatorFeeUsd:0.00197,afterFacilitatorUsd:0.01803,verifiedNetProfit:false,
  });
  assert.throws(()=>feeOnlyEstimate("oops",0));
  assert.throws(()=>feeOnlyEstimate("20000",-1));
});

test("five-percent facilitator fee ceiling protects micropayment margin", async () => {
  const { feeBudgetDecision } = await import("../lib/no-card-x402-facilitator-policy.mjs");
  const base002 = feeBudgetDecision("20000", 0.00197);
  assert.equal(base002.passesFeeOnlyCeiling, false);
  assert.equal(base002.capAtomic, "1000");
  assert.equal(base002.paymentEnabled, false);
  assert.equal(feeBudgetDecision("20000", 0.00362).passesFeeOnlyCeiling, false);
  assert.equal(feeBudgetDecision("100000", 0.00197).passesFeeOnlyCeiling, true);
  assert.equal(feeBudgetDecision("20000", 0).passesFeeOnlyCeiling, true);
  assert.equal(feeBudgetDecision("20000", undefined).passesFeeOnlyCeiling, false);
  assert.throws(() => feeBudgetDecision("20000", 0.001, 10001));
});

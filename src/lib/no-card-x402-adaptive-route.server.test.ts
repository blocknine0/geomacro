import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {encodeX402Header} from "./coinbase-x402.server";
import {isNoCardSignedPayload,publicNoCardSelectedNetwork,
  handleNoCardAdaptiveCheckout} from "./no-card-x402-adaptive-route.server";

const sha="a".repeat(64);
function signedRail(rail:string){
  return encodeX402Header({
    x402Version:2,
    extensions:{geomacro:{info:{capability_quote:{
      quote_id:sha,request_fingerprint_sha256:sha,
      prepared_answer_sha256:sha,payment_rail:rail,
    }}}},
  });
}
describe("public low-fee mainnet checkout routing — no funds",()=>{
  it("validates networks and never offers Arc/testnet or unrecognized rails",()=>{
    const base=publicNoCardSelectedNetwork(new Request("https://geomacro.live/api/v1/intelligence/query"));
    const polygon=publicNoCardSelectedNetwork(new Request("https://geomacro.live/api/v1/intelligence/query?network=polygon"));
    expect(base.provider).toBe("xpay_x402");
    expect(base.rail.caip2).toBe("eip155:8453");
    expect(polygon.provider).toBe("dexter_x402");
    expect(polygon.rail.caip2).toBe("eip155:137");
    expect(()=>publicNoCardSelectedNetwork(new Request("https://geomacro.live/api/v1/intelligence/query?network=arc"))).toThrow();
    expect(()=>publicNoCardSelectedNetwork(new Request("https://geomacro.live/api/v1/intelligence/query?network=base-sepolia"))).toThrow();
  });
  it("identifies existing signed Coinbase proofs separately, preserving historic replay",()=>{
    expect(isNoCardSignedPayload(signedRail("xpay_x402"))).toBe(true);
    expect(isNoCardSignedPayload(signedRail("dexter_x402"))).toBe(true);
    expect(isNoCardSignedPayload(signedRail("coinbase_x402"))).toBe(false);
    expect(isNoCardSignedPayload("not-base64")).toBe(false);
    expect(isNoCardSignedPayload(null)).toBe(false);
  });
  it("does not create a payment without separate merchant approvals",async()=>{
    const request=new Request("https://geomacro.live/api/v1/intelligence/query",{method:"POST"});
    const plan={query_plan_hash:sha} as never;
    const resp=await handleNoCardAdaptiveCheckout({request,plan,requestBody:{},clientRequestId:null});
    expect(resp.status).toBe(503);
    const data=await resp.json();
    expect(data.chargeable).toBe(false);
    expect(data.error.code).toBe("NO_CARD_MERCHANT_MAINNET_NOT_AUTHORIZED");
    expect(resp.headers.get("PAYMENT-REQUIRED")).toBeNull();
  });
  it("supports delivered-only replay mode but refuses new funds",async()=>{
    const request=new Request("https://geomacro.live/api/v1/intelligence/query",{method:"POST"});
    const resp=await handleNoCardAdaptiveCheckout({request,
      plan:{query_plan_hash:sha} as never,requestBody:{},replayOnly:true});
    expect(resp.status).toBe(503);
    expect((await resp.json()).error.code).toBe("NO_CARD_NEW_SALES_DISABLED_REPLAY_ONLY");
  });
  it("public route is opt-in, after live-on-demand no-charge branch and before legacy Coinbase",()=>{
    const code=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    expect(code).toContain("isNoCardSignedPayload(existingPaymentSignature)");
    expect(code).toContain("explicitlyConfiguredNoCardCheckout()");
    expect(code).toContain("handleNoCardAdaptiveCheckout");
    expect(code.indexOf("if (plan.fulfillment_mode === \"live_on_demand\")"))
      .toBeLessThan(code.indexOf("const noCardProof="));
    expect(code.indexOf("const noCardProof="))
      .toBeLessThan(code.indexOf("try { config = getCoinbaseX402Config(); } catch (error) {"));
  });
});

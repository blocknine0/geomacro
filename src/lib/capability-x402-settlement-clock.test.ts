import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(p:string)=>readFileSync(p,"utf8");
describe("capability settlement remains fail-closed after quote expiry (NO FUNDS)",()=>{
 it("revalidates source-frozen price quote before each irreversible provider settlement",()=>{
  for(const [path,settle]of [
    ["src/lib/mainnet-intelligence-endpoint.server.ts","settleCoinbaseX402(paymentPayload, pricedConfig)"],
    ["src/routes/api.x402.circle_.intelligence.ts","settleCircleGatewayProduction(paymentPayload, requirement)"],
  ]as const){
    const code=read(path),start=code.indexOf('try { assertAcceptedCapabilityQuote(capabilityQuote); } catch {');
    const irreversible=code.indexOf(settle,start);
    expect(start).toBeGreaterThan(0);
    expect(irreversible).toBeGreaterThan(start);
    const before=code.slice(start,irreversible);
    expect(before).toContain("CAPABILITY_QUOTE_EXPIRED_BEFORE_SETTLEMENT");
    expect(before).toContain("payment_required_now:false");
  }
 });
});

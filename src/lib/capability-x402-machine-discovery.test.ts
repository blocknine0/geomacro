import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {GEOMACRO_CAPABILITY_PRICES} from "./capability-pricing-catalog";
const read=(path:string)=>readFileSync(path,"utf8");
describe("x402 public discovery never advertises legacy flat prices as capability offers",()=>{
 it("uses the frozen catalog and only an exact request-scoped 402 for live providers",()=>{
   const discovery=read("src/lib/x402-discovery.server.ts");
   expect(discovery).toContain("capabilityPricingCatalog()");
   expect(discovery).toContain("IMMUTABLE_SERVER_QUOTE_ONLY");
   expect(discovery).toContain("EXACT_CAPABILITY_VARIANT_QUOTED_PER_VERIFIED_REQUEST");
   expect(discovery).not.toContain("accepts: [coinbaseX402PaymentRequirements(config)]");
   expect(discovery).not.toContain("accepts: [requirement]");
 });
 it("protects 0.25 USDC approved maximum without changing daily spend",()=>{
   const guard=read("src/lib/coinbase-x402-usage-guard.server.ts");
   expect(guard).toContain('DEFAULT_MAINNET_MAX_PRICE_USDC = "0.25"');
   expect(guard).toContain('DEFAULT_DAILY_SPEND_USDC = "1.00"');
   expect(Math.max(...Object.values(GEOMACRO_CAPABILITY_PRICES).flatMap(
      v=>Object.values(v).map(Number)))).toBe(0.25);
 });
});

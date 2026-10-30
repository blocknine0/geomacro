import {describe,expect,it} from "vitest";
import {canonicalCheckoutUrl,selectedCheckoutNetwork} from "./x402-checkout-network-selection";
const base="https://geomacro.live/api/v1/intelligence/structured-answer";
describe("Base/Polygon x402 checkout selector — no funds",()=>{
  it("maps exact native-USDC mainnets without modifying the canonical POST scope",()=>{
    expect(selectedCheckoutNetwork(new Request(base))).toBeNull();
    expect(selectedCheckoutNetwork(new Request(base+"?network=base"))).toBe("base");
    expect(selectedCheckoutNetwork(new Request(base+"?network=polygon"))).toBe("polygon");
    expect(canonicalCheckoutUrl(new Request(base)).toString())
      .toBe("https://geomacro.live/api/v1/intelligence/query");
    expect(canonicalCheckoutUrl(new Request(base+"?network=base")).toString())
      .toBe("https://geomacro.live/api/v1/intelligence/query?network=base");
    expect(canonicalCheckoutUrl(new Request(base+"?network=polygon")).toString())
      .toBe("https://geomacro.live/api/v1/intelligence/query?network=polygon");
  });
  it("does not silently reinterpret Arc/testnet, duplicates or unrelated query params as Base",()=>{
    for(const suffix of [
      "?network=arc","?network=base-sepolia","?network=polygon&network=base",
      "?network=","?view=latest","?network=polygon&price=0.001","#extra",
    ]){
      expect(()=>selectedCheckoutNetwork(new Request(base+suffix))).toThrow("MAINNET_NETWORK_QUERY_UNSUPPORTED");
      expect(()=>canonicalCheckoutUrl(new Request(base+suffix))).toThrow("MAINNET_NETWORK_QUERY_UNSUPPORTED");
    }
  });
});

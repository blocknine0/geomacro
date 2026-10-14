import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("capability x402 no-charge coverage preflight cannot become a flat production quote",()=>{
  it("preserves legacy synthetic testnet hint without advertising mainnet configuration as exact price",()=>{
    const source=readFileSync("src/routes/api.x402.risk_.availability.ts","utf8");
    expect(source).toContain("GEOMACRO_CAPABILITY_PRICING_VERSION");
    expect(source).toContain("capability_price_quote_required: true");
    expect(source).toContain("signed_customer_answer_prepared: false");
    expect(source).toContain("chargeable: false");
    expect(source).toContain('exact_price: config.environment === "testnet" ? {');
    expect(source).toContain("testnet_hint_only: true");
    expect(source).toContain("} : null");
    expect(source).toContain("authenticated immutable prequote readback");
    expect(source).not.toContain("chargeable: availability.deliverable");
  });
});

import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {GEOMACRO_CAPABILITY_PRICES,resolveGeomacroCapabilityPrice} from "../lib/capability-pricing-catalog";

const builder=readFileSync("src/lib/agent-query-response.server.ts","utf8");
const schema=JSON.parse(readFileSync("schemas/adaptive-intelligence-response-v1.schema.json","utf8"));

describe("no phantom flat 0.05 USDC price on commercial adaptive responses",()=>{
  it("never invents a paid offer when quote classification was not supplied",()=>{
    expect(builder).toContain('pricing_phase: "CAPABILITY_USDC_V2"');
    expect(builder).toContain("price_usdc: input.priceUsdc ?? null");
    expect(builder).not.toContain('pricing_phase: "EARLY_ADOPTION_10K"');
    expect(builder).not.toContain("GEOMACRO_INTELLIGENCE_PRICE_USDC");
    expect(builder).not.toMatch(/price_usdc:\s*"0\.05"/u);
  });
  it("preserves historical pricing phase in schema only for immutable older replay",()=>{
    const p=schema.properties.methodology.properties.pricing_phase;
    expect(p.enum).toEqual(["EARLY_ADOPTION_10K","CAPABILITY_USDC_V1","CAPABILITY_USDC_V2"]);
    expect(schema.properties.methodology.properties.price_usdc.type).toContain("null");
  });
  it("must use approved variant 0.02,0.05,0.10 and 0.15 amounts when available",()=>{
    expect(resolveGeomacroCapabilityPrice("structural_country_digest","standard").amount_usdc).toBe("0.02");
    expect(resolveGeomacroCapabilityPrice("intelligence_query","focused").amount_usdc).toBe("0.02");
    expect(resolveGeomacroCapabilityPrice("intelligence_query","standard").amount_usdc).toBe("0.03");
    expect(resolveGeomacroCapabilityPrice("intelligence_query","complex_multi_source").amount_usdc).toBe("0.05");
    expect(Object.keys(GEOMACRO_CAPABILITY_PRICES)).toHaveLength(8);
  });
});

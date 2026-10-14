import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GEOMACRO_CAPABILITY_PRICES, capabilityPricingCatalog } from "./capability-pricing-catalog";

const read=(path:string)=>readFileSync(path,"utf8");
describe("same founder schedule on website and in x402 discovery",()=>{
  it("renders the canonical schedule in both commercial pages",()=>{
    const view=read("src/components/capability-pricing-table.tsx");
    expect(view).toContain('resolveGeomacroCapabilityPrice(capability, variant)');
    expect(view).toContain("GEOMACRO_PRICING_GROUPS.map");
    for(const page of ["src/routes/pricing.tsx","src/routes/data-api.tsx"]){
      expect(read(page)).toContain("CapabilityPricingTable");
      expect(read(page)).not.toContain("Launch price for the first 20,000");
    }
    expect(read("src/components/commercial-access-guide.tsx")).not.toContain("0.05 USDC per successful delivery");
  });
  it("public catalog exactly exposes 8 capabilities and 14 variants",()=>{
    expect(capabilityPricingCatalog()).toHaveLength(8);
    expect(capabilityPricingCatalog().flatMap(x=>x.variants)).toHaveLength(14);
    expect(Object.keys(GEOMACRO_CAPABILITY_PRICES).length).toBe(8);
  });
});

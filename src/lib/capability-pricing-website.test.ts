import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {
  GEOMACRO_CAPABILITY_PRICES,
  GEOMACRO_CAPABILITY_PRICING_VERSION,
  capabilityPricingCatalog,
  resolveGeomacroCapabilityPrice,
} from "./capability-pricing-catalog";

const read=(path:string)=>readFileSync(path,"utf8");

describe("canonical capability pricing parity on the public website",()=>{
  it("displays the one approved catalog on both commercial pages",()=>{
    const schedule=read("src/components/capability-price-schedule.tsx");
    const pricing=read("src/routes/pricing.tsx");
    const dataApi=read("src/routes/data-api.tsx");
    expect(schedule).toContain("GEOMACRO_CAPABILITY_PRICES");
    expect(schedule).toContain("GEOMACRO_PRICING_GROUPS");
    expect(schedule).toContain("GEOMACRO_CAPABILITY_PRICING_VERSION");
    expect(pricing).toContain("<CapabilityPriceSchedule />");
    expect(dataApi).toContain("<CapabilityPriceSchedule compact />");
    for(const source of [pricing,dataApi]){
      expect(source).not.toContain("Launch price for the first 20,000");
      expect(source).not.toContain("USDC / successful delivery");
    }
    expect(read("src/components/home/live-intelligence-showcase.tsx")).not.toContain("From 0.05 USDC");
    expect(read("src/components/agent-commerce-status.tsx")).not.toContain("USDC/call");
  });
  it("exposes exactly eight founder-approved capabilities and 14 variants",()=>{
    expect(GEOMACRO_CAPABILITY_PRICING_VERSION).toBe("geomacro.capability-usdc.v1");
    expect(Object.keys(GEOMACRO_CAPABILITY_PRICES)).toHaveLength(8);
    const catalog=capabilityPricingCatalog();
    expect(catalog).toHaveLength(8);
    expect(catalog.flatMap(row=>row.variants)).toHaveLength(14);
    for(const row of catalog){
      for(const item of row.variants){
        expect(resolveGeomacroCapabilityPrice(row.capability,item.variant).amount_atomic)
          .toBe(item.amount_atomic);
      }
      expect(row.availability).toBe("CHECK_LIVE_PROOF_BEFORE_PAYMENT");
    }
  });
});
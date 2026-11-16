import {describe,it,expect} from "vitest";
import {intelligenceRiskTakeaways} from "../lib/intelligence-risk-takeaways";

describe("source-neutral intelligence risk takeaways",()=>{
  it("provides structured non-directional analysis for all three categories",()=>{
    for(const category of ["geopolitics","macro","rare_earth"] as const){
      const result=intelligenceRiskTakeaways(category);
      expect(result.mechanism.length).toBeGreaterThan(20);
      expect(result.effect.length).toBeGreaterThan(20);
      expect(result.market.length).toBeGreaterThan(10);
      expect(result.posture).toBe("CONTINUE");
      expect(JSON.stringify(result)).not.toMatch(/https?:\/\/|www\.|\b(?:buy|sell)\b/i);
    }
  });
  it("does not accept or copy source headlines, URLs or publisher fields",()=>{
    expect(intelligenceRiskTakeaways.length).toBe(2);
    const sourceNeutral=intelligenceRiskTakeaways("macro");
    expect(JSON.stringify(sourceNeutral)).not.toContain("publisher");
    expect(JSON.stringify(sourceNeutral)).not.toContain("headline");
  });
});

import {describe,it,expect} from "vitest";
import {buildSignedQueryBoundFiveFieldBatch} from "./on-demand-verified-five-field-bridge.server";
describe("genuine machine authority-only five field extraction",()=>{
  it("never accepts unsigned arbitrary source pair or forged query hash",async()=>{
    await expect(buildSignedQueryBoundFiveFieldBatch({
      queryPlanHash:"not-a-real-sha",rows:[],eventPackages:[],
    })).rejects.toThrow("QUERY_BOUND_HIGH_AUTHORITY_INPUT_INVALID");
  });
  it("does not create payable fields from an unsigned pair of alleged originals",async()=>{
    await expect(buildSignedQueryBoundFiveFieldBatch({
      queryPlanHash:"a".repeat(64),rows:[],eventPackages:[],
    })).rejects.toThrow();
  });
});

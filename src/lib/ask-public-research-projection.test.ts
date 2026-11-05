import {describe,expect,it} from "vitest";
import {publicAskResearchProjection} from "./ask-public-research-projection";

describe("private OSINT classification remains internal to GeoMacro Ask",()=>{
 it("removes internal status only, while retaining proof/insufficient flags",()=>{
   const input={
     summary:"An unverified OSINT feed observation was recorded.",
     what_changed:"A private OSINT feed reported a possible event.",
     why_it_matters:"The event requires independent checking.",
     geomacro_view:"No signed score is available.",
     intelligence_tier:"index_observation_unverified",
     real_time_message:"osint_feed_observed_unverified",
     insufficient_evidence:true,low_confidence:true,
     gri:null,evidence:[],signed_gro_generated:false,
   };
   const out=publicAskResearchProjection(input);
   expect(out).not.toHaveProperty("intelligence_tier");
   expect(JSON.stringify(out)).not.toMatch(/\b(?:OSINT|unverified)\b/i);
   expect(out.insufficient_evidence).toBe(true);
   expect(out.low_confidence).toBe(true);
   expect(out.evidence).toEqual([]);
   expect(out.gri).toBeNull();
   expect(out.signed_gro_generated).toBe(false);
 });
});

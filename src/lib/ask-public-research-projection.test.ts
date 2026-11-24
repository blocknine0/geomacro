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
   expect(out.execution_authorized).toBe(false);
   expect(out.decision_support_boundary).toContain("Decision support only");
   expect(out.geomacro_view).toContain("not execution authorization or a signed Risk Gate");
 });
 it("removes prose em dashes from every public answer field",()=>{
   const out=publicAskResearchProjection({
     summary:"Current picture — still uncertain.",what_changed:"No new release — the journal is empty.",
     why_it_matters:"The data is delayed — conclusions should wait.",geomacro_view:"Advisory — not execution authority.",
     real_time_message:"Read complete — no signature.",
   });
   expect(JSON.stringify(out)).not.toContain("—");
   expect(out.execution_authorized).toBe(false);
 });
});

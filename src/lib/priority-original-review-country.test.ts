import {describe,it,expect} from "vitest";
import {selectPriorityOriginalReviewCountry} from "./priority-original-review-country";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
const now=new Date("2026-10-23T10:00:00Z");
const signal=(id:string,geography:string|null,category:"macro"|"geopolitics"|"rare_earth",
 published_at="2026-10-23T08:00:00Z",other:Partial<StatelessIntelligenceSignal>={})=>({
 id,geography,category,published_at,date_precision:"exact",
 status:"official_release_observed_unscored",sources_credited:[],
 same_event_corrob_verified:false,severity:null,...other,
} as StatelessIntelligenceSignal);
describe("shared D1 observation to PRIVATE original-signing intake routing",()=>{
 it("prioritizes actual exact-country original-dated unscored journal leads without commercial promotion",()=>{
   const x=selectPriorityOriginalReviewCountry([
     signal("macro-12345678","Malawi","macro"),
     signal("rare_earth-87654321","Malawi","rare_earth"),
     signal("geopolitics-11111111","Canada","geopolitics"),
   ],"USA",now);
   expect(x.country_iso3).toBe("MWI");
   expect(x.eligible_country_count).toBe(2);
   expect(x.selected_country_observed_categories).toBe(2);
   expect(x.selection_mode).toBe("SHARED_D1_RECENT_COUNTRY_LEAD");
   expect(x.journal_is_original_evidence).toBe(false);
   expect(x.source_rights_or_signature_verified).toBe(false);
   expect(x.paid_output_authorized).toBe(false);
 });
 it("rejects ambiguous or non-country, malformed credits, day-only, stale, future, invalid clocks, and unclassified leads",()=>{
   const s=signal("macro-12345678","Malawi","macro");
   const inputs=[
     {...s,geography:"Africa"}, {...s,geography:"https://bad.example"},
     {...s,sources_credited:[null] as unknown as string[]},
     {...s,date_precision:"day",published_at:"2026-10-23"},
     {...s,published_at:"2026-10-22T10:00:00Z"},
     {...s,published_at:"2026-10-23T10:01:00Z"},
     {...s,published_at:"invalid"},
     {...s,status:"official_feed_candidate_unscored"},
     {...s,severity:4}, {...s,same_event_corrob_verified:true},
   ] as StatelessIntelligenceSignal[];
   for(const input of inputs){
     const x=selectPriorityOriginalReviewCountry([input],"VAT",now);
     expect(x.selection_mode).toBe("CANONICAL_195_ROTATION");
     expect(x.country_iso3).toBe("VAT");
     expect(x.eligible_country_count).toBe(0);
   }
 });
 it("a D1 journal with no eligible article cannot suppress full 195-country rotating probe",()=>{
   const x=selectPriorityOriginalReviewCountry([],"PSE",now);
   expect(x.country_iso3).toBe("PSE");
   expect(x.eligible_country_count).toBe(0);
 });
 it("does not infer country solely from the publisher and rejects invalid fallback",()=>{
   const s=signal("macro-12345678",null,"macro");
   expect(selectPriorityOriginalReviewCountry([s],"MRT",now).country_iso3).toBe("MRT");
   expect(()=>selectPriorityOriginalReviewCountry([s],"ZZZ",now)).toThrow(/INPUT_INVALID/);
 });
 it("bounded country choice remains deterministic and never emits source material",()=>{
   const countries=["Canada","India","Malawi","United States"];
   const signals=countries.map((name,i)=>
     signal("macro-"+String(i+1).padStart(8,"0"),name,"macro"));
   const a=selectPriorityOriginalReviewCountry(signals,"ZAF",now);
   const b=selectPriorityOriginalReviewCountry(signals,"ZAF",now);
   expect(a).toEqual(b);
   const receipt=JSON.stringify(a);
   expect(receipt).not.toMatch(/http|source_url|article_title|original_article|private_key/iu);
 });
});

it("keeps attributed original observations eligible for PRIVATE review routing without granting rights",()=>{
 const rows=[signal("geopolitics-12345678","Sudan","geopolitics",undefined,
  {sources_credited:["Attribution remains required"]})];
 const chosen=selectPriorityOriginalReviewCountry(rows,"MYS",now);
 expect(chosen.country_iso3).toBe("SDN");
 expect(chosen.source_rights_or_signature_verified).toBe(false);
 expect(chosen.paid_output_authorized).toBe(false);
 expect(rows[0].sources_credited).toEqual(["Attribution remains required"]);
 expect(JSON.stringify(chosen)).not.toContain("Attribution remains required");
});

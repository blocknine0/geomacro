import {describe,it,expect} from "vitest";
import {intelligenceActorHeadline,intelligenceActorChange,intelligenceActorIsKnown}
 from "../lib/public-intelligence-actor-copy";
import {findCardFromObservedRelease} from "../lib/find-card-v1";
import type {StatelessCategory,StatelessIntelligenceSignal}
 from "../lib/stateless-intelligence-model";
const at=Date.parse("2026-10-24T00:00:00Z");
function signal(category:StatelessCategory,title:string,changed:string):StatelessIntelligenceSignal{
 return {id:category+"-1234abcd",category,
  title,what_changed:changed,why_it_matters:"Specific results require corroboration.",
  topic:category==="macro"?"monetary policy":
    category==="rare_earth"?"critical-minerals supply":"foreign policy",
  geography:null,development_type:"official update",
  published_at:"2026-10-23T22:00:00.000Z",date_precision:"exact",
  observed_release_count:1,sources_credited:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null};
}
describe("actor-first derived Intelligence for the three exact website categories",()=>{
 it.each(["geopolitics","macro","rare_earth"] as const)(
 "does not publish generic publisher from legacy 72h category %s",category=>{
  const s=signal(category,"Geomacro finds official release on "+category,
   "An official publisher released an original-dated announcement about "+category+".");
  expect(intelligenceActorHeadline(s)).toContain("Actor not verified:");
  expect(intelligenceActorChange(s)).toContain("does not establish who");
  expect(intelligenceActorIsKnown(s)).toBe(false);
  const card=findCardFromObservedRelease(s,at);
  // The source-free Find Card contract can omit an ineligible limited item;
  // the three-category first-paint UI independently renders truthful actor copy.
  if(card){
    expect(card.headline).toContain("Actor not verified:");
    expect(card.what_changed).not.toContain("An official publisher");
    expect(JSON.stringify(card)).not.toMatch(/https?:\/\/|source_url|original_title/iu);
  }
 });
 it.each([
  ["geopolitics","European Commission","announced new sanctions"],
  ["macro","Federal Reserve","announced its policy review"],
  ["rare_earth","Government of Canada","approved a lithium project"],
 ] as const)("shows verified named actor %s when both original-derived fields agree",
  (category,actor,action)=>{
   const s=signal(category,"Geomacro finds "+actor+" "+action,
      actor+" "+action+". No independent outcome established.");
   expect(intelligenceActorHeadline(s)).toContain(actor+" "+action);
   expect(intelligenceActorChange(s)).toContain(actor);
   expect(intelligenceActorIsKnown(s)).toBe(true);
 });
 it("never guesses country-mentioned actor, copies private title or invents an event",()=>{
  const s=signal("geopolitics",
   "Geomacro finds a SECRET UPSTREAM ORIGINAL TITLE THAT MUST NEVER LEAK",
   "An official publisher released a claim about sanctions mentioning Canada.");
  expect(intelligenceActorHeadline(s)).toBe("Actor not verified: foreign policy");
  expect(intelligenceActorChange(s)).not.toContain("Canada");
  expect(intelligenceActorChange(s)).not.toContain("An official publisher");
 });
});

import {describe,it,expect} from "vitest";
import {deriveStatelessSignals,selectOfficialTopic} from "../lib/stateless-intelligence-model";
import {doeMineralsIndexCandidates,doeMineralsOriginalArticleMatches,
  pinnedDoeMineralsArticle} from "../lib/stateless-us-doe-minerals-original.server";
import {pinnedDerivedOriginalReference}
  from "../../scripts/lib/derived-original-reference-pins.mjs";
import {FIVE_MINUTE_NEWS_FASTLANE,FIVE_MINUTE_NEWS_FALLBACK_ROTATION,
  selectFiveMinuteFallback} from "../lib/stateless-public-intelligence.server";

const TITLE="Energy Department Awards $16 Million for University Initiatives that Rebuild Americas Critical Minerals Workforce";
const URL="https://www.energy.gov/cmei/articles/energy-department-awards-16-million-university-initiatives-rebuild-americas-critical";
const CLOCK=Date.parse("2026-10-28T12:00:00.000Z");
const card=(title=TITLE,url=URL,day="October 26, 2026")=>
  '<main><div class="views-row"><a href="'+url+'">'+title+'</a>'+
    '<div class="date">'+day+'</div></div></main>';
const article=(title=TITLE,day="October 26, 2026")=>
  '<html><main><h1>'+title+'</h1><p class="original-date">'+day+
  '</p><section>DOE primary release page</section></main></html>';

describe("DOE first-party Critical Minerals index is safe when RSS is unreachable",()=>{
 it("pins only same-origin article URLs; no query, redirect, duplicate or off-host",()=>{
  expect(pinnedDoeMineralsArticle(URL)).toBe(URL);
  expect(pinnedDerivedOriginalReference({sourceId:"us_doe_cmei_minerals_index",
    category:"rare_earth",articleUrl:URL})).toBeTruthy();
  for(const url of [
    "https://evil.example/cmei/articles/energy-department-awards-16-million-university-initiatives-rebuild-americas-critical",
    URL+"?ref=1",URL+"#latest","http://www.energy.gov/cmei/articles/energy-department-awards-16-million-university-initiatives-rebuild-americas-critical",
    "https://www.energy.gov.evil.example/cmei/articles/energy-department-awards-16-million-university-initiatives-rebuild-americas-critical",
    "https://www.energy.gov/cmm/critical-minerals-and-materials-program",
  ])expect(pinnedDoeMineralsArticle(url)).toBeNull();
 });
 it("admits a dated genuine issuer index lead only when original article independently matches",()=>{
   expect(selectOfficialTopic(TITLE,"rare_earth")).toBeTruthy();
   const leads=doeMineralsIndexCandidates(card(),CLOCK);
   expect(leads).toHaveLength(1);
   expect(leads[0].publishedAt).toBe("2026-10-26");
   expect(leads[0].datePrecision).toBe("day");
   expect(leads[0].sourceId).toBe("us_doe_cmei_minerals_index");
   expect(leads[0].credit).toBe("U.S. Department of Energy");
   expect(doeMineralsOriginalArticleMatches(article(),leads[0])).toBe(true);
   expect(doeMineralsOriginalArticleMatches(article(TITLE,"October 25, 2026"),leads[0])).toBe(false);
   expect(doeMineralsOriginalArticleMatches(article("DOE generic news commentary"),leads[0])).toBe(false);
   const signals=deriveStatelessSignals(leads,CLOCK,{maxSignals:4});
   expect(signals).toHaveLength(1);
   expect(signals[0].status).toBe("official_release_observed_unscored");
   expect(signals[0].date_precision).toBe("day");
   expect(signals[0].published_at).toBe("2026-10-26");
   expect(signals[0].same_event_corrob_verified).toBe(false);
   expect(signals[0].severity).toBeNull();
   expect(JSON.stringify(signals)).not.toContain(URL);
   expect(JSON.stringify(signals)).not.toContain(TITLE);
 });
 it("blocks one-day uncertainty, expired or future and fabricated dates",()=>{
   expect(doeMineralsIndexCandidates(card(),Date.parse("2026-10-27T08:00:00Z"))).toEqual([]);
   expect(doeMineralsIndexCandidates(card(),Date.parse("2026-10-30T00:00:01Z"))).toEqual([]);
   expect(doeMineralsIndexCandidates(card(TITLE,URL,"October 30, 2026"),CLOCK)).toEqual([]);
   expect(doeMineralsIndexCandidates(card(TITLE,URL,"February 30, 2026"),CLOCK)).toEqual([]);
   expect(doeMineralsIndexCandidates(card(TITLE,URL,"October 26, 2026")+
     '<div>October 27, 2026</div>',CLOCK)).toHaveLength(0);
 });
 it("rejects missing index date, disallowed source identity, bad topic and attacker markup",()=>{
   expect(doeMineralsIndexCandidates(card(TITLE,URL,""),CLOCK)).toEqual([]);
   expect(doeMineralsIndexCandidates(card("Department publishes website navigation",URL),CLOCK)).toEqual([]);
   expect(doeMineralsIndexCandidates(card(TITLE,URL).replace("</div></div>","October 27, 2026</div></div>"),CLOCK)).toEqual([]);
   expect(doeMineralsIndexCandidates("<!DOCTYPE [<!ENTITY x SYSTEM 'file:///etc/passwd'>]>"+card(),CLOCK)).toEqual([]);
   const lead=doeMineralsIndexCandidates(card(),CLOCK)[0];
   expect(doeMineralsOriginalArticleMatches(article(),{...lead,sourceId:"external_news"})).toBe(false);
   expect(doeMineralsOriginalArticleMatches("<html>invalid</html>",lead)).toBe(false);
 });
 it("retains existing 16 primaries and adds exactly one DOE fallback rotation slot",()=>{
   expect(FIVE_MINUTE_NEWS_FASTLANE).toHaveLength(16);
   expect(FIVE_MINUTE_NEWS_FASTLANE.some(s=>s.id==="us_doe_cmei_minerals_index")).toBe(false);
   expect(FIVE_MINUTE_NEWS_FALLBACK_ROTATION.rare_earth).toContain("us_doe_cmei_minerals_index");
   const at=Date.parse("2026-10-28T12:00:00Z");
   const selected=Array.from({length:FIVE_MINUTE_NEWS_FALLBACK_ROTATION.rare_earth.length},
     (_,i)=>selectFiveMinuteFallback("rare_earth",at+i*300000).id);
   expect(selected.filter(s=>s==="us_doe_cmei_minerals_index")).toHaveLength(1);
 });
});

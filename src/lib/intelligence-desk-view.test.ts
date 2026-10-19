import {describe,it,expect} from "vitest";
import {filterIntelligenceDesk,intelligenceCategorySearch} from "./intelligence-desk-view";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
const now=Date.parse("2026-10-19T04:00:00Z");
const row=(id:string,category:"geopolitics"|"macro"|"rare_earth",at:string):StatelessIntelligenceSignal=>({id,category,published_at:at,date_precision:"exact",title:"Policy release",what_changed:"A dated release was observed.",why_it_matters:"Possible exposure requires confirmation.",topic:"FX reporting",geography:"India",development_type:"official update",sources_credited:[],observed_release_count:1,status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null});
const base={category:"all" as const,query:"",period:"all" as const};
describe("Intelligence desk view",()=>{
 it("isolates exact category and searches country and topic together",()=>{
  const rows=[row("a","macro","2026-10-18T20:00:00Z"),row("b","geopolitics","2026-10-18T21:00:00Z")];
  expect(filterIntelligenceDesk(rows,{...base,category:"macro",query:"  INDIA fx "},now).map(x=>x.id)).toEqual(["a"]);
  expect(filterIntelligenceDesk(rows,{...base,query:"unmatched"},now)).toEqual([]);
 });
 it("uses original dates for time windows and excludes invalid, future and expired rows",()=>{
  const rows=[row("new","macro","2026-10-18T20:00:00Z"),row("week","macro","2026-10-15T12:00:00Z"),row("old","macro","2026-09-25T12:00:00Z"),row("expired","macro","2026-09-01T12:00:00Z"),row("future","macro","2026-10-20T12:00:00Z"),row("bad","macro","not-a-date")];
  expect(filterIntelligenceDesk(rows,{...base,period:"24h"},now).map(x=>x.id)).toEqual(["new"]);
  expect(filterIntelligenceDesk(rows,{...base,period:"7d"},now).map(x=>x.id)).toEqual(["new","week"]);
  expect(filterIntelligenceDesk(rows,base,now).map(x=>x.id)).toEqual(["new","week","old"]);
 });
 it("sorts equivalent timezone instants deterministically without changing dates or credits",()=>{
  const a=row("a","macro","2026-10-18T20:00:00Z"),b=row("b","macro","2026-10-18T22:00:00+02:00");
  a.sources_credited=["Required credit"];
  expect(filterIntelligenceDesk([b,a],base,now)).toEqual([a,b]);
  expect(a.sources_credited).toEqual(["Required credit"]);expect(b.published_at).toBe("2026-10-18T22:00:00+02:00");
 });
 it("accepts supported category deep links and ignores invalid filters",()=>{
  expect(intelligenceCategorySearch({category:"rare_earth"})).toEqual({category:"rare_earth"});
  expect(intelligenceCategorySearch({category:"macro"})).toEqual({category:"macro"});
  for(const category of ["risk_score",["macro"],null,"<script>"])expect(intelligenceCategorySearch({category})).toEqual({});
 });
});

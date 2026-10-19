import {describe,it,expect} from "vitest";
import {releaseNewsObservation} from "../lib/release-news-observation";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
import {publicHeadline} from "../lib/intelligence-editorial";

describe("derived release news without invented outcomes",()=>{
 it("distinguishes an appeal from an achieved ceasefire",()=>{
  const result=releaseNewsObservation("UN calls for immediate ceasefire in Sudan");
  expect(result?.headline).toBe("Call for a ceasefire");
  expect(result?.change).toContain("does not establish that fighting has stopped");
 });
 it("does not promote negated, quoted or hypothetical action",()=>{
  for(const text of ["Canada denies it announces sanctions on Russia",
   "India could cut interest rates",'Minister asks: "Who calls for ceasefire?"',
   "China may introduce new export controls", "UK rejects new sanctions"])
   expect(releaseNewsObservation(text)).toBeNull();
 });
 it("preserves the distinction between a proposal and an announcement",()=>{
  expect(releaseNewsObservation("China proposes new export controls")?.change)
   .toContain("does not establish that they are in force");
  expect(releaseNewsObservation("China announces new export controls")?.headline)
   .toBe("Trade restrictions announced");
 });
 it("keeps unmatched updates limited and never copies raw text",()=>{
  expect(releaseNewsObservation("PRIVATE HEADLINE about diplomacy in Canada")).toBeNull();
 });
 it("uses actual derived action and an explicit country while preserving original clocks",()=>{
  const at="2026-10-19T08:00:00.000Z", now=Date.parse("2026-10-19T12:00:00.000Z");
  const [signal]=deriveStatelessSignals([{sourceId:"uk_fcdo",category:"geopolitics",
    title:"UK announces new sanctions on Russia",articleUrl:"https://www.gov.uk/a-specific-release",
    publishedAt:at,credit:null}],now);
  expect(signal.title).toContain("New sanctions announced");
  expect(signal.title).not.toContain("\u2014");
  expect(signal.geography).toBe("United Kingdom");
  expect(signal.what_changed).toContain("announces sanctions");
  expect(signal.published_at).toBe(at);
  expect(signal.same_event_corrob_verified).toBe(false);
  expect(signal.severity).toBeNull();
 });
 it("removes em dashes from existing display headlines",()=>{
  expect(publicHeadline("Geomacro finds Policy update — India")).toBe("Policy update; India");
 });
});

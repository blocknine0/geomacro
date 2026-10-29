import {describe,expect,it} from "vitest";
import {buildQueryBoundNewsDesk,questionNewsFocus,type NewsDeskSignal} from "./query-bound-news-desk";

const at="2026-10-29T08:45:00.000Z";
const macro:NewsDeskSignal={
  id:"macro-0123abcd",category:"macro",topic:"policy rates",published_at:at,
  what_changed:"A central bank published a new monetary-policy statement with the decision unchanged.",
  why_it_matters:"The release may change how traders assess financing conditions; no exchange-rate move is established.",
};
const mineral:NewsDeskSignal={
  id:"rare_earth-0123abcd",category:"rare_earth",topic:"critical minerals",published_at:at,
  what_changed:"A government published an update on its domestic critical-minerals processing programme.",
  why_it_matters:"The update provides processing-policy context, not verified production capacity or metal-price impact.",
};
const geopolitical:NewsDeskSignal={
  id:"geopolitics-0123abcd",category:"geopolitics",topic:"trade restrictions",published_at:at,
  what_changed:"A trade-policy notice described a new export-review procedure.",
  why_it_matters:"The procedure is relevant to cross-border compliance; shipment disruption has not been confirmed.",
};

describe("one original news -> user and machine query-bound newsroom JSON",()=>{
 it("selects a direct grounded response for impact, trading, watch and news queries",()=>{
  const what=buildQueryBoundNewsDesk({question:"What happened today?",country_iso3:"USA",signals:[macro]})!;
  const why=buildQueryBoundNewsDesk({question:"Why does the policy update matter?",country_iso3:"USA",signals:[macro]})!;
  const trade=buildQueryBoundNewsDesk({question:"What is the trading impact on FX?",country_iso3:"USA",signals:[macro]})!;
  const watch=buildQueryBoundNewsDesk({question:"What next should we monitor?",country_iso3:"USA",signals:[macro]})!;
  expect(what.direct_answer).toBe(macro.what_changed);
  expect(why.direct_answer).toBe(macro.why_it_matters);
  expect(trade.direct_answer).toBe(macro.why_it_matters);
  expect(watch.direct_answer).toContain("No confirmed follow-up date is established for policy rates.");
  expect(watch.direct_answer).toContain(macro.what_changed);
  expect(new Set([what.focus,why.focus,trade.focus,watch.focus]).size).toBe(4);
  for(const result of [what,why,trade,watch]){
    expect(result.unique_story_count).toBe(1);
    expect(result.stories[0]).toMatchObject({
      category:"macro",requested_country_iso3:"USA",
      original_page_date_verified:true,
      independent_same_event_corroboration_verified:false,
      affected_country_independently_verified:false,
      market_direction:null,price_impact:null,next_confirmed_event_at:null,
    });
    expect(result.chargeable).toBe(false);
    expect(result.commercial_rights_verified).toBe(false);
    expect(result.execution_authorized).toBe(false);
    expect(JSON.stringify(result)).not.toContain("https://");
  }
 });
 it("uses one news item, not a canned generic three-category paragraph",()=>{
  const m=buildQueryBoundNewsDesk({country_iso3:"IND",signals:[macro]})!;
  const r=buildQueryBoundNewsDesk({country_iso3:"IND",signals:[mineral]})!;
  const g=buildQueryBoundNewsDesk({country_iso3:"IND",signals:[geopolitical]})!;
  expect([m.direct_answer,r.direct_answer,g.direct_answer]).toEqual([
    macro.what_changed,mineral.what_changed,geopolitical.what_changed]);
  expect(new Set([m.direct_answer,r.direct_answer,g.direct_answer]).size).toBe(3);
  expect(m.stories[0].category).toBe("macro");
  expect(r.stories[0].category).toBe("rare_earth");
  expect(g.stories[0].category).toBe("geopolitics");
 });
 it("suppresses exact repeat news/analysis across categories, retains distinct evidence",()=>{
  const duplicate={...macro,id:"geopolitics-88888888",category:"geopolitics" as const};
  const view=buildQueryBoundNewsDesk({
    country_iso3:"CAN",question:"Latest news",
    signals:[macro,duplicate,mineral,geopolitical],
  })!;
  expect(view.stories.map(x=>x.category)).toEqual(["macro","rare_earth","geopolitics"]);
  expect(view.unique_story_count).toBe(3);
  expect(view.stories[0].potential_implication).toBe(macro.why_it_matters);
 });
 it("does not copy upstream URLs or malicious derived text into outputs",()=>{
  expect(buildQueryBoundNewsDesk({country_iso3:"USA",signals:[
    {...macro,what_changed:"View https://hidden.example/secret upstream item"},
  ]})).toBeNull();
  expect(buildQueryBoundNewsDesk({country_iso3:"USA",signals:[
    {...macro,why_it_matters:"<private>raw text</private>"},
  ]})).toBeNull();
  expect(buildQueryBoundNewsDesk({country_iso3:"USA",signals:[]})).toBeNull();
  expect(buildQueryBoundNewsDesk({country_iso3:"NOT-ISO3",signals:[macro]})).toBeNull();
 });
 it("preserves original date-only release without fabricating an intraday event timestamp",()=>{
  const day={...mineral,date_precision:"day" as const,published_at:"2026-10-29"};
  const result=buildQueryBoundNewsDesk({country_iso3:"IND",signals:[day]})!;
  expect(result.stories[0]).toMatchObject({
    original_published_at:null,original_publication_day:"2026-10-29",
    date_precision:"day",original_page_date_verified:true,
  });
  const sentinel=buildQueryBoundNewsDesk({country_iso3:"IND",signals:[{
    ...day,published_at:"2026-10-29T00:00:00.000Z",
  }]})!;
  expect(sentinel.stories[0].original_published_at).toBeNull();
  expect(buildQueryBoundNewsDesk({country_iso3:"IND",signals:[{
    ...day,published_at:"2026-10-29T09:30:00.000Z",
  }]})).toBeNull();
 });
 it("keeps Bengali and Hindi queries in intent routing without fake translation",()=>{
  expect(questionNewsFocus("এর প্রভাব কী?")).toBe("why_it_matters");
  expect(questionNewsFocus("বাজারে কী প্রভাব?")).toBe("market_relevance");
  expect(questionNewsFocus("आगे क्या होगा?")).toBe("what_to_watch");
 });
});

import {describe,it,expect} from "vitest";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
import {dedupeIntelligenceStories} from "./intelligence-news-dedupe";
const sample=(id:string,category:StatelessIntelligenceSignal["category"],
 title:string,when="2026-10-25T08:00:00.000Z",status:StatelessIntelligenceSignal["status"]="official_release_observed_unscored"):StatelessIntelligenceSignal=>({
 id,category,title:"Geomacro finds "+title,
 what_changed:"The source reported: "+title+". This does not establish market effects.",
 why_it_matters:"This is relevant to monitoring policy developments, without any assumed effects.",
 topic:category==="macro"?"monetary policy":category==="geopolitics"?"geopolitical security":"critical-mineral inputs",
 geography:null,development_type:status==="osint_feed_observed_unverified"?"unverified OSINT feed observation":"official update",
 published_at:when,date_precision:"exact",observed_release_count:1,
 sources_credited:status==="osint_feed_observed_unverified"?["Monitored feed: news.google.com"]:[],
 status,same_event_corrob_verified:false,severity:null
});
describe("three-domain intelligence event dedup lock",()=>{
 it("shows an official original once when duplicated by OSINT and another feed, even with different ids",()=>{
  const headline="Federal Reserve announced new monetary policy measures";
  const official=sample("macro-aaaaaaaa","macro",headline);
  const osint=sample("macro-bbbbbbbb","macro","Federal Reserve announced monetary policy measures",
    "2026-10-25T08:09:00.000Z","osint_feed_observed_unverified");
  const another=sample("macro-cccccccc","macro",headline,"2026-10-25T08:11:00.000Z");
  const out=dedupeIntelligenceStories([osint,another,official]);
  expect(out).toHaveLength(1);
  expect(out[0].id).toBe(another.id);
  expect(dedupeIntelligenceStories([...out,...out])).toEqual(out);
 });
 it("does not erase different announcements, changed numbers, regions or later dates",()=>{
  const cases=[
   sample("macro-aaaa1111","macro","Federal Reserve announced new policy rate of 4 percent"),
   sample("macro-bbbb2222","macro","Federal Reserve announced new policy rate of 5 percent"),
   sample("macro-cccc3333","macro","Federal Reserve proposed new policy rate of 4 percent"),
   sample("macro-dddd4444","macro","Federal Reserve announced new policy rate of 4 percent","2026-10-22T08:00:00.000Z"),
  ];
  expect(dedupeIntelligenceStories(cases)).toHaveLength(4);
 });
 it("shows a cross-domain event only once, in the category best matching the headline",()=>{
  const headline="Canada announced export controls on critical minerals";
  const rows=[
   sample("geopolitics-12345678","geopolitics",headline),
   sample("rare_earth-12345678","rare_earth",headline),
   sample("rare_earth-87654321","rare_earth",headline,"2026-10-25T08:03:00.000Z"),
  ];
  const result=dedupeIntelligenceStories(rows);
  expect(result).toHaveLength(1);
  expect(result[0].category).toBe("rare_earth");
 });
 it("keeps distinct stories whose only overlap is the issuer or general topic",()=>{
  const rows=[
   sample("geopolitics-aaaaaaaa","geopolitics","United Nations announced ceasefire monitoring agreement in Sudan"),
   sample("geopolitics-bbbbbbbb","geopolitics","United Nations announced sanctions against military officials in Sudan"),
  ];
  expect(dedupeIntelligenceStories(rows)).toHaveLength(2);
 });
 it("never changes the original story clock, score, content or retained source flags",()=>{
  const original=sample("rare_earth-aaaaaaaa","rare_earth","Canada announced a lithium processing project");
  const cloned={...original,id:"rare_earth-bbbbbbbb",status:"osint_feed_observed_unverified" as const,
   development_type:"unverified OSINT feed observation"};
  const result=dedupeIntelligenceStories([cloned,original]);
  expect(result).toEqual([original]);
  expect(original.severity).toBeNull();
  expect(original.published_at).toBe("2026-10-25T08:00:00.000Z");
 });
});

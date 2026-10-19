import {describe,it,expect} from "vitest";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
import {buildDerivedNewsStructural} from "../lib/derived-news-structural-bridge";
import {checkedDerivedNews} from "../lib/public-derived-news-client";
import {verifyDerivedStory,readDerivedStories}
  from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {publicSharedDerivedNewsFeed}
  from "../../workers/control-plane/src/shared-derived-news-feed.mjs";
import {findCardFromObservedRelease} from "../lib/find-card-v1";
import {readFileSync} from "node:fs";
import {collectSharedOfficialNews} from "../lib/ask-shared-derived-journal.server";
import {buildMaterialGriReviewFromDerivedD1}
  from "../../scripts/lib/material-gri-news-review.mjs";

const NOW=Date.parse("2026-10-19T16:40:00.000Z");
const PUBLISHED="2026-10-19T14:00:00.000Z";
const cats=["geopolitics","macro","rare_earth"] as const;
const entry=(category:typeof cats[number],i:number,title:string)=>
 ({category,sourceId:"publisher_lane_"+i,articleUrl:"https://gov.example.net/approved/original/"+i,
   publishedAt:PUBLISHED,title,credit:null});
const feed=(rows:unknown[])=>({ok:true,
 schema:"geomacro.website-derived-news-feed.v1",original_release_delay_minutes:15,
 retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
 page_offset:0,page_size:250,has_more:false,next_offset:null,signals:rows});
function env(rows:any[]){
 return {DB:{prepare:()=>({bind:()=>({
   all:async()=>({results:rows.map(r=>({story_json:JSON.stringify(r)}))})
 })})}};
}
describe("low-friction genuine original-source candidate tier for Predge",()=>{
 it("retains one dated original per category even without a keyword and never invents topical materiality",()=>{
   const titles=["New director appointed to advisory panel",
     "Agency staff training schedule updated","Publisher announces museum day"];
   const signals=cats.map((cat,i)=>deriveStatelessSignals([entry(cat,i,titles[i])],NOW)[0]);
   expect(signals.every(Boolean)).toBe(true);
   for(let i=0;i<cats.length;i++){
     const s=signals[i];
     expect(s.status).toBe("official_feed_candidate_unscored");
     expect(s.category).toBe(cats[i]);
     expect(s.development_type).toBe("unclassified publisher update");
     expect(s.geography).toBeNull();
     expect(verifyDerivedStory(s,NOW)).toBe(true);
     expect(findCardFromObservedRelease(s,NOW)).toBeNull();
     expect(JSON.stringify(s)).not.toContain(titles[i]);
     expect(JSON.stringify(s)).not.toContain("gov.example.net");
   }
   const structural=buildDerivedNewsStructural(signals,NOW);
   expect(structural).toHaveLength(3);
   for(const row of structural){
     expect(row.confidence_state).toBe("DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED");
     expect(row.topical_match_verified).toBe(false);
     expect(row.qualifying_topic_release_verified).toBe(false);
     expect(row.independent_same_event_verified).toBe(false);
     expect(row.commercial_derived_rights_verified).toBe(false);
     expect(row.chargeable).toBe(false);
   }
 });
 it("keeps topic matched original as classified and dedupes repeated original URL",()=>{
   const a=entry("macro",0,"Official monetary policy statement published");
   const rows=deriveStatelessSignals([a,{...a,sourceId:"other_lane"}],NOW);
   expect(rows).toHaveLength(1);
   expect(rows[0].status).toBe("official_release_observed_unscored");
   expect(buildDerivedNewsStructural(rows,NOW)[0].qualifying_topic_release_verified).toBe(true);
 });
 it("preserves original time, 15min delay, and never turns an offsite or future title into D1 news",()=>{
   const early=deriveStatelessSignals([entry("macro",1,"New office appointment")],NOW);
   expect(early).toHaveLength(1);
   expect(deriveStatelessSignals([entry("macro",1,"New office appointment")],Date.parse(PUBLISHED)+1000)).toEqual([]);
   expect(deriveStatelessSignals([{...entry("macro",1,"New office appointment"),
      articleUrl:"http://not-allowed.example.com/"}],NOW)).toEqual([]);
   expect(deriveStatelessSignals([{...entry("macro",1,"New office appointment"),
      publishedAt:"2026-10-20T16:00:00Z"}],NOW)).toEqual([]);
   const rows=checkedDerivedNews(feed(early),NOW);
   expect(rows).toHaveLength(1);
   expect(checkedDerivedNews(feed([{...early[0],published_at:"2026-10-19T16:39:00.000Z"}]),NOW)).toEqual([]);
   expect(checkedDerivedNews(feed([{...early[0],status:"official_feed_candidate_unscored",topic:"monetary policy"}]),NOW)).toEqual([]);
 });
 it("website D1 journal IDs and Predge direct feed match, but candidates never enter signed GRI review",async()=>{
   const candidates=cats.map((c,i)=>deriveStatelessSignals([
     entry(c,i,"Updated agency program and staff reporting")],NOW)[0]);
   const worker=await publicSharedDerivedNewsFeed(env(candidates),new URLSearchParams(),NOW);
   expect(worker.status).toBe(200);
   const data=await worker.json();
   expect(data.items.map((s:any)=>s.id).sort()).toEqual(candidates.map(x=>x.id).sort());
   for(const category of cats){
     expect(data.availability_by_category[category].status)
       .toBe("UNCLASSIFIED_DATED_SOURCE_CANDIDATES_ONLY");
     expect(data.availability_by_category[category].unclassified_source_candidates_72h).toBe(1);
     expect(data.counts[category]).toBe(1);
   }
   expect(data.partner_api_payment_required).toBe(false);
   expect(data.partner_resale_or_commercial_redistribution_authorized).toBe(false);
   const ask=await collectSharedOfficialNews(cats,{now:NOW,
     readJournal:async()=>candidates,
     readLive:async()=>({signals:candidates})});
   expect(ask.signals).toEqual([]);
   const queue=buildMaterialGriReviewFromDerivedD1(feed(candidates),NOW);
   expect(queue.categories.every((x:any)=>x.candidates_count===0)).toBe(true);
   expect(data.raw_upstream_delivered).toBe(false);
   // Website presentation stays locked; public candidate title still says unclassified.
   const html=readFileSync("workers/control-plane/src/website-derived-intelligence.mjs","utf8");
   expect(html).toContain("SOURCE CANDIDATE · TOPIC UNVERIFIED");
 });
});

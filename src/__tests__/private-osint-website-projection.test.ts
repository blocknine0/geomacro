import {describe,expect,it} from "vitest";
import {readDerivedStories} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {checkedDerivedNews} from "@/lib/public-derived-news-client";
import {isConcretePublicIntelligence} from "@/lib/intelligence-concrete-publication";

const now=Date.parse("2026-10-25T12:00:00.000Z");
const sourceItems={
 geopolitics:{title:"Geomacro finds Maritime Transit & Freight · Reported Policy or Operating Action — Red Sea Maritime Corridor",
  what_changed:"Unverified feed observation: Yemen Ministry of Transport introduced Red Sea tanker transit controls.",
  why_it_matters:"Risk: reported policy or operating action affecting maritime transit & freight in Red Sea Maritime Corridor. Effect: vessel transit, port access and cargo insurance planning may need review for Red Sea Maritime Corridor if the report is confirmed. Price channel to monitor: freight and marine insurance rates. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.",
  topic:"Maritime Transit & Freight",geography:"Red Sea Maritime Corridor"},
 macro:{title:"Geomacro finds Monetary Policy & FX Liquidity · Reported Policy or Operating Action — Japan",
  what_changed:"Unverified feed observation: Bank of Japan announced a change to its policy rate guidance for Japan.",
  why_it_matters:"Risk: reported policy or operating action affecting monetary policy & fx liquidity in Japan. Effect: import settlement, funding costs and local-currency hedging may need review for Japan if the report is confirmed. Price channel to monitor: USD/JPY. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.",
  topic:"Monetary Policy & FX Liquidity",geography:"Japan"},
 rare_earth:{title:"Geomacro finds Copper Supply & Processing · Approval or Authorization — Canada",
  what_changed:"Unverified feed observation: Canada's Ministry of Mines approved a copper processing project.",
  why_it_matters:"Risk: approval or authorization affecting copper supply & processing in Canada. Effect: buyers and processors may need to recheck copper supply & processing delivery timing, eligible suppliers and conversion capacity linked to Canada if the report is confirmed. Price channel to monitor: COMEX copper benchmark; concentrate treatment charges. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.",
  topic:"Copper Supply & Processing",geography:"Canada"},
} as const;

describe("private OSINT public Intelligence projection",()=>{
 it("renders concrete source-neutral findings across all three categories with one bounded D1 read",async()=>{
  for(const [category,item] of Object.entries(sourceItems)){
   let reads=0;
   const raw={id:category+"-abcdef12",category,
    title:item.title,what_changed:item.what_changed,
    why_it_matters:item.why_it_matters,topic:item.topic,
    geography:item.geography,development_type:"unverified OSINT feed observation",
    published_at:"2026-10-25T11:40:00.000Z",date_precision:"exact",observed_release_count:1,
    sources_credited:["Monitored feed: private-publisher.example"],
    status:"osint_feed_observed_unverified",same_event_corrob_verified:false,severity:null};
   const env:any={DB:{}};
   env.DB.prepare=()=>({bind:()=>({all:async()=>{
    reads++;
    return {results:[{story_json:JSON.stringify(raw),first_seen_at:"2026-10-25T11:41:00.000Z"}]};
   }})});
   const response=await readDerivedStories(env,now,0,0,false);
   expect(response.status).toBe(200);
   const doc=await response.json() as Record<string,any>;
   expect(reads).toBe(1);
   expect(doc.signals).toHaveLength(1);
   expect(JSON.stringify(doc)).not.toMatch(/private-publisher\.example/u);
   expect(doc.signals[0].sources_credited).toEqual([]);
   const browser=checkedDerivedNews({...doc,original_release_delay_minutes:0,
    retention_days:3,retention_hours:72,delivery_scope:"free_website_only"},now);
   expect(browser).toHaveLength(1);
   expect(browser[0].status).toBe("osint_feed_observed_unverified");
   expect(browser[0].sources_credited).toEqual([]);
   expect(isConcretePublicIntelligence(browser[0])).toBe(true);
  }
 });
});

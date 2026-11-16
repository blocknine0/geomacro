import {describe,expect,it} from "vitest";
import {readDerivedStories} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {checkedDerivedNews} from "@/lib/public-derived-news-client";
import {isConcretePublicIntelligence} from "@/lib/intelligence-concrete-publication";
import {projectSourceNeutralOsintSignal} from "../../scripts/lib/derived-news-readback-policy.mjs";

const now=Date.parse("2026-10-25T12:00:00.000Z");
const sourceItems={
 geopolitics:{title:"Secret publisher headline: sanctions announced in a named country",topic:"sanctions and trade restrictions",country:"United States",iso:"USA"},
 macro:{title:"Bank source title: new inflation figures and official response",topic:"inflation and prices",country:"Canada",iso:"CAN"},
 rare_earth:{title:"Industry source headline: lithium exports interrupted at a port",topic:"critical-mineral inputs",country:"Chile",iso:"CHL"},
} as const;

describe("private OSINT public Intelligence projection",()=>{
 it("renders all three categories as concrete source-neutral briefs with one bounded D1 read",async()=>{
  for(const [category,item] of Object.entries(sourceItems)){
   let reads=0;
   const projection=projectSourceNeutralOsintSignal({id:category+"-abcdef12",category,
    title:item.title,what_changed:"A dated source observation is classified.",
    why_it_matters:"Structured source-neutral exposure.",topic:item.topic,
    geography:item.country,country_iso3:item.iso,corridor:null,event_direction:"tightening",
    development_type:"unverified OSINT feed observation",
    published_at:"2026-10-25T11:40:00.000Z",date_precision:"exact",observed_release_count:1,
    sources_credited:["Monitored feed: private-publisher.example"],
    status:"osint_feed_observed_unverified",same_event_corrob_verified:false,severity:null})!;
   const raw={...projection,sources_credited:["Monitored feed: private-publisher.example"]};
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
   expect(JSON.stringify(doc)).not.toMatch(/Secret publisher headline|private-publisher\.example|sanctions announced|inflation figures|exports interrupted/u);
   expect(doc.signals[0].sources_credited).toEqual([]);
   expect(doc.signals[0].title).toMatch(/^GeoMacro (Geopolitics|Macro\/FX|Critical Minerals) Brief · .+ — .+ \([A-Z]{3}\)$/u);
   expect(doc.signals[0].what_changed).toContain("GeoMacro's dated observation classifies");
   expect(doc.signals[0].why_it_matters).toMatch(/Risk: .* → Downstream effect: .* → Price impact channel: .*Action Posture:/u);
   const browser=checkedDerivedNews({...doc,original_release_delay_minutes:0,
    retention_days:3,retention_hours:72,delivery_scope:"free_website_only"},now);
   expect(browser).toHaveLength(1);
   expect(browser[0].status).toBe("osint_feed_observed_unverified");
   expect(browser[0].sources_credited).toEqual([]);
   expect(isConcretePublicIntelligence(browser[0])).toBe(true);
  }
 });
});

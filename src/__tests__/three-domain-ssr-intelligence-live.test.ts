import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {StatelessLiveDesk} from "@/components/intelligence/stateless-live-desk";
import type {StatelessCategory,StatelessIntelligenceSignal} from "@/lib/stateless-intelligence-model";
import {intelligenceActorHeadline} from "@/lib/public-intelligence-actor-copy";
import type {StatelessIntelligenceResult} from "@/lib/stateless-public-intelligence.server";

const now="2026-10-13T10:00:00.000Z";
const headline:Record<StatelessCategory,string>={
  geopolitics:"Geomacro finds United Nations announced new sanctions on cross-border trade",
  macro:"Geomacro finds Federal Reserve announced new monetary policy measures",
  rare_earth:"Geomacro finds European Union announced new critical mineral export controls",
};
const signal=(category:StatelessCategory):StatelessIntelligenceSignal=>({
  id:category+"-test9876",category,title:headline[category],
  why_it_matters:"Official first-party publication may affect monitored exposures but cannot imply an outcome or a scored risk.",
  topic:category==="geopolitics"?"sanctions and trade restrictions":
    category==="macro"?"monetary policy":"critical-mineral inputs",
  what_changed:headline[category].replace(/^Geomacro finds /u,"")+". The action was announced in the dated original release.",
  geography:null,development_type:"official update",published_at:"2026-10-12T09:00:00.000Z",
  date_precision:"exact",observed_release_count:1,sources_credited:[],
  status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null,
});
const state=(category:StatelessCategory):StatelessIntelligenceResult=>({
  schema:"geomacro.website-stateless-intelligence.v1",category,checked_at:now,
  website_release_cutoff:"2026-10-13T09:45:00.000Z",
  earliest_original:"2026-09-13T10:00:00.000Z",
  releases_examined:1,feed_count:2,healthy_feed_count:2,
  current_24h_count:0,last_7d_count:1,last_30d_count:1,
  status:"official_observations_available",signals:[signal(category)],
  persistent_storage:false,publisher_title_redistributed:false,
  signed_risk_score_generated:false,independent_same_event_verification:false,
});

describe("first HTML paint shows actual original-dated Intelligence from all three domains",()=>{
  it("renders each selected category on the first HTML paint with exactly three category toggles",()=>{
    const geo=state("geopolitics"),macro=state("macro"),minerals=state("rare_earth");
    for(const category of ["geopolitics","macro","rare_earth"] as const){
      const html=renderToStaticMarkup(createElement(StatelessLiveDesk,{
        initial:geo,initialFeeds:{geopolitics:geo,macro,rare_earth:minerals},
        initialJournal:[],initialView:category,
      }));
      expect(html).toContain(intelligenceActorHeadline(signal(category)));
      for(const other of ["geopolitics","macro","rare_earth"] as const)
        if(other!==category)expect(html).not.toContain(intelligenceActorHeadline(signal(other)));
      const categories = html.slice(html.indexOf('aria-label="Intelligence category"'), html.indexOf("</section>"));
      expect((categories.match(/aria-pressed=/gu)??[]).length).toBe(3);
      expect((categories.match(/aria-pressed="true"/gu)??[]).length).toBe(1);
      expect(html).not.toContain("All findings</button>");
      expect(html).not.toContain('aria-label="Filter Intelligence by country"');
      expect(html).not.toContain("Loading ");
      expect(html).toContain("Earlier news · Dated");
      expect(html).not.toContain("current signed risk");
    }
  });
  it("defaults legacy all URLs to Geopolitics and never fabricates an unavailable selected category",()=>{
    const geo=state("geopolitics");
    const html=renderToStaticMarkup(createElement(StatelessLiveDesk,{
      initial:geo,initialFeeds:{geopolitics:geo},initialJournal:[],initialView:"all",
    }));
    expect(html).toContain(intelligenceActorHeadline(signal("geopolitics")));
    expect(html).not.toContain(intelligenceActorHeadline(signal("macro")));
    const missing=renderToStaticMarkup(createElement(StatelessLiveDesk,{
      initial:geo,initialFeeds:{geopolitics:geo},initialJournal:[],initialView:"macro",
    }));
    expect(missing).not.toContain(intelligenceActorHeadline(signal("geopolitics")));
    expect(missing).not.toContain(intelligenceActorHeadline(signal("macro")));
    expect(missing).toContain("Loading Macro Economics");
  });
  it("shows the supplied country and actual derived change without em dashes",()=>{
    const geo=state("geopolitics");
    geo.signals[0]={...geo.signals[0],geography:"Sudan",
      title:"Geomacro finds United Nations announced new ceasefire talks concerning Sudan",
      what_changed:"United Nations announced new ceasefire talks concerning Sudan — implementation remains unconfirmed."};
    const html=renderToStaticMarkup(createElement(StatelessLiveDesk,{
      initial:geo,initialFeeds:{geopolitics:geo},initialJournal:[],
    }));
    expect(html).toContain("Sudan");
    expect(html).not.toContain("Actor not verified:");
    expect(html).toContain("United Nations announced new ceasefire talks concerning Sudan; implementation remains unconfirmed.");
    expect(html).not.toContain("\u2014");
    expect(html).not.toContain("Official publisher issues");
  });
  it("forces first-paint routes to ask all three official source families in parallel",()=>{
    const route=readFileSync("src/routes/intelligence.tsx","utf8");
    const desk=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
    expect(route).toContain('const domains = ["geopolitics", "macro", "rare_earth"] as const');
    expect(route).toContain("const [geopolitics, macro, minerals, history] = await Promise.allSettled");
    expect(route).toContain("statelessFeeds:");
    expect(route).toContain("initialFeeds={loader.statelessFeeds}");
    expect(route).toContain("fetchDirectDerivedNews()");
    expect(route).not.toContain("history.value.signals");
    expect(desk).toContain("const missingAtSsr = DOMAINS.map(domain => domain.key)");
    expect(desk).toContain("if (missingAtSsr.length > 0) void refresh(missingAtSsr)");
    expect(desk).toContain("const EMPTY_FEEDS: FeedState = Object.freeze({})");
    for(const forbidden of ["sessionStorage","SUPABASE_DB_URL","settleCoinbase"])
      expect(desk).not.toContain(forbidden);
  });
});

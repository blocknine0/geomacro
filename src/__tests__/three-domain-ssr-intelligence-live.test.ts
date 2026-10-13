import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {StatelessLiveDesk} from "@/components/intelligence/stateless-live-desk";
import type {StatelessCategory,StatelessIntelligenceSignal} from "@/lib/stateless-intelligence-model";
import type {StatelessIntelligenceResult} from "@/lib/stateless-public-intelligence.server";

const now="2026-10-13T10:00:00.000Z";
const headline:Record<StatelessCategory,string>={
  geopolitics:"Geomacro finds security on UN Security Council activity",
  macro:"Geomacro finds official economic statistics on consumer prices",
  rare_earth:"Geomacro finds critical-minerals policy on rare-earth materials",
};
const signal=(category:StatelessCategory):StatelessIntelligenceSignal=>({
  id:category+"-test9876",category,title:headline[category],
  why_it_matters:"Official first-party publication may affect monitored exposures but cannot imply an outcome or a scored risk.",
  topic:"official release",what_changed:"An official publisher issued a dated release concerning the stated monitoring topic.",
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
  it("renders Macro/FX and Minerals without waiting for client JS hydration",()=>{
    const geo=state("geopolitics"),macro=state("macro"),minerals=state("rare_earth");
    const html=renderToStaticMarkup(createElement(StatelessLiveDesk,{
      initial:geo,initialFeeds:{geopolitics:geo,macro,rare_earth:minerals},
      initialJournal:[],
    }));
    for(const category of ["geopolitics","macro","rare_earth"] as const)
      expect(html).toContain(headline[category]);
    expect(html).toContain("Across all three domains");
    expect(html).not.toContain("Loading Macro / FX, Critical Minerals");
    expect(html).toContain("Earlier original releases");
    expect(html).not.toContain("current signed risk"); // no promotion
  });
  it("does not fabricate an unavailable category from a healthy unrelated issuer",()=>{
    const geo=state("geopolitics");
    const html=renderToStaticMarkup(createElement(StatelessLiveDesk,{
      initial:geo,initialFeeds:{geopolitics:geo},initialJournal:[],
    }));
    expect(html).toContain(headline.geopolitics);
    expect(html).not.toContain(headline.macro);
    expect(html).not.toContain(headline.rare_earth);
    expect(html).toContain("Loading Macro / FX, Critical Minerals");
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
    for(const forbidden of ["localStorage","sessionStorage","SUPABASE_DB_URL","settleCoinbase"])
      expect(desk).not.toContain(forbidden);
  });
});

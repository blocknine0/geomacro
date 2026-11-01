import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createMemoryHistory,createRootRoute,createRouter,RouterProvider} from "@tanstack/react-router";
import {describe,expect,it} from "vitest";
import {LiveIntelligenceShowcase} from "../components/home/live-intelligence-showcase";
import type {StatelessIntelligenceSignal} from "../lib/stateless-intelligence-model";

function official(category:StatelessIntelligenceSignal["category"],hoursAgo=3):StatelessIntelligenceSignal{
 const actor=category==="geopolitics"?"United Nations":
   category==="rare_earth"?"Canada":"Federal Reserve";
 const action=category==="geopolitics"?"announced new sanctions review in the Security Council":
   category==="rare_earth"?"announced investment in lithium refining capacity":
   "issued FOMC statement on interest rates";
 const id=category+"-1234abcd";
 return {
   id,category,title:"Geomacro finds "+actor+" "+action,
   what_changed:actor+" "+action+". This official release does not by itself verify the eventual market or operational outcome.",
   why_it_matters:"Official policy announcements can influence cross-border exposure, while implementation and real-world outcomes require independent confirmation.",
   topic:category==="geopolitics"?"foreign policy":category==="macro"?"monetary policy":"critical-minerals policy",
   geography:null,development_type:"official release",
   published_at:new Date(Date.now()-hoursAgo*3_600_000).toISOString(),
   date_precision:"exact",observed_release_count:1,
   sources_credited:[category==="geopolitics"?"United Nations":
     category==="rare_earth"?"Natural Resources Canada":"Federal Reserve Board"],
   status:"official_release_observed_unscored",
   same_event_corrob_verified:false,severity:null
 };
}
async function render(signals:StatelessIntelligenceSignal[]){
 const root=createRootRoute({component:()=>createElement(LiveIntelligenceShowcase,{
   initialDailyHighlights:signals,initialFindCards:[],
 })});
 const router=createRouter({routeTree:root,history:createMemoryHistory({initialEntries:["/"]}),isServer:true});
 await router.load();
 return renderToStaticMarkup(createElement(RouterProvider,{router}));
}
describe("daily official Geomacro Finds visibility",()=>{
 it("renders real original-dated attributed findings rather than an empty placeholder",async()=>{
  const s=official("macro");
  const html=await render([s]);
  expect(html).toContain("Federal Reserve");
  expect(html).toContain(`dateTime="${s.published_at}"`);
  expect(html).toContain("Source attribution: Federal Reserve Board");
  expect(html).toContain("What changed");
  expect(html).toContain("Why it matters");
  expect(html).not.toContain("No highlights to show right now.");
  expect(html).not.toContain("No eligible original-dated official highlights");
 });
 it("shows independent geopolitical, macro and mineral releases without repeating names",async()=>{
  const html=await render([official("geopolitics"),official("macro"),official("rare_earth")]);
  for(const label of ["Geopolitics","Macro / FX","Critical Minerals"]){
    expect(html).toContain(label);
  }
  expect((html.match(/Source attribution:/g)??[])).toHaveLength(3);
  expect(html).toContain('aria-label="Browse intelligence topics"');
 });
 it("does not promote unverified OSINT or anonymous originals and keeps quiet-day navigation",async()=>{
  const osint={...official("macro"),status:"osint_feed_observed_unverified" as const};
  const anonymous={...official("geopolitics"),title:"Geomacro finds an official publisher update"};
  const html=await render([osint,anonymous]);
  expect(html).not.toContain("Federal Reserve issued");
  expect(html).toContain("No eligible original-dated official highlights");
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-label="Browse intelligence topics"');
  expect(await render([])).toContain("Loading verified official findings");
 });
});

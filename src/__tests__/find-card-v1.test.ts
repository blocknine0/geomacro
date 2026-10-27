import {readFileSync} from "node:fs";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it,vi} from "vitest";
import {assertFindCardV1,isFindCardV1,findCardFromObservedRelease,
 type FindCardV1} from "../lib/find-card-v1";
import {publicFindCardsResponse} from "../lib/public-find-card-feed.server";
import {StatelessLiveDesk} from "../components/intelligence/stateless-live-desk";
import type {StatelessIntelligenceSignal} from "../lib/stateless-intelligence-model";
import type {StatelessIntelligenceResult} from "../lib/stateless-public-intelligence.server";

const NOW=Date.parse("2026-10-16T18:00:00.000Z");
const safe=(category:"geopolitics"|"macro"|"rare_earth"="macro",
 original="2026-10-16T16:00:00.000Z",precision:"exact"|"day"="exact",
):StatelessIntelligenceSignal=>({
 id:category+"-1234abcd",category,
 title:"Geomacro finds an official policy development concerning trade and monetary conditions",
 why_it_matters:"Official first-party releases may inform funding and cross-border conditions; specific outcomes remain unverified.",
 what_changed:"An official publisher released an original-dated policy statement about financing conditions.",
 topic:category==="macro"?"monetary policy":
       category==="rare_earth"?"critical-minerals policy":"foreign policy",
 geography:null,development_type:"official update",
 published_at:original,date_precision:precision,observed_release_count:1,
 sources_credited:[],status:"official_release_observed_unscored",
 same_event_corrob_verified:false,severity:null,
});
const feed=(signals:unknown[])=>({ok:true,schema:"geomacro.website-derived-news-feed.v1",
 original_release_delay_minutes:0,retention_days:3,retention_hours:72,delivery_scope:"free_website_only",signals});

describe("Geomacro Find Card v1—supplied exact public JSON Schema",()=>{
 it("bounds long headlines at a whole-word boundary and preserves the original date",()=>{
  const headline="United Nations called for dialogue and diplomacy concerning a detailed international policy announcement with further discussions expected later";
  const input={...safe("geopolitics"),title:"Geomacro finds "+headline,
    what_changed:"United Nations called for dialogue and diplomacy in its dated statement about international policy."};
  const card=findCardFromObservedRelease(input,NOW);
  expect(card).not.toBeNull();
  expect(card!.headline.length).toBeLessThanOrEqual(120);
  expect(card!.headline.endsWith("…")).toBe(true);
  expect(headline.startsWith(card!.headline.slice(0,-1)+" ")).toBe(true);
  expect(card!.published_at).toBe(input.published_at);
  expect(isFindCardV1(card)).toBe(true);
 });
 it("publishes the canonical 2020-12 schema, all required fields and five conditional rules",()=>{
  const s=JSON.parse(readFileSync("public/schemas/v1/find-card.json","utf8"));
  expect(s.$id).toBe("https://geomacro.live/schemas/v1/find-card.json");
  expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  expect(s.additionalProperties).toBe(false);
  expect(s.properties.severity.type).toBe("null");
  expect(s.required).not.toContain("severity");
  expect(s.required).toEqual(expect.arrayContaining([
   "schema","id","domain","published_at","date_precision","headline",
   "what_changed","facts","why_it_matters","watch_next","ladder",
   "evidence_directness","subjects","freshness","detail_state","extraction_confidence",
  ]));
  expect(s.properties.facts.items.additionalProperties).toBe(false);
  expect(s.properties.watch_next.additionalProperties).toBe(false);
  expect(s.properties.subjects.additionalProperties).toBe(false);
  expect(s.allOf).toHaveLength(5);
  expect(s.properties.freshness.enum).toEqual([
   "realtime","near_realtime","daily","weekly","monthly","quarterly","annual"]);
 });
 it.each(["geopolitics","macro","rare_earth"] as const)(
 "projects only an honest limited publisher observation for %s",domain=>{
  const input=safe(domain);
  input.title="Geomacro finds a SECRET UPSTREAM ORIGINAL TITLE THAT MUST NEVER LEAK";
  const card=findCardFromObservedRelease(input,NOW);
  expect(card).not.toBeNull();
  assertFindCardV1(card);
  expect(card!.domain).toBe(domain);
  expect(card!.headline).not.toContain("SECRET UPSTREAM");
  expect(card!.headline).toContain(input.topic);
  expect(card!.what_changed).toContain(input.topic);
  expect(JSON.stringify(card)).not.toContain("sources_credited");
  expect(JSON.stringify(card)).not.toContain("source_url");
  expect(card!.ladder).toBe("ANNOUNCED");
  expect(card!.detail_state).toBe("LIMITED");
  expect(card!.facts).toEqual([]);
  expect(card!.subjects.countries).toEqual([]);
  expect(card!.extraction_confidence).toBe(0);
  expect(card!.severity).toBeNull();
  expect(card!.evidence_directness).toBe("INDIRECT");
  expect(card!.watch_next.kind).toBe("follow_up_check");
 });
 it("never silently removes a legally required upstream attribution",()=>{
  const s=safe();
  s.sources_credited=["Open Government Licence v3.0 — attribution required"];
  expect(findCardFromObservedRelease(s,NOW)).toBeNull();
 });
 it("uses a calendar-day sentinel, not an asserted clock, and respects day-only embargo",()=>{
  const s=safe("rare_earth","2026-10-14","day");
  expect(findCardFromObservedRelease(s,Date.parse("2026-10-15T11:59:59Z"))).toBeNull();
  const card=findCardFromObservedRelease(s,Date.parse("2026-10-15T12:00:00Z"));
  expect(card?.published_at).toBe("2026-10-14T00:00:00.000Z");
  expect(card?.date_precision).toBe("day");
  expect(card?.freshness).toBe("daily");
  const invalid={...card,published_at:"2026-10-14T12:00:00.000Z"};
  expect(isFindCardV1(invalid)).toBe(false);
  expect(findCardFromObservedRelease({...s,published_at:"2026-02-30"},NOW)).toBeNull();
  expect(findCardFromObservedRelease(safe("macro","2026-10-16T18:00:01.000Z"),NOW)).toBeNull();
 });
 it("requires per-domain FULL facts, sane confidence, no unscored numeric severity, no URLs",()=>{
  const card=findCardFromObservedRelease(safe(),NOW)!;
  expect(isFindCardV1({...card,detail_state:"FULL"})).toBe(false);
  const kinds={macro:"indicator",rare_earth:"mineral",geopolitics:"actor"} as const;
  for(const domain of ["macro","rare_earth","geopolitics"] as const){
   const row={...card,domain,detail_state:"FULL",
    facts:[{kind:kinds[domain],label:"Verified item",value:"Recorded"}]};
   expect(isFindCardV1(row)).toBe(true);
   expect(isFindCardV1({...row,facts:[{kind:"action",label:"Action",value:"Recorded"}]})).toBe(false);
  }
  for(const changed of [
   {...card,source_url:"https://www.example.com/private"},
   {...card,severity:80},
   {...card,headline:"https://source.example.com/story"},
   {...card,detail_state:"LIMITED",extraction_confidence:0.51},
   {...card,detail_state:"LIMITED",facts:Array(4).fill({kind:"actor",label:"A",value:"B"})},
   {...card,ladder:"CORROBORATED",evidence_directness:"NONE"},
   {...card,watch_next:{...card.watch_next,source:"hidden"}},
   {...card,subjects:{...card.subjects,countries:["NON-ISO3"]}},
   {...card,action_class:"UNTRUSTED-TEXT"},
  ])expect(isFindCardV1(changed)).toBe(false);
 });
});

 it("locks OSINT findings to the exact existing Website Intelligence card presentation",()=>{
  const code=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
  // Both recency sections render the same Story component; OSINT verification status stays internal.
  expect(code).toContain("LOCKED PRESENTATION CONTRACT");
  expect(code.toLowerCase()).not.toContain("unscored");
  expect(code).not.toContain("Source-reported observation · Not independently verified");
  expect(code).toContain("function Story({ signal, saved, onSave }");
  expect(code.split("<Story key={signal.id} signal={signal}").length-1).toBe(2);
  expect(code).toContain("GEOMACRO ANALYSIS / Why it matters");
  expect(code).toContain("What changed");
  expect(code).not.toContain("function OsintStory");
  expect(code).not.toContain("OsintCard");
 });

describe("free public v1 Finds GET from existing D1 journal",()=>{
 it("projects bounded category-filtered no-funds cards without second fetch or original source",async()=>{
  const upstream=vi.fn(async()=>new Response(JSON.stringify(feed([
   safe("macro"),safe("rare_earth"),
   {...safe("geopolitics"),sources_credited:["Attribution required"]},
  ])),{status:200}));
  const request=new Request("https://geomacro.live/api/v1/finds?domain=macro");
  const resp=await publicFindCardsResponse(request,upstream as typeof fetch,NOW);
  expect(resp.status).toBe(200);
  const json=await resp.json();
  expect(json.schema).toBe("geomacro.find-card-feed.v1");
  expect(json.cards).toHaveLength(1);
  expect(json.cards[0].domain).toBe("macro");
  expect(json.cards[0].schema).toBe("geomacro.find.v1");
  expect(json.cards[0].severity).toBeNull();
  expect(json.chargeable).toBe(false);
  expect(json.scored).toBe(false);
  expect(json.independent_same_event_verified).toBe(false);
  expect(JSON.stringify(json)).not.toMatch(/(?:https:\/\/.*source|sources_credited)/u);
  expect(upstream).toHaveBeenCalledOnce();
 });
 it("rejects ambiguous query and fails closed on actual journal outage",async()=>{
  const upstream=vi.fn(async()=>new Response("unavailable",{status:503}));
  for(const query of ["?domain=all","?domain=macro&domain=rare_earth","?view=finds","?domain=macro&token=secret"]){
   const r=await publicFindCardsResponse(new Request("https://geomacro.live/api/v1/finds"+query),upstream as typeof fetch,NOW);
   expect(r.status).toBe(400);
  }
  expect(upstream).not.toHaveBeenCalled();
  const r=await publicFindCardsResponse(new Request("https://geomacro.live/api/v1/finds"),upstream as typeof fetch,NOW);
  expect(r.status).toBe(503);
  expect((await r.json()).cards).toEqual([]);
 });
 it("does not mark an unverified issuer as FULL or add zero-hour to website day label",()=>{
  const signal=safe("macro");
  const r:StatelessIntelligenceResult={
   schema:"geomacro.website-stateless-intelligence.v1",category:"macro",
   checked_at:new Date(NOW).toISOString(),website_release_cutoff:"2026-10-16T17:45:00.000Z",
   earliest_original:"2026-09-16T18:00:00.000Z",releases_examined:1,
   feed_count:1,healthy_feed_count:1,current_24h_count:1,last_7d_count:1,
   last_30d_count:1,status:"official_observations_available",
   signals:[signal],persistent_storage:false,publisher_title_redistributed:false,
   signed_risk_score_generated:false,independent_same_event_verification:false,
  };
  // Existing website legacy SSR fixtures may be older; check the view's
  // source-credit-preserving condition without making any paid GRO claim.
  const code=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
  expect(code).toContain("isConcretePublicIntelligence");
  expect(code).toContain('data-testid="geomacro-concrete-intelligence-card"');
  expect(code).not.toContain('card?.detail_state === "LIMITED"');
  expect(code).not.toContain("Specific details not captured");
  expect(code).not.toContain("signal.sources_credited");
  expect(findCardFromObservedRelease(signal,NOW)?.detail_state).toBe("LIMITED");
 });
});

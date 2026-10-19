import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {predgeResearchDerivedNewsFeed,PREDGE_RESEARCH_PILOT_END_UTC}
 from "../../workers/control-plane/src/predge-research-derived-news.mjs";
const NOW=Date.parse("2026-10-19T15:00:00Z");
const TOKEN="a".repeat(64);
const make=(query="")=>new Request("https://geomacro.example/v1/partner/predge/derived-structural-72h"+query,
 {headers:{authorization:"Bearer "+TOKEN}});
function signal(i:number){
 const c=["geopolitics","macro","rare_earth"][i%3];
 return {id:c+"-"+i.toString(16).padStart(8,"0"),category:c,
 title:"Geomacro finds updated official policy context in the relevant sector",
 what_changed:"A source-native official release reported a development in the sector.",
 why_it_matters:"The observed release may affect context, but outcomes are not verified.",
 topic:["foreign policy","monetary policy","rare-earth supply"][i%3],
 development_type:"policy update",geography:null,
 published_at:"2026-10-19T14:00:00.000Z",date_precision:"exact",
 observed_release_count:1,sources_credited:[],
 status:"official_release_observed_unscored",
 same_event_corrob_verified:false,severity:null};
}
const env=(rows:unknown[]=[])=>({PREDGE_RESEARCH_NEWS_TOKEN:TOKEN,
 DB:{prepare:()=>({bind:(_since:any,_first:any,offset:number)=>({
 all:async()=>({results:rows.slice(offset||0,(offset||0)+251).map(story=>({story_json:JSON.stringify(story)}))})
 })})}});
describe("one grant for all qualifying Predge research news, still no resale",()=>{
 it("is authenticated and returns exactly the same D1 IDs without per-item approvals",async()=>{
  const rows=Array.from({length:63},(_,i)=>signal(i));
  const response=await predgeResearchDerivedNewsFeed(make(),env(rows),NOW);
  expect(response.status).toBe(200);
  const data=await response.json();
  expect(data.items).toHaveLength(63);
  expect(data.items.map((s:any)=>s.id)).toEqual(rows.map(r=>(r as any).id).sort((a,b)=>a.localeCompare(b)));
  expect(data.counts).toEqual({geopolitics:21,macro:21,rare_earth:21});
  expect(data.journal_origin).toBe("SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE");
  expect(data.per_item_approval_ids_required).toBe(false);
  expect(data.per_item_partner_scope_receipts_required).toBe(false);
  expect(data.per_item_rights_review_receipts_required_for_research).toBe(false);
  expect(data.partner_delivery_scope).toBe("PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT");
  expect(data.partner_resale_or_commercial_redistribution_authorized).toBe(false);
  expect(data.execution_authorized).toBe(false);
  expect(data.commercial_rights_verified).toBe(false);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Authorization");
 });
 it("gates invalid/missing token, malformed key and missing config",async()=>{
  const e=env([signal(0)]);
  for(const req of [new Request(make().url),new Request(make().url,{headers:{authorization:"Bearer "+"f".repeat(64)}}),
    new Request(make().url,{headers:{authorization:"Bearer "+TOKEN+" extra"}})]){
   const r=await predgeResearchDerivedNewsFeed(req,e,NOW);
   expect(r.status).toBe(401);expect((await r.json()).items).toBeUndefined();
  }
  const none=await predgeResearchDerivedNewsFeed(make(),{...e,PREDGE_RESEARCH_NEWS_TOKEN:""},NOW);
  expect(none.status).toBe(503);
 });
 it("does not continue beyond the 90-day upper-bound window",async()=>{
  const r=await predgeResearchDerivedNewsFeed(make(),env(),Date.parse(PREDGE_RESEARCH_PILOT_END_UTC));
  expect(r.status).toBe(403);
 });
 it("stops credited upstream-required items, embargoed releases and unclassified false claims",async()=>{
  const rows=[signal(0),{...signal(1),sources_credited:["Publisher attribution required"]},
    {...signal(2),published_at:"2026-10-19T14:55:00.000Z"}];
  const r=await predgeResearchDerivedNewsFeed(make(),env(rows),NOW);
  expect(r.status).toBe(200);
  const data=await r.json();expect(data.items).toHaveLength(1);
  expect(data.items[0].id).toBe(signal(0).id);
  expect(data.source_credits_needing_attribution_still_withheld).toBe(true);
 });
 it("rejects query-token or item ID bypass while keeping category support",async()=>{
  for(const suffix of ["?token=aaa","?approved_item_ids=all","?domain=macro&wallet=usd"]){
   const r=await predgeResearchDerivedNewsFeed(make(suffix),env([signal(0)]),NOW);
   expect(r.status).toBe(400);
  }
  const r=await predgeResearchDerivedNewsFeed(make("?domain=macro"),env([signal(0),signal(1)]),NOW);
  const data=await r.json();
  expect(data.items).toHaveLength(1);expect(data.items[0].category).toBe("macro");
 });
 it("fails closed on D1 outage, never changes signed/purchase status",async()=>{
  const e={PREDGE_RESEARCH_NEWS_TOKEN:TOKEN,
   DB:{prepare:()=>({bind:()=>({all:async()=>{throw Error("D1 down")}})})}};
  const r=await predgeResearchDerivedNewsFeed(make(),e,NOW);
  expect(r.status).toBe(503);expect((await r.json()).chargeable).toBe(false);
 });
 it("route and auto-provisioning do not expose control-plane admin or x402 secret",()=>{
  const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
  const workflow=readFileSync(".github/workflows/deploy-control-plane-d1.yml","utf8");
  expect(index).toContain('"/v1/partner/predge/derived-structural-72h"');
  expect(index).toContain("predgeResearchDerivedNewsFeed(request,env)");
  expect(workflow).toContain("geomacro-predge-72h-research-only-v1");
  expect(workflow).toContain("secret put PREDGE_RESEARCH_NEWS_TOKEN");
  expect(workflow).toContain("secrets.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE");
  expect(workflow).toContain("PREDGE_RESEARCH_OVERRIDE_INVALID");
  expect(workflow).toContain("PREDGE_RESEARCH_ADMIN_TOKEN_REUSE_FORBIDDEN");
  expect(workflow).toContain("PREDGE_RESEARCH_ROOT_SECRET_REUSE_FORBIDDEN");
  expect(workflow).toContain("PREDGE_RESEARCH_DEDICATED_GRANT_MODE");
  expect(workflow).not.toContain("echo ${PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE}");
  expect(workflow).toContain("verify-predge-auth-research-delivery.mjs");
  expect(workflow).not.toContain("echo $PREDGE_RESEARCH_NEWS_TOKEN");
 });
});

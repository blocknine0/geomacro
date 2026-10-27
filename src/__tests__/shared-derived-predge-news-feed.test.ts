import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {publicSharedDerivedNewsFeed} from "../../workers/control-plane/src/shared-derived-news-feed.mjs";
import {buildDerivedNewsStructural} from "../lib/derived-news-structural-bridge";
const NOW=Date.parse("2026-10-19T10:00:00.000Z");
const domains=["geopolitics","macro","rare_earth"] as const;
function signal(i:number){
 const category=domains[i%3];
 return {id:category+"-"+i.toString(16).padStart(8,"0"),category,
  title:"Geomacro finds original official policy change in the observed sector",
  what_changed:"An official publisher released a new statement about a policy development in the observed sector.",
  why_it_matters:"This release may affect regional operating assumptions but actual consequences require independent confirmation.",
  topic:["foreign policy","monetary policy","rare-earth supply"][i%3],
  development_type:"policy update",geography:null,
  published_at:"2026-10-19T08:00:00.000Z",date_precision:"exact",observed_release_count:1,
  sources_credited:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null};
}
function env(rows:unknown[]){
 return {DB:{prepare:vi.fn((sql:string)=>({bind:(_since:string,_seen:string,offset=0)=>({
   all:async()=>({results:rows.slice(offset,offset+(sql.includes("LIMIT 601")?601:251)).map(story=>({story_json:JSON.stringify(story)}))}),
 })}))}};
}
describe("Predge shared D1 feed remains separate from Geomacro static public archive",()=>{
 it("keeps partner item parity while only the fastlane opts into Macro price evidence",async()=>{
  const rows=[signal(1)];
  const partnerEnv=env(rows),fastlaneEnv=env(rows);
  const partner=await(await publicSharedDerivedNewsFeed(partnerEnv,new URLSearchParams(),NOW,"attributed_research")).json();
  expect(partner.items).toEqual(buildDerivedNewsStructural(rows,NOW,"attributed_research"));
  const fastlane=await(await publicSharedDerivedNewsFeed(fastlaneEnv,new URLSearchParams(),NOW,"attributed_research",true)).json();
  const stateReads=(e:ReturnType<typeof env>)=>e.DB.prepare.mock.calls.filter(([sql])=>sql.includes("control_state")).length;
  expect(stateReads(fastlaneEnv)).toBe(stateReads(partnerEnv)+1);
  expect(fastlane.items[0]).toHaveProperty("macro_context");
  const {macro_context,...sameItem}=fastlane.items[0];
  const {macro_context:baseContext,...partnerItem}=partner.items[0];
  expect(sameItem).toEqual(partnerItem);
  expect(baseContext.price_reaction).toBeNull();
  expect(macro_context.event_id).toBe(partner.items[0].id);
  expect(macro_context.parent_category).toBe("macro");
  expect(readFileSync("workers/control-plane/src/index.mjs","utf8")).toContain('publicSharedDerivedNewsFeed(env,url.searchParams,Date.now(),"attributed_research",true)');
 });
 it("returns exactly the same stable structured records as existing canonical website API projector",async()=>{
  const signals=Array.from({length:520},(_,i)=>signal(i));
  const seeded=env(signals);
  const response=await publicSharedDerivedNewsFeed(seeded,new URLSearchParams(),NOW);
  expect(seeded.DB.prepare.mock.calls.filter(([sql])=>sql.includes("website_derived_intelligence"))).toHaveLength(1);
  expect(response.status).toBe(200);
  const data=await response.json();
  expect(data.items).toEqual(buildDerivedNewsStructural(signals,NOW));
  expect(data.items).toHaveLength(520);
  expect(new Set(data.items.map((r:any)=>r.id)).size).toBe(520);
  expect(data.counts).toEqual({geopolitics:174,macro:173,rare_earth:173});
  expect(data.journal_origin).toBe("SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE");
  expect(data.partner_resale_or_commercial_redistribution_authorized).toBe(false);
  expect(data.commercial_rights_verified).toBe(false);
  expect(data.raw_upstream_delivered).toBe(false);
  for(const d of domains)
   expect(data.availability_by_category[d].observed_derived_records_72h).toBe(data.counts[d]);
  expect(JSON.stringify(data)).not.toMatch(/source_url|raw_html|https?:\/\/|provider_id|publisher_name/i);
 });
 it("filters exact category without changing underlying IDs or other category counts",async()=>{
   const all=Array.from({length:54},(_,i)=>signal(i));
   const r=await publicSharedDerivedNewsFeed(env(all),new URLSearchParams("domain=rare_earth"),NOW);
   const d=await r.json();
   expect(d.items).toEqual(buildDerivedNewsStructural(all,NOW).filter(x=>x.category==="rare_earth"));
   expect(d.counts).toEqual({geopolitics:18,macro:18,rare_earth:18});
 });
 it("a quiet publisher creates an honest empty 3-category result",async()=>{
  const r=await publicSharedDerivedNewsFeed(env([]),new URLSearchParams(),NOW);
  const d=await r.json();
  expect(r.status).toBe(200);
  expect(d.items).toEqual([]);
  for(const c of domains)expect(d.availability_by_category[c].status).toBe("NO_QUALIFIED_RELEASE_IN_72H");
  expect(d.chargeable).toBe(false);
 });
 it("does not leak credited publisher content or premature unverified releases",async()=>{
  const bad=[{...signal(0),sources_credited:["Copyright attribution required"]},
    {...signal(1),published_at:"2026-10-19T10:01:00.000Z"},
    {...signal(2),published_at:"2026-10-19T11:00:00.000Z"}];
  const r=await publicSharedDerivedNewsFeed(env(bad),new URLSearchParams(),NOW);
  const d=await r.json();
  expect(d.items).toEqual([]);
 });
 it("rejects foreign query keys and fake customer preauthorizations",async()=>{
  for(const query of ["domain=other","domain=macro&domain=macro","wallet=private","domain=macro&role=admin"]){
   const result=await publicSharedDerivedNewsFeed(env([]),new URLSearchParams(query),NOW);
   expect(result.status).toBe(400);
  }
 });
 it("all D1 outages fail 503 rather than provide synthetic partner data",async()=>{
  const broken={DB:{prepare:()=>({bind:()=>({all:async()=>{throw Error("D1 unavailable")}})})}};
  const result=await publicSharedDerivedNewsFeed(broken,new URLSearchParams(),NOW);
  expect(result.status).toBe(503);
  expect((await result.json()).chargeable).toBe(false);
 });
 it("production Worker route and website link both reuse the same shared D1 journal",()=>{
   const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
   const website=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
   expect(index).toContain("/v1/public/derived-structural-72h");
   expect(index).toContain("publicSharedDerivedNewsFeed(env,url.searchParams)");
   expect(website).toContain("fetchPermanentDerivedNews()");
   expect(website).toContain("fetchDirectDerivedNews()");
   expect(website).not.toContain("fetchAllDerivedNews()");
   expect(website).not.toContain("getWebsiteDerivedNews");
   expect(website).toContain("isConcretePublicIntelligence");
 });
});

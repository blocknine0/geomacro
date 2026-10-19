import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {createHmac} from "node:crypto";
import {predgeAuthenticatedDerivedNews} from "../../workers/control-plane/src/predge-news-pilot.mjs";
import {CENTRAL_SECURITY_POLICIES} from "../../workers/control-plane/src/central-security-policies.mjs";
const NOW=Date.parse("2026-10-19T15:00:00Z");
const TOKEN=createHmac("sha256","fixture-root-very-long-private-do-not-use")
  .update("geomacro-predge-news-research-v1").digest("hex");
const CATS=["geopolitics","macro","rare_earth"];
const request=(opts:{token?:string;path?:string;method?:string}={})=>
  new Request("https://worker.example"+(opts.path??"/v1/partner/predge/derived-structural-72h"),{
    method:opts.method??"GET",
    headers:{Authorization:"Bearer "+(opts.token??TOKEN)}
  });
const row=(i:number)=>({
 id:CATS[i%3]+"-"+i.toString(16).padStart(8,"0"),category:CATS[i%3],
 title:"Geomacro finds official policy news observation in the monitored category",
 what_changed:"An official publisher issued a native-dated original policy update in its public release feed.",
 why_it_matters:"This release may affect regional operations, subject to further verification.",
 topic:["foreign policy","monetary policy","rare-earth supply"][i%3],
 development_type:"policy update",geography:null,
 published_at:"2026-10-19T13:00:00.000Z",date_precision:"exact",
 observed_release_count:1,sources_credited:[],
 status:"official_release_observed_unscored",
 same_event_corrob_verified:false,severity:null
});
function env(rows:any[],count=1){
 const calls:string[]=[];
 return {
  PREDGE_NEWS_PILOT_TOKEN:TOKEN,DB:{
   batch:vi.fn(async(statements:any[])=>{
     expect(statements).toHaveLength(2);
     return [{success:true,results:[{request_count:count}]},
       {success:true,results:[{request_count:count}]}];
   }),
   prepare:(sql:string)=>({bind:(...args:any[])=>{
     calls.push(sql);
     return {all:async()=>sql.includes("website_derived_intelligence")?
       {results:rows.slice(args[2],args[2]+251).map(x=>({story_json:JSON.stringify(x)}))}:
       {results:[]}};
   }})
  },calls
 };
}
describe("Predge authenticated full eligible 72h D1 research delivery",()=>{
 it("reuses all 3 category originals exactly without per-item approvals",async()=>{
   const d=env(Array.from({length:105},(_,i)=>row(i)));
   const r=await predgeAuthenticatedDerivedNews(request(),d,NOW);
   expect(r.status).toBe(200);const body=await r.json();
   expect(body.authenticated_partner_delivery).toBe(true);
   expect(body.individually_approved_item_ids_required).toBe(false);
   expect(body.per_record_manual_review_receipt_required).toBe(false);
   expect(body.items).toHaveLength(105);
   expect(body.counts).toEqual({geopolitics:35,macro:35,rare_earth:35});
   expect(body.items[0].original_published_at).toBe(row(0).published_at);
   expect(body.items.every((x:any)=>x.payable===false&&
     x.commercial_derived_rights_verified===false)).toBe(true);
   expect(body.raw_upstream_delivered).toBe(false);
   expect(body.downstream_commercial_redistribution_authorized).toBe(false);
   expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
   expect(d.DB.batch).toHaveBeenCalledTimes(1);
 });
 it("requires a dedicated partner token, never reuses privileged control-plane bearer",async()=>{
   const d=env([row(0)]);
   expect((await predgeAuthenticatedDerivedNews(request({token:"0".repeat(64)}),d,NOW)).status).toBe(401);
   expect((await predgeAuthenticatedDerivedNews(request(),{...d,PREDGE_NEWS_PILOT_TOKEN:""},NOW)).status).toBe(503);
   expect(d.DB.batch).not.toHaveBeenCalled();
 });
 it("requires D1 governor, 100 target / 500 cap, and retries after UTC-day rollover",async()=>{
   expect(CENTRAL_SECURITY_POLICIES.predge_news_pilot).toMatchObject({
      windowSeconds:86400,perClient:500,global:500,failClosed:true
   });
   const d=env([row(0)],501);
   const r=await predgeAuthenticatedDerivedNews(request(),d,NOW);
   expect(r.status).toBe(429);
   expect((await r.json()).error).toBe("PREDGE_PILOT_DAILY_LIMIT");
   expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
   expect(d.calls).toEqual([]);
 });
 it("never leaks privileged route, fake topic qualification or credited upstream into partner feed",async()=>{
   const candidates=[{...row(0),sources_credited:["Original publisher credit required"]},
     {...row(1),published_at:"2026-10-19T14:59:00.000Z"},
     {...row(2),status:"official_feed_candidate_unscored",topic:"minerals publisher candidate",
       development_type:"unclassified publisher update",geography:null}];
   const d=env(candidates);
   const r=await predgeAuthenticatedDerivedNews(request(),d,NOW);
   expect(r.status).toBe(200);
   const p=await r.json();
   expect(p.items.some((x:any)=>x.category==="geopolitics")).toBe(false);
   expect(p.items.some((x:any)=>x.category==="macro")).toBe(false);
   expect(p.items.find((x:any)=>x.category==="rare_earth")?.qualifying_topic_release_verified).toBe(false);
 });
 it("rejects query escalation and outage; no public fallback on protected route",async()=>{
   const d=env([row(0)]);
   for(const q of ["?approved=all","?domain=macro&admin=yes","?domain=macro&domain=macro"]){
     expect((await predgeAuthenticatedDerivedNews(request({path:"/v1/partner/predge/derived-structural-72h"+q}),d,NOW)).status).toBe(400);
   }
   expect(d.DB.batch).not.toHaveBeenCalled();
   const broken=env([row(0)]);
   broken.DB.batch=vi.fn(async()=>{throw Error("D1 down")});
   expect((await predgeAuthenticatedDerivedNews(request(),broken,NOW)).status).toBe(503);
 });
 it("production deployment derives a separate token and tests protected readback",()=>{
   const deploy=readFileSync(".github/workflows/deploy-control-plane-d1.yml","utf8");
   const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
   expect(index).toContain('"/v1/partner/predge/derived-structural-72h"');
   expect(deploy).toContain("geomacro-predge-news-research-v1");
   expect(deploy).toContain("secret put PREDGE_NEWS_PILOT_TOKEN");
   expect(deploy).toContain("Verify authenticated Predge pilot exact shared D1 news readback");
   expect(deploy).not.toContain("echo \"$PREDGE_NEWS_PILOT_TOKEN\"");
 });
});

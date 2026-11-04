import test from "node:test";
import assert from "node:assert/strict";
import {
 atomOriginalResearchCandidates,provisionalOfficialTitleSeverity,runOfficialResearch20m
} from "./research-gate-official-20m.mjs";

const time=new Date("2026-11-04T04:20:00.000Z");
const specs=[
 {source_id:"uk_fcdo_ogl_official_atom",category:"GEOPOLITICS",
  feed_url:"https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom"},
 {source_id:"uk_hmt_ogl_official_atom",category:"MACRO",
  feed_url:"https://www.gov.uk/government/organisations/hm-treasury.atom"},
 {source_id:"uk_dbt_ogl_minerals_atom",category:"CRITICAL_MINERALS",
  feed_url:"https://www.gov.uk/government/organisations/department-for-business-and-trade.atom"}
].map(s=>({...s,rights:"UK_OPEN_GOVERNMENT_LICENCE_V3_EXCEPT_THIRD_PARTY",
 private_research_only:true,telegram_content_license:false}));
const titles=[
 "Ukraine announces sanctions on designated entities",
 "Ukraine announces central bank rate reduction",
 "Ukraine announces lithium export ban"
];
const slugs=["ukraine-announces-sanctions-on-designated-entities",
 "ukraine-announces-central-bank-rate-reduction",
 "ukraine-announces-lithium-export-ban"];
const articles=slugs.map(x=>"https://www.gov.uk/government/news/"+x);
const stamp="2026-11-04T04:18:00.000Z";
const atom=(idx,published=stamp)=>{
 const e='<entry><title>'+titles[idx]+'</title><published>'+published+
 '</published><link rel="alternate" href="'+articles[idx]+'" /></entry>';
 return '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">'+e+'</feed>';
};
const mock=(url)=>{
 const text=String(url);
 const idx=specs.findIndex(s=>text===s.feed_url);
 if(idx>=0)return new Response(atom(idx),{status:200});
 const api=articles.findIndex(a=>text==="https://www.gov.uk/api/content"+new URL(a).pathname);
 if(api>=0)return Response.json({title:titles[api],base_path:new URL(articles[api]).pathname,
  document_type:"news_story",first_published_at:stamp});
 const page=articles.indexOf(text);
 if(page>=0)return new Response("<html><h1>"+titles[page]+"</h1></html>",{status:200});
 throw Error("unexpected external call");
};
test("three categories provisional severity and strict first party country attribution",()=>{
 assert.equal(provisionalOfficialTitleSeverity(titles[0],"geopolitics"),82);
 assert.equal(provisionalOfficialTitleSeverity(titles[1],"macro"),58);
 assert.equal(provisionalOfficialTitleSeverity(titles[2],"critical_minerals"),80);
 assert.equal(provisionalOfficialTitleSeverity("Could Ukraine announce sanctions?","geopolitics"),null);
 for(let i=0;i<3;i++){
  const candidates=atomOriginalResearchCandidates(atom(i),specs[i],time);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].country_code,"UKR");
  assert.equal(candidates[0].category,["geopolitics","macro","critical_minerals"][i]);
 }
});
test("native item time must be precise and recent, not feed updated or future",()=>{
 for(const invalid of ["2026-11-03T22:18:00Z","2026-11-04T05:18:00Z",
  "2026-11-04","not a date"]){
  assert.equal(atomOriginalResearchCandidates(atom(0,invalid),specs[0],time).length,0);
 }
 const noPublished=atom(0).replace("<published>"+stamp+"</published>",
  "<updated>"+stamp+"</updated>");
 assert.equal(atomOriginalResearchCandidates(noPublished,specs[0],time).length,0);
});
test("only fully verified first-party original pages produce direct private state events",async()=>{
 const events=[];
 const res=await runOfficialResearch20m({sources:specs,now:time,fetchImpl:mock,
  ingest:async event=>{events.push(event);return {
    state_changed:true,signed:event.severity>=70,
    commercial_eligible:false,execution_authorized:false
  }}});
 assert.equal(res.source_http_healthy,3);
 assert.equal(res.first_party_original_pages_verified,3);
 assert.equal(res.state_updated,3);
 assert.equal(res.signed_readback_verified,2);
 assert.equal(res.queue_writes,0);
 assert.equal(events.length,3);
 assert.ok(events.every(e=>e.research_use_permitted===true&&
   e.trusted_native_originals_verified===true&&e.commercial_eligible===false&&
   e.original_published_at===stamp&&e.confidence===60&&
   e.independent_originals===1&&/^[a-f0-9]{64}$/.test(e.evidence_sha256)));
});
test("publisher original mismatch, denied page and fabricated source get zero writes",async()=>{
 let writes=0;
 const mismatch=async url=>{
  if(String(url).includes("/api/content/"))
   return Response.json({base_path:new URL(articles[0]).pathname,
    title:titles[0],document_type:"news_story",first_published_at:"2026-11-03T04:18:00Z"});
  return mock(url);
 };
 const result=await runOfficialResearch20m({sources:specs,now:time,fetchImpl:mismatch,
  ingest:async()=>{writes++;throw Error("unexpected database write")}});
 assert.equal(writes,0);assert.equal(result.state_updated,0);
 const untrusted={...specs[0],feed_url:"https://evil.example/feed.atom"};
 assert.throws(()=>atomOriginalResearchCandidates(atom(0),untrusted,time),
   /RESEARCH_OFFICIAL_SOURCE_INVALID/);
});
test("no remote source, rights, commercial or market scoring proofs asserted by source count",async()=>{
 const unavailable=async()=>new Response("",{status:429});
 let writes=0;
 const result=await runOfficialResearch20m({sources:specs,now:time,
  fetchImpl:unavailable,ingest:async()=>{writes++}});
 assert.equal(writes,0);assert.equal(result.source_http_healthy,0);
 assert.equal(result.complete_195x3_coverage_verified,false);
 assert.equal(result.verified_event_truth,false);
 assert.equal(result.latency_under_10ms_verified,false);
});

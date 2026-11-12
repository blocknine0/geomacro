import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {HOT50_STREAM_TARGETS,HOT50_STREAM_CATEGORIES,planHot50StreamCells,
 projectHot50StreamCell,probeHot50GlobalSearch,runHot50AutonomousStreamTick}
 from "../../workers/control-plane/src/risk-stream-autonomous-hot50.mjs";
const now=Date.parse("2026-11-12T12:01:00Z"),at=new Date(now-1800000).toISOString();
const digest=s=>createHash("sha256").update(s).digest("hex");
const categories=["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"];
const roles={
 GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]
};
const sample=(category,source,role,root,atTime=at)=>({
 observation_id:digest(category+source),country_iso3:"USA",category,
 event_fingerprint:digest("one same real event "+category),
 source_id:source,source_role:role,publisher_root_domain:root,
 parent_media_entity:root.replaceAll(".","_"),published_at:atTime,
 original_verified:1,commercial_rights_approved:1,enabled:1,
 rights_expire_at:new Date(now+3600000).toISOString()
});
test("50 countries x 3 categories are complete, unique, rotating and bounded",()=>{
 assert.equal(HOT50_STREAM_TARGETS.length,150);
 assert.deepEqual(HOT50_STREAM_CATEGORIES,categories);
 assert.equal(new Set(HOT50_STREAM_TARGETS.map(x=>x.country_iso3)).size,50);
 assert.equal(new Set(HOT50_STREAM_TARGETS.map(x=>x.country_iso3+"|"+x.category)).size,150);
 const all=new Set();
 for(let i=0;i<75;i++)
  for(const x of planHot50StreamCells(now+i*60000))all.add(x.country_iso3+"|"+x.category);
 assert.equal(all.size,150);
 assert.throws(()=>planHot50StreamCells(now,11),/SCAN_PACE_INVALID/);
});
test("five discovery lanes and unsigned OSINT remain Basic research only",()=>{
 const t=HOT50_STREAM_TARGETS.find(x=>x.country_iso3==="USA"&&x.category==="GEOPOLITICS");
 const discovery=["canonical","private_osint","reusable_news","gdelt_cameo","website_intelligence"]
  .map((lane,i)=>({
   lane,country_iso3:"USA",category:"geopolitics",
   signal_id:digest(lane),source_clock_at:at
  }));
 const r=projectHot50StreamCell(t,{discovery},now);
 assert.equal(r.signal_count,5);
 assert.equal(r.basic_status,"BASIC_RESEARCH_AUTOPUBLISHED");
 assert.match(r.standard_status,/^HOLD_/);
 assert.equal(r.original_domains,0);
 assert.equal(r.qualified_for_automatic_commercial_release,false);
 assert.deepEqual(r.source_lanes,discovery.map(x=>x.lane).sort());
});
for(const category of categories)test(category+" pairing rejects independent domains without dual original role and same-event proof",()=>{
 const t={country_iso3:"USA",category};
 const [a,b]=roles[category];
 const left=sample(category,"official-"+category,a,"official.example.org");
 const right=sample(category,"regional-"+category,b,"regional.example.net");
 const signed=[{gro_id:digest("gro"+category),country_iso3:"USA",category,
  event_fingerprint:left.event_fingerprint,expires_at:new Date(now+3600000).toISOString()}];
 const positive=projectHot50StreamCell(t,{evidence:[left,right],signed},now);
 assert.equal(positive.original_same_event_pair,true);
 assert.equal(positive.standard_status,"SIGNED_INTERNAL_GRO_AVAILABLE");
 assert.equal(positive.qualified_for_automatic_commercial_release,false);
 const notSame=projectHot50StreamCell(t,{evidence:[left,{
  ...right,event_fingerprint:digest("different event")}],signed},now);
 assert.equal(notSame.original_same_event_pair,false);
 assert.match(notSame.standard_status,/^HOLD_/);
 const unlicensed=projectHot50StreamCell(t,{evidence:[left,{
  ...right,original_verified:0,commercial_rights_approved:0}],signed},now);
 assert.equal(unlicensed.original_same_event_pair,false);
 const publisherCopy=projectHot50StreamCell(t,{evidence:[left,{
  ...right,parent_media_entity:left.parent_media_entity}],signed},now);
 assert.equal(publisherCopy.original_same_event_pair,false);
 const late=projectHot50StreamCell(t,{evidence:[left,{
  ...right,published_at:new Date(now+49*3600000).toISOString()}],signed},now);
 assert.equal(late.original_same_event_pair,false);
});
test("Google global search saves only hashes, publisher domains and clocks; never text or license",async()=>{
 const target={country_iso3:"USA",category:"MACRO_FX",name:"United States"};
 const xml=`<?xml version="1.0"?><rss><channel><item>
 <title>Sample fictional central bank rate decision signal</title>
 <link>https://news.google.com/rss/articles/CBMiTest123</link>
 <pubDate>Thu, 12 Nov 2026 11:45:00 GMT</pubDate>
 <source url="https://www.example.org">Example Publisher</source>
 </item></channel></rss>`;
 const r=await probeHot50GlobalSearch(target,{now,fetcher:async(_url,opts)=>{
  assert.equal(Object.hasOwn(opts,"cache"),false);
  assert.equal(opts.redirect,"manual");
  assert(new URL(_url).searchParams.get("q").includes("when:2d"));
  return new Response(xml,{status:200,headers:{"content-type":"application/rss+xml"}});
 }});
 assert.equal(r.status,"SEARCH_INDEX_LEADS_FOUND");
 assert.equal(r.leads.length,1);
 assert.equal(r.leads[0].publisher_root_domain,"example.org");
 const serialized=JSON.stringify(r);
 assert.equal(serialized.includes("Sample fictional"),false);
 assert.equal(serialized.includes("original_publisher_text"),false);
 assert.equal(r.originals_verified,0);
 assert.equal(r.commercial_rights_verified,false);
});
test("rate-limited search holds, protected defaults cannot query D1",async()=>{
 const target={country_iso3:"USA",category:"GEOPOLITICS",name:"United States"};
 const r=await probeHot50GlobalSearch(target,{now,fetcher:async()=>new Response("",{status:429})});
 assert.equal(r.status,"SEARCH_RATE_LIMITED");
 assert.equal(r.leads.length,0);
 let touched=0;
 const env={RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"0",
  DB:{prepare(){touched++;throw Error("D1_TOUCHED")}}};
 assert.equal((await runHot50AutonomousStreamTick(env)).status,
  "HOLD_AUTONOMOUS_STREAM_DISABLED");
 assert.equal(touched,0);
});
test("full tick batches metadata-only discoveries and independently readbacks Basic",async()=>{
 const cell=planHot50StreamCells(now,1)[0];
 const state=new Map(),seen=[];let transientReads=0,transientWrites=0;
 const empty={results:[]};
 const db={prepare(sql){return {sql,bind(...args){this.args=args;return this},
  async all(){if(transientReads++===0)throw Error("D1 503 transient");return empty},
  async first(){return state.get(cell.country_iso3+"|"+cell.category)||null}
 }} ,async batch(statements){
  if(transientWrites++===0)throw Error("D1 503 transient");
  for(const statement of statements){
   seen.push(statement.sql);
   if(statement.sql.includes("risk_stream_hot50_cell_snapshots(")){
    const a=statement.args;
    state.set(a[0]+"|"+a[1],{signal_count:a[3],basic_status:a[7],
     standard_status:a[8],last_search_status:a[11],
     original_publisher_text_included:0,commercial_release_authorized:0});
   }
  }
  return statements.map(()=>({success:true}));
 }};
 const env={DB:db,RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1",
  RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  RISK_GATE_COUNTRY_SCOPE:"HOT50"};
 const receipt=await runHot50AutonomousStreamTick(env,{now,perTick:1,
  fetcher:async()=>new Response("",{status:429})});
 assert.equal(receipt.status,"HOT50_RESEARCH_TICK_D1_READBACK_PASS");
 assert.equal(receipt.cells_checked,1);
 assert.equal(receipt.global_search_probes,1);
 assert.equal(receipt.basic_research_cells,0);
 assert(seen.some(x=>x.includes("risk_stream_hot50_cell_snapshots")));
 assert.equal(state.get(cell.country_iso3+"|"+cell.category).last_search_status,
  "SEARCH_RATE_LIMITED");
 assert.equal(receipt.commercial_release_unchanged,true);
 assert.equal(transientWrites,2);
 assert(transientReads>=2);
});

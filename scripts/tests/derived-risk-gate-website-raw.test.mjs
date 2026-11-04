import {test} from "node:test";
import assert from "node:assert/strict";
import {handleDerivedRiskGateDiscovery,DERIVED_DISCOVERY_BRIDGE_SCHEMA,
 DERIVED_DISCOVERY_LANES}
 from "../../workers/control-plane/src/derived-risk-gate-discovery-bridge.mjs";
import {verifyDerivedStory}
 from "../../workers/control-plane/src/website-derived-intelligence.mjs";

const NOW=Date.parse("2026-11-04T16:20:00.000Z");
const native=new Date(NOW-20*60000).toISOString();
const seen=new Date(NOW-10*60000).toISOString();
const categories=["geopolitics","macro","rare_earth"];
function story(category,index=1){
 const id=category+"-"+index.toString(16).padStart(8,"0");
 const topic={
  geopolitics:"geopolitical security",
  macro:"monetary policy",
  rare_earth:"critical-minerals policy",
 }[category];
 return {
  id,category,
  title:"Geomacro finds an official source released an update for "+category,
  what_changed:"An official source published a new observation with an original issue date.",
  why_it_matters:"This release may affect analyst monitoring and requires independent event verification.",
  topic,geography:"United States",
  development_type:"official release",
  published_at:native,date_precision:"exact",
  observed_release_count:1,sources_credited:[],
  status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null,
 };
}
function stored(s){
 return {id:s.id,category:s.category,published_at:s.published_at,
  date_precision:s.date_precision,story_json:JSON.stringify(s),
  first_seen_at:seen};
}
class D1 {
 constructor(rows=[]){
  this.journal=new Map(rows.map(r=>[r.id,r]));
  this.websiteSignals=new Map();this.cursor=null;this.queries=[];
 }
 prepare(sql){
  const state={sql,args:[]},db=this;
  const bound={
   _state:state,
   async first(){
    if(sql.includes("FROM derived_risk_gate_website_raw_cursor"))
     return db.cursor;
    if(sql.includes("FROM derived_risk_gate_website_raw_signals WHERE signal_id=?"))
     return db.websiteSignals.get(state.args[0])??null;
    if(sql.includes("FROM website_derived_intelligence WHERE id=?"))
     return db.journal.get(state.args[0])??null;
    if(sql.includes("SELECT EXISTS(SELECT 1 FROM derived_risk_gate_all_discovery_signals"))
     return {stale:Number([...db.websiteSignals.values()]
      .some(x=>x.first_seen_at<state.args[0]))};
    throw Error("unexpected first "+sql);
   },
   async run(){
    if(sql.includes("DELETE FROM derived_risk_gate_website_raw_signals")){
     for(const [id,row] of db.websiteSignals)
      if(row.first_seen_at<state.args[0])db.websiteSignals.delete(id);
     return {success:true};
    }
    if(sql.includes("DELETE FROM derived_risk_gate_discovery_signals"))
     return {success:true};
    throw Error("unexpected run");
   },
   async all(){
    if(sql.includes("FROM derived_risk_gate_website_raw_signals WHERE signal_id IN")){
     const ids=new Set(JSON.parse(state.args[0]).map(x=>x[0]));
     return {results:[...db.websiteSignals.values()]
      .filter(r=>ids.has(r.signal_id))};
    }
    if(sql.includes("FROM derived_risk_gate_all_discovery_signals")){
     const [from,offset]=state.args;
     return {results:[...db.websiteSignals.values()].filter(r=>r.first_seen_at>=from)
      .sort((a,b)=>b.first_seen_at.localeCompare(a.first_seen_at)||
       b.signal_id.localeCompare(a.signal_id)).slice(offset,offset+101)};
    }
    if(sql.includes("FROM website_derived_intelligence")&&
       sql.includes("WHERE id IN")){
     const ids=new Set(JSON.parse(state.args[0]));
     return {results:[...db.journal.values()].filter(r=>ids.has(r.id))};
    }
    if(sql.includes("FROM website_derived_intelligence")&&
       sql.includes("ORDER BY first_seen_at ASC,id ASC")){
     const [nativeCutoff,firstCutoff,until,cursorAt,,cursorId]=state.args;
     return {results:[...db.journal.values()].filter(r=>
       r.published_at>=nativeCutoff&&
       r.first_seen_at>=firstCutoff&&r.first_seen_at<=until&&
       (r.first_seen_at>cursorAt||
        r.first_seen_at===cursorAt&&r.id>cursorId))
      .sort((a,b)=>a.first_seen_at.localeCompare(b.first_seen_at)||
       a.id.localeCompare(b.id)).slice(0,101)};
    }
    throw Error("unexpected all "+sql);
   },
  };
  return {bind(...args){state.args=args;return bound;},
   async first(){return bound.first()},async all(){return bound.all()}};
 }
 async batch(statements){
  for(const stmt of statements){
   const {sql,args}=stmt._state;
   if(sql.includes("INSERT INTO derived_risk_gate_website_raw_signals")){
    const now=args[1],entries=JSON.parse(args[2]);
    for(const x of entries){
     const prior=this.websiteSignals.get(x[0]);
     if(prior&&prior.source_sha256===x[5])continue;
     this.websiteSignals.set(x[0],{
      signal_id:x[0],website_story_id:x[1],category:x[2],
      country_iso3:null,source_clock_at:x[3],
      first_seen_at:x[4],source_sha256:x[5],
      rights_state:"UNVERIFIED_SOURCE_RIGHTS",
      review_status:"HOLD_SOURCE_ACCESS_OR_EXPRESSION",
      updated_at:now,
     });
    }
   }else if(sql.includes("INSERT INTO derived_risk_gate_website_raw_cursor")){
    this.cursor={cursor_at:args[0],cursor_story_id:args[1]};
   }else throw Error("unexpected batch "+sql);
  }
  return statements.map(()=>({success:true}));
 }
}
const url=(q="")=>"https://workers.example/v1/internal/risk-gate/derived-discovery"+q;
const get=(db,q,now=NOW)=>handleDerivedRiskGateDiscovery(new Request(url(q)),{DB:db},now);
const post=(db,body,now=NOW)=>handleDerivedRiskGateDiscovery(
 new Request(url(),{method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body)}),{DB:db},now);
const ack=p=>({
 schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,
 lane:"website_intelligence",page_sha256:p.page_sha256,
 checked_at:p.checked_at,next_cursor:p.next_cursor,
 reviewed:p.records.map(r=>({
  original_ref:r.original_ref,status:"HOLD_SOURCE_ACCESS_OR_EXPRESSION",
  commercialEligible:false,
 })),
});

test("Website Intelligence three-domain existing journal is indexed as raw input, not article text",async()=>{
 const news=categories.map(c=>story(c));
 assert(news.every(s=>verifyDerivedStory(s,NOW)));
 const db=new D1(news.map(stored));
 assert(DERIVED_DISCOVERY_LANES.includes("website_intelligence"));
 const r=await get(db,"?lane=website_intelligence");
 assert.equal(r.status,200);
 const p=await r.json();
 assert.equal(p.records.length,3);
 assert.equal(p.raw_input_source,"CANONICAL_WEBSITE_D1_STORY_JSON_REFERENCE");
 assert.equal(p.source_payload_copied_to_new_table,false);
 assert.equal(p.commercialEligible,false);
 assert.equal(p.paidDeliveryAuthorized,false);
 assert.equal(p.original_text_included,false);
 assert.deepEqual(new Set(p.records.map(x=>x.category)),new Set(categories));
 for(const x of p.records){
  assert.match(x.original_ref,/^[a-f0-9]{64}$/);
  assert.match(x.source_sha,/^[a-f0-9]{64}$/);
  assert.equal(x.country_iso3,null);
  assert.equal(x.observed_clock,native);
 }
 const clean=JSON.stringify(p);
 assert(!clean.includes(news[0].title));
 assert(!clean.includes(news[0].what_changed));
 const res=await post(db,ack(p));
 assert.equal(res.status,200);
 const reply=await res.json();
 assert.equal(reply.d1_atomic_readback_verified,true);
 assert.equal(reply.admitted,3);
 assert.equal(reply.original_journal_unchanged,true);
 assert.equal(db.websiteSignals.size,3);
 assert.deepEqual([...db.journal.values()],news.map(stored));
 const pending=await (await get(db,"?view=pending")).json();
 assert.equal(pending.records.length,3);
 assert(pending.records.every(x=>x.lane==="website_intelligence"));
 assert(!JSON.stringify(pending).includes(news[0].title));
 const src=await get(db,"?view=website_raw&signal_id="+p.records[0].original_ref);
 assert.equal(src.status,200);
 const raw=await src.json();
 assert.equal(raw.raw_website_intelligence.id,p.records[0].website_story_id);
 assert.equal(raw.commercialEligible,false);
 assert.equal(raw.original_article_redistributed,false);
 assert.equal(db.queries.some(x=>x.includes("original_article_html")),false);
});

test("recheck content revisions with immutable native and first-seen clock, without duplicate signal",async()=>{
 const old=story("macro");
 const db=new D1([stored(old)]);
 let p=await (await get(db,"?lane=website_intelligence")).json();
 assert.equal((await post(db,ack(p))).status,200);
 const signal=p.records[0].original_ref,sha=p.records[0].source_sha;
 const revised={...old,why_it_matters:
  "The newly observed official release now warrants additional macroeconomic monitoring and further verification."};
 db.journal.set(old.id,stored(revised));
 p=await (await get(db,"?lane=website_intelligence")).json();
 assert.equal(p.records.length,1);
 assert.notEqual(p.records[0].source_sha,sha);
 const stale=await get(db,"?view=website_raw&signal_id="+signal);
 assert.equal(stale.status,409);
 assert.equal((await post(db,ack(p))).status,200);
 assert.equal(db.websiteSignals.size,1);
 assert.equal(db.websiteSignals.get(signal).source_sha256,p.records[0].source_sha);
 const raw=await (await get(db,"?view=website_raw&signal_id="+signal)).json();
 assert.equal(raw.raw_website_intelligence.why_it_matters,revised.why_it_matters);
 assert.equal(raw.first_ingested_at,seen);
 assert.equal(raw.source_published_at,native);
});

test("fenced stale, forged promoted and missing original inputs fail closed",async()=>{
 const db=new D1([stored(story("geopolitics"))]);
 const p=await (await get(db,"?lane=website_intelligence")).json();
 assert.equal((await post(db,{...ack(p),page_sha256:"a".repeat(64)})).status,409);
 const grant=ack(p);grant.reviewed[0].commercialEligible=true;
 assert.equal((await post(db,grant)).status,400);
 assert.equal(db.websiteSignals.size,0);
 const bad=stored(story("rare_earth"));
 bad.story_json="<upstream article html>";
 db.journal.set(bad.id,bad);
 assert.equal((await get(db,"?lane=website_intelligence")).status,503);
 db.journal.delete(bad.id);
 assert.equal((await post(db,ack(p))).status,200);
 const signal=p.records[0].original_ref;
 db.journal.delete(p.records[0].website_story_id);
 assert.equal((await get(db,"?view=website_raw&signal_id="+signal)).status,410);
});

test("100-row keyset and restart preserve at-most-600 website records",async()=>{
 const news=Array.from({length:104},(_,i)=>stored(story(categories[i%3],i+1)));
 const db=new D1(news);
 const page1=await (await get(db,"?lane=website_intelligence")).json();
 assert.equal(page1.records.length,100);
 assert.equal(page1.has_more,true);
 assert.equal((await post(db,ack(page1))).status,200);
 const page2=await (await get(db,"?lane=website_intelligence")).json();
 assert.equal(page2.records.length,4);
 assert.equal(page2.has_more,false);
 assert.equal((await post(db,ack(page2))).status,200);
 assert.equal(db.websiteSignals.size,104);
 const reread=await (await get(db,"?lane=website_intelligence")).json();
 assert.equal(reread.records.length,100);
 assert.equal((await post(db,ack(reread))).status,200);
 assert.equal(db.websiteSignals.size,104);
 assert.equal(db.queries.some(q=>q.includes("LIMIT 601")),false);
});

test("72h protected prune removes only old derived signal refs, never website journal",async()=>{
 const old=stored(story("macro"));
 const db=new D1([old]);
 db.websiteSignals.set("a".repeat(64),{
  signal_id:"a".repeat(64),website_story_id:old.id,
  category:"macro",country_iso3:null,source_clock_at:native,
  first_seen_at:new Date(NOW-80*3600000).toISOString(),
  source_sha256:"a".repeat(64),
  rights_state:"UNVERIFIED_SOURCE_RIGHTS",
  review_status:"HOLD_SOURCE_ACCESS_OR_EXPRESSION",
 });
 const r=await post(db,{
  schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,operation:"PRUNE_DISCOVERY_72H",
 });
 assert.equal(r.status,200);
 assert.equal(db.websiteSignals.size,0);
 assert.equal(db.journal.size,1);
});

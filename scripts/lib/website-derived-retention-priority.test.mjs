import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {publishDerivedStories} from "../../workers/control-plane/src/website-derived-intelligence.mjs";

test("actual SQLite D1 pruning retains older actor/action OSINT over 600 newer generic candidates",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE website_derived_intelligence (id TEXT PRIMARY KEY,category TEXT NOT NULL,published_at TEXT NOT NULL,date_precision TEXT NOT NULL,story_json TEXT NOT NULL,first_seen_at TEXT NOT NULL)");
  const now=Date.parse("2026-10-25T12:00:00.000Z");
  const inserted=new Date(now).toISOString();
  const put=db.prepare("INSERT INTO website_derived_intelligence VALUES(?,?,?,?,?,?)");
  for(let i=0;i<600;i++){
   const id="geopolitics-"+i.toString(16).padStart(8,"0");
   const date=new Date(now-i*60000).toISOString();
   put.run(id,"geopolitics",date,"exact",JSON.stringify({
     id,status:"official_feed_candidate_unscored",topic:"geopolitical publisher candidate",
     published_at:date
   }),inserted);
  }
  const concrete={
   id:"rare_earth-abcdef12",category:"rare_earth",topic:"Copper Supply & Processing",
   status:"osint_feed_observed_unverified",
   title:"Geomacro finds Copper Supply & Processing · Approval or Authorization — Chile",
   what_changed:"Unverified feed observation: Chile's Ministry of Mines approved a copper processing project.",
   why_it_matters:"Risk: approval affecting copper supply and processing in Chile. Effect: buyers and processors may need to recheck copper delivery timing, eligible suppliers and conversion capacity linked to Chile if the report is confirmed. Price channel to monitor: COMEX copper benchmark; concentrate treatment charges. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.",
   geography:"Chile",development_type:"unverified OSINT feed observation",
   published_at:new Date(now-36*3600000).toISOString(),date_precision:"exact",
   observed_release_count:1,sources_credited:[],same_event_corrob_verified:false,severity:null,
  };
  const older=new Date(now-36*3600000).toISOString();
  put.run(concrete.id,concrete.category,older,"exact",JSON.stringify(concrete),inserted);
  const wrapper={DB:{prepare(sql){
   const statement=db.prepare(sql);
   return {bind(...values){return {run:async()=>statement.run(...values)}} ,
     run:async()=>statement.run(),
     first:async()=>statement.get()??null};
  },batch:async()=>{throw Error("UNNEEDED_BATCH")}}};
  const r=await publishDerivedStories(wrapper,{
   schema:"geomacro.website-derived-news-batch.v1",signals:[]},now);
  assert.equal(r.status,200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM website_derived_intelligence").get().n,600);
  assert.ok(db.prepare("SELECT id FROM website_derived_intelligence WHERE id=?").get(concrete.id));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM website_derived_intelligence WHERE category='geopolitics'").get().n,599);
 }finally{db.close()}
});

test("actual SQLite priority does not alter original publication clocks or TTL",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE website_derived_intelligence (id TEXT PRIMARY KEY,category TEXT NOT NULL,published_at TEXT NOT NULL,date_precision TEXT NOT NULL,story_json TEXT NOT NULL,first_seen_at TEXT NOT NULL)");
  const now=Date.parse("2026-10-25T12:00:00.000Z"), old=new Date(now-74*3600000).toISOString();
  db.prepare("INSERT INTO website_derived_intelligence VALUES(?,?,?,?,?,?)").run(
   "macro-deadbeef","macro",old,"exact",
   JSON.stringify({status:"official_release_observed_unscored"}),old);
  const env={DB:{prepare(sql){
   const statement=db.prepare(sql);
   return {bind(...values){return {run:async()=>statement.run(...values)}} ,
     run:async()=>statement.run(),
     first:async()=>statement.get()??null};
  },batch:async()=>{throw Error("UNNEEDED_BATCH")}}};
  const r=await publishDerivedStories(env,{
    schema:"geomacro.website-derived-news-batch.v1",signals:[]},now);
  assert.equal(r.status,200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM website_derived_intelligence").get().n,0);
 }finally{db.close()}
});

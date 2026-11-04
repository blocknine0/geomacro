import {test} from "node:test";
import assert from "node:assert/strict";
import {handleDerivedRiskGateDiscovery,DERIVED_DISCOVERY_BRIDGE_SCHEMA,
 DERIVED_DISCOVERY_LANES} from "../../workers/control-plane/src/derived-risk-gate-discovery-bridge.mjs";

const NOW=Date.parse("2026-11-04T16:20:00.000Z");
const stamp=new Date(NOW-600000).toISOString();
const row=(n,category="geopolitics")=>({
 original_ref:n.repeat(64),source_sha:"f".repeat(64),
 first_seen_at:stamp,observed_clock:new Date(NOW-1200000).toISOString(),
 category,country_iso3:"USA",
 // An intentionally unexpected publisher field must never be projected:
 original_title:"SECRET_ARTICLE_TITLE_MUST_NOT_LEAK",
});
class FakeD1 {
 constructor(){
  this.sources=new Map(DERIVED_DISCOVERY_LANES.map(l=>[l,[]]));
  this.cursors=new Map();this.signals=new Map();this.queries=[];
 }
 prepare(sql){
  this.queries.push(sql);
  const db=this;
  const state={sql,args:[]};
  const bound={
   async first(){
    if(sql.includes("FROM derived_risk_gate_discovery_cursors"))
     return db.cursors.get(state.args[0])??null;
    return null;
   },
   async all(){
    if(sql.includes("FROM derived_risk_gate_discovery_signals WHERE signal_id IN")){
     const supplied=new Set(JSON.parse(state.args[0]).map(x=>x[0]));
     return {results:[...db.signals.values()].filter(x=>supplied.has(x.signal_id))};
    }
    if(sql.includes("FROM derived_risk_gate_discovery_signals ")){
     const cutoff=state.args[0];
     const offset=state.args[1];
     return {results:[...db.signals.values()]
      .filter(x=>x.first_seen_at>=cutoff)
      .sort((a,b)=>b.first_seen_at.localeCompare(a.first_seen_at)||
       b.signal_id.localeCompare(a.signal_id))
      .slice(offset,offset+101)};
    }
    const lane=sql.includes("FROM phase2h_private_raw_news")?"canonical":
     sql.includes("FROM private_osint_news_25h")?"private_osint":
     sql.includes("FROM reusable_news_items")?"reusable_news":
     sql.includes("FROM risk_gate_gdelt_event_index")?"gdelt_cameo":null;
    if(lane===null)throw Error("unexpected D1 read");
    const [cutoff,until,cursorAt,,cursorRef]=state.args;
    return {results:db.sources.get(lane).filter(x=>
     x.first_seen_at>=cutoff&&x.first_seen_at<=until&&
     (x.first_seen_at>cursorAt||
      x.first_seen_at===cursorAt&&x.original_ref>cursorRef))
     .sort((a,b)=>a.first_seen_at.localeCompare(b.first_seen_at)||
       a.original_ref.localeCompare(b.original_ref))
     .slice(0,101)};
   },
  };
  bound._state=state;
  return {bind(...args){state.args=args;return bound;}};
 }
 async batch(stmts){
  for(const stmt of stmts){
   const {sql,args}=stmt._state;
   if(sql.includes("INSERT OR IGNORE INTO derived_risk_gate_discovery_signals")){
    const items=JSON.parse(args[1]);
    for(const v of items){
     if(!this.signals.has(v[0]))this.signals.set(v[0],{
      signal_id:v[0],lane:v[1],original_ref:v[2],
      category:v[3],country_iso3:v[4],source_clock_at:v[5],
      first_seen_at:v[6],source_sha256:v[7],
      rights_state:"UNVERIFIED_SOURCE_RIGHTS",
      review_status:"HOLD_SOURCE_ACCESS_OR_EXPRESSION",
     });
    }
   }else if(sql.includes("INSERT INTO derived_risk_gate_discovery_cursors")){
    const [lane,cursor_at,cursor_ref]=args;
    this.cursors.set(lane,{cursor_at,cursor_ref});
   }else throw Error("unexpected batch write");
  }
  return stmts.map(()=>({success:true}));
 }
}
const url=(query="")=>"https://worker.example/v1/internal/risk-gate/derived-discovery"+query;
const get=(db,query,now=NOW)=>handleDerivedRiskGateDiscovery(
 new Request(url(query)),{DB:db},now);
const post=(db,body,now=NOW)=>handleDerivedRiskGateDiscovery(
 new Request(url(),{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),
 {DB:db},now);
const review=page=>page.records.map(x=>({
 original_ref:x.original_ref,status:"HOLD_SOURCE_ACCESS_OR_EXPRESSION",
 commercialEligible:false,
}));
const ack=page=>({
 schema:DERIVED_DISCOVERY_BRIDGE_SCHEMA,lane:page.lane,
 page_sha256:page.page_sha256,checked_at:page.checked_at,
 next_cursor:page.next_cursor,reviewed:review(page),
});

test("enumerates existing canonical, private OSINT, reusable and GDELT lanes",async()=>{
 assert.deepEqual(DERIVED_DISCOVERY_LANES,
  ["canonical","private_osint","reusable_news","gdelt_cameo"]);
 const db=new FakeD1();
 for(const [i,lane] of DERIVED_DISCOVERY_LANES.entries()){
  db.sources.set(lane,[row(String.fromCharCode(97+i),
   ["geopolitics","macro","rare_earth","geopolitics"][i])]);
  const r=await get(db,"?lane="+lane);
  assert.equal(r.status,200);
  const page=await r.json();
  assert.equal(page.records.length,1);
  assert.equal(page.rights_verified,false);
  assert.equal(page.commercialEligible,false);
  assert.equal(JSON.stringify(page).includes("SECRET_ARTICLE"),false);
  const receipt=await post(db,ack(page));
  assert.equal(receipt.status,200);
  const parsed=await receipt.json();
  assert.equal(parsed.admitted,1);
  assert.equal(parsed.d1_atomic_readback_verified,true);
  assert.equal(parsed.paidDeliveryAuthorized,false);
 }
 assert.equal(db.signals.size,4);
 for(const x of db.signals.values()){
  assert.equal(x.review_status,"HOLD_SOURCE_ACCESS_OR_EXPRESSION");
  assert.equal(x.rights_state,"UNVERIFIED_SOURCE_RIGHTS");
  assert.equal(x.source_sha256,"f".repeat(64));
 }
 const queue=await get(db,"?view=pending");
 assert.equal(queue.status,200);
 const doc=await queue.json();
 assert.equal(doc.records.length,4);
 assert.equal(JSON.stringify(doc).includes("SECRET_ARTICLE"),false);
 assert.equal(doc.commercialEligible,false);
 assert.equal(db.queries.some(q=>q.includes("raw_json")),false);
 assert.equal(db.queries.some(q=>q.includes("projection_json")),false);
});

test("rejects caller's attempt to commercial-promote a private OSINT signal",async()=>{
 const db=new FakeD1();
 db.sources.set("private_osint",[row("a")]);
 const p=await (await get(db,"?lane=private_osint")).json();
 const dangerous=ack(p);
 dangerous.reviewed[0].commercialEligible=true;
 const r=await post(db,dangerous);
 assert.equal(r.status,400);
 assert.equal(db.signals.size,0);
 assert.equal(db.cursors.size,0);
 const safe=await post(db,ack(p));
 assert.equal(safe.status,200);
 const replay=await post(db,ack(p));
 assert.equal(replay.status,409);
 assert.equal(db.signals.size,1);
});

test("keyset pages drain more than 100 without duplication",async()=>{
 const db=new FakeD1();
 db.sources.set("canonical",Array.from({length:104},(_,i)=>({
  ...row((i+1).toString(16).padStart(64,"0")[0]||"a"),
  original_ref:(i+1).toString(16).padStart(64,"0"),
 })));
 const first=await (await get(db,"?lane=canonical")).json();
 assert.equal(first.records.length,100);
 assert.equal(first.has_more,true);
 assert.equal((await post(db,ack(first))).status,200);
 const second=await (await get(db,"?lane=canonical")).json();
 assert.equal(second.records.length,4);
 assert.equal(second.has_more,false);
 assert.equal((await post(db,ack(second))).status,200);
 assert.equal(db.signals.size,104);
 const empty=await (await get(db,"?lane=canonical")).json();
 assert.equal(empty.records.length,0);
});

test("fails closed for invalid lane, stale proof and malformed ack",async()=>{
 const db=new FakeD1();
 db.sources.set("gdelt_cameo",[row("d")]);
 const invalid=await get(db,"?lane=private_osint&lane=gdelt_cameo");
 assert.equal(invalid.status,400);
 const r=await (await get(db,"?lane=gdelt_cameo")).json();
 assert.equal((await post(db,{...ack(r),page_sha256:"e".repeat(64)})).status,409);
 assert.equal((await post(db,{...ack(r),reviewed:[{
  original_ref:r.records[0].original_ref,status:"PENDING_CORROBORATION",
  commercialEligible:false,
 }]})).status,400);
 assert.equal(db.signals.size,0);
});

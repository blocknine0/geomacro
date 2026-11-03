import test from "node:test";
import assert from "node:assert/strict";
import {p0bReliefWebUkraine} from "../lib/p0b-reliefweb-ukraine.mjs";
const now=Date.parse("2026-11-03T16:00:00Z");
test("approved-appname ReliefWeb Ukraine V2 report metadata stays private research only",async()=>{
 let called;
 const fetchImpl=async(url,init)=>{
  called={url,init};
  return {status:200,redirected:false,headers:{get:()=> "application/json"},
   text:async()=>JSON.stringify({data:[{fields:{
    country:[{iso3:"UKR"}],title:"Ukraine announces sanctions on certain exports",
    url:"https://reliefweb.int/report/ukraine/ukraine-announces-sanctions",
    date:{created:"2026-11-03T15:00:00+00:00",
     original:"2026-11-03T14:00:00+00:00"}
   }}]})};
 };
 const r=await p0bReliefWebUkraine({appname:"geomacro.live",fetchImpl,now});
 assert.match(called.url,/appname=geomacro.live/u);
 assert.equal(called.init.method,"POST");
 assert.equal(JSON.parse(called.init.body).filter.value,"UKR");
 assert.equal(r.attempted,true);
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].original_published_at,"2026-11-03T14:00:00.000Z");
 assert.equal(r.items[0].paid_eligible,false);
 assert.equal(r.items[0].five_part.evidence_and_confidence.independent_event_verified,false);
 assert.equal(Object.hasOwn(r.items[0],"original_title"),false);
});
test("ReliefWeb Ukraine never treats unavailable approval, unrelated or stale records as evidence",async()=>{
 const blocked=await p0bReliefWebUkraine({appname:"",now});
 assert.equal(blocked.items.length,0);
 assert.equal(blocked.attempted,false);
 const fetchImpl=async()=>({status:200,redirected:false,headers:{get:()=> "application/json"},
  text:async()=>JSON.stringify({data:[{fields:{country:[{iso3:"CAN"}],
   title:"Ukraine announces sanctions on exports",
   url:"https://reliefweb.int/report/ukraine/stale",
   date:{created:"2026-10-29T12:00:00Z"}}}]})});
 const r=await p0bReliefWebUkraine({appname:"geomacro.live",fetchImpl,now});
 assert.equal(r.items.length,0);
});

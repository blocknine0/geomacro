import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {buildPrivateCorridorStructuredResearch}
 from "./corridor-derived-structured-research.mjs";
import {hashStructuredEvidence} from "./corridor-source-evidence-proof.mjs";
import {putPrivateCorridorResearch,getPrivateCorridorResearch,
 purgeExpiredPrivateCorridorResearch}
 from "../../workers/control-plane/src/corridor-private-research.mjs";
import {publishPrivateCorridorResearch}
 from "../ops/publish-private-corridor-research.mjs";
const TIME="2026-11-02T02:06:00.000Z",now=Date.parse(TIME);
function observation(at=TIME){
 const source_id="ecb_data",metric_id="ecb_usd_eur_spot",
 observation_period="2026-10-30",numeric_value=1.15321;
 return {id:createHash("sha256").update(
  [source_id,metric_id,observation_period,String(numeric_value)].join("\x1f")).digest("hex"),
  source_id,metric_id,observation_period,numeric_value,
  observed_at:at,source_native_publication_at:null,
  source_observation_is_not_live_event:true,corridor_ids:[],
  context_only:true,independently_verified_event:false,
  commercial_rights_verified:false,customer_delivery_enabled:false};
}
function report(at=TIME){
 return buildPrivateCorridorStructuredResearch({sourceReceipt:{
   checked_at:at,channel:"CORRIDOR_ONLY",news_candidate_count:2,
   official_reference_observations:[observation(at)]
 }});
}
function packet(derived=report(),at=TIME){
 const record=derived.structured_records[0],proof=derived.evidence_bundle.proofs[0];
 return {schema:"geomacro.corridor-private-research-d1-batch.v1",
  channel:"CORRIDOR_ONLY",checked_at:at,
  items:[{record,proof,record_sha256:hashStructuredEvidence(record)}],
  website_intelligence_enabled:false,commercial_rights_verified:false};
}
class MockD1{
 constructor(sourcePresent=true){
  const x=observation();this.sources=new Map();
  if(sourcePresent)this.sources.set(x.id,{
   reference_id:x.id,source_id:x.source_id,metric_id:x.metric_id,
   observation_period:x.observation_period,numeric_value:x.numeric_value,
   corridor_ids_json:"[]",last_observed_at:TIME
  });
  this.rows=new Map();
 }
 prepare(query){return {bind:(...args)=>({query,args,
  all:async()=>{
   if(query.includes("FROM corridor_official_reference_context")){
    const ids=new Set(args.slice(0,-1)),cutoff=args.at(-1);
    return {results:[...this.sources.values()].filter(r=>
     ids.has(r.reference_id)&&r.last_observed_at>=cutoff)};
   }
   if(query.includes("research_id IN")){
    const ids=new Set(args.slice(0,-1)),cutoff=args.at(-1);
    return {results:[...this.rows.values()].filter(r=>
     ids.has(r.research_id)&&r.last_verified_at>=cutoff)};
   }
   return {results:[...this.rows.values()].filter(r=>r.last_verified_at>=args[0])
    .sort((a,b)=>b.last_verified_at.localeCompare(a.last_verified_at))
    .slice(0,args[1])};
  },
  run:async()=>{
   if(query.startsWith("DELETE")){
    for(const [id,r] of this.rows)
     if(r.last_verified_at<args[0])this.rows.delete(id);
   }
   return {success:true};
  }
 })}}
 async batch(stmts){
  for(const p of stmts){
   assert.match(p.query,/INSERT INTO corridor_private_derived_research/u);
   const x=p.args;
   const old=this.rows.get(x[0]);
   if(old){
     if(old.source_reference_id===x[1]&&old.source_id===x[2]&&
        old.claim_sha256===x[3]){
       old.proof_sha256=x[4];old.analysis_sha256=x[5];
       old.structured_json=x[6];old.last_verified_at=x[8];
     }
   }
   else this.rows.set(x[0],{
    research_id:x[0],source_reference_id:x[1],source_id:x[2],
    claim_sha256:x[3],proof_sha256:x[4],analysis_sha256:x[5],
    structured_json:x[6],last_verified_at:x[8]
   });
  }
  return stmts.map(()=>({success:true}));
 }
}
test("source-fact identity and two-way D1 readback are required",async()=>{
 const DB=new MockD1();
 for(let i=0;i<2;i++){
  const reply=await putPrivateCorridorResearch({DB},packet(),now);
  assert.equal(reply.status,200);
  const body=await reply.json();
  assert.equal(body.submitted,1);
  assert.equal(body.verified,1);
  assert.equal(body.d1_source_fact_readback_verified,true);
  assert.equal(body.d1_derived_readback_verified,true);
  assert.equal(body.signed_gro_generated,false);
 }
 assert.equal(DB.rows.size,1);
 const read=await getPrivateCorridorResearch({DB},new URLSearchParams("limit=12"),now);
 assert.equal((await read.json()).count,1);
 assert.equal((await purgeExpiredPrivateCorridorResearch({DB},now+96*3600000)).ok,true);
 assert.equal(DB.rows.size,0);
});
test("updated analysis for same D1 source fact refreshes exact derived hash without duplicate rows",async()=>{
 const db=new MockD1(),first=packet();
 const firstResponse=await putPrivateCorridorResearch({DB:db},first,now);
 assert.equal(firstResponse.status,200);
 const oldHash=db.rows.values().next().value.analysis_sha256;
 const later="2026-11-02T02:11:00.000Z";
 for(const source of db.sources.values())source.last_observed_at=later;
 const updated=packet(report(later),later);
 assert.equal(updated.items[0].record.source_reference_id,
   first.items[0].record.source_reference_id);
 assert.notEqual(updated.items[0].record_sha256,first.items[0].record_sha256);
 const next=await putPrivateCorridorResearch({DB:db},updated,Date.parse(later));
 assert.equal(next.status,200);
 assert.equal((await next.json()).verified,1);
 assert.equal(db.rows.size,1);
 assert.notEqual(db.rows.values().next().value.analysis_sha256,oldHash);
 assert.equal(db.rows.values().next().value.analysis_sha256,
   updated.items[0].record_sha256);
});
test("hash alone cannot create evidence without independent source D1 row",async()=>{
 const res=await putPrivateCorridorResearch({DB:new MockD1(false)},packet(),now);
 assert.equal(res.status,409);
 assert.equal((await res.json()).error,"CORRIDOR_PRIVATE_SOURCE_D1_UNVERIFIED");
});
test("falsified structured analysis, report dates, commercial rights and proof are rejected",async()=>{
 const original=packet();
 const invalid=[
  item=>{item.record.market_relevance="Fake market price!";},
  item=>{item.proof.claim.numeric_value=91;},
  item=>{item.record.customer_delivery_authorized=true;},
  item=>{item.record.verified_news_event=true;},
  item=>{item.record.signed_gro=true;},
  item=>{item.record.evidence_and_confidence.independent_event_corroboration=true;},
  item=>{item.record.source_reference_id="a".repeat(64);},
  item=>{item.record.analysis_at="2026-10-01T00:00:00.000Z";},
  item=>{item.proof.proof_sha256="f".repeat(64);}
 ];
 for(const change of invalid){
  const copy=structuredClone(original);change(copy.items[0]);
  const reply=await putPrivateCorridorResearch({DB:new MockD1()},copy,now);
  assert.equal(reply.status,422);
  assert.equal((await reply.json()).chargeable,false);
 }
});
test("publisher uses bearer HMAC and independently validates D1 GET",async()=>{
 const root="Z".repeat(64),DB=new MockD1();
 const out=await publishPrivateCorridorResearch({receipt:report(),rootToken:root,
  now:new Date(TIME),fetchImpl:async(url,opts)=>{
   assert.ok(opts.headers.Authorization.startsWith("Bearer "));
   if(opts.method==="PUT")return putPrivateCorridorResearch({DB},
    JSON.parse(opts.body),now);
   return getPrivateCorridorResearch({DB},new URLSearchParams("limit=12"),now);
  }});
 assert.equal(out.d1_five_part_records_verified,1);
 assert.equal(out.source_d1_fact_equality_checked,true);
 assert.equal(out.customer_delivery_authorized,false);
});
test("public and customer routes never see this ledger",()=>{
 const main=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(main.indexOf("const auth = authorized(request, env)")<
  main.indexOf('if(url.pathname==="/v1/internal/corridor-private-research")'));
 assert.ok(!main.includes("/v1/public/corridor-private-research"));
 assert.ok(!main.includes("/v1/customer/corridor-private-research"));
});

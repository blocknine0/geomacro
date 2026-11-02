import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {validateOfficialCorridorReferenceBatch,putOfficialCorridorReference,
 readOfficialCorridorReference,purgeExpiredOfficialCorridorReferences}
 from "../../workers/control-plane/src/corridor-official-reference.mjs";
import {publishOfficialCorridorReferences}
 from "../ops/publish-private-corridor-official-references.mjs";
const now=Date.parse("2026-11-02T00:06:00.000Z");
function observation(){
 const source_id="ecb_data",metric_id="ecb_usd_eur_spot",
 observation_period="2026-10-30",numeric_value=1.1521;
 return {id:createHash("sha256").update(
  [source_id,metric_id,observation_period,String(numeric_value)].join("\x1f")).digest("hex"),
  source_id,metric_id,observation_period,numeric_value,
  observed_at:new Date(now).toISOString(),source_native_publication_at:null,
  source_observation_is_not_live_event:true,corridor_ids:[],context_only:true,
  independently_verified_event:false,commercial_rights_verified:false,
  customer_delivery_enabled:false};
}
const packet=(items=[observation()])=>({
 schema:"geomacro.corridor-official-reference-batch.v1",channel:"CORRIDOR_ONLY",
 checked_at:new Date(now).toISOString(),observations:items,
 commercial_rights_verified:false,website_intelligence_enabled:false});
class MockDB{
 constructor(){this.rows=new Map()}
 prepare(sql){return {bind:(...args)=>({sql,args,
  run:async()=>{
   if(sql.startsWith("DELETE"))for(const [id,r] of this.rows)
    if(r.last_observed_at<args[0])this.rows.delete(id);
   return {success:true};
  },
  all:async()=>{
   if(sql.includes("WHERE reference_id IN")){
    const ids=new Set(args.slice(0,-1)),cutoff=args.at(-1);
    return {results:[...this.rows.values()].filter(x=>
      ids.has(x.reference_id)&&x.last_observed_at>=cutoff)};
   }
   return {results:[...this.rows.values()].filter(x=>x.last_observed_at>=args[0])
    .sort((a,b)=>b.last_observed_at.localeCompare(a.last_observed_at))
    .slice(0,args[1])};
  }
 })}}
 async batch(statements){
  for(const p of statements){
   assert.match(p.sql,/INSERT INTO corridor_official_reference_context/u);
   const v=p.args,old=this.rows.get(v[0]);
   if(old)old.last_observed_at=v[7];
   else this.rows.set(v[0],{
    reference_id:v[0],source_id:v[1],metric_id:v[2],
    observation_period:v[3],numeric_value:v[4],
    corridor_ids_json:v[5],last_observed_at:v[7]
   });
  }
 }
}
test("official D1 contract rejects wrong source, event inference and fake hash",async()=>{
 assert.equal((await validateOfficialCorridorReferenceBatch(packet(),now)).length,1);
 for(const patch of [{source_id:"mining_com"},{id:"0".repeat(64)},
   {independently_verified_event:true},{context_only:false},
   {commercial_rights_verified:true},{corridor_ids:["not-a-corridor"]},
   {source_native_publication_at:new Date(now).toISOString()}]){
  await assert.rejects(validateOfficialCorridorReferenceBatch(
    packet([{...observation(),...patch}]),now),/CORRIDOR_OFFICIAL_REFERENCE_INVALID/);
 }
});
test("D1 official observations are idempotent and independently read back",async()=>{
 const db=new MockDB();
 for(let j=0;j<2;j++){
  const res=await putOfficialCorridorReference({DB:db},packet(),now);
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.verified,1);
  assert.equal(data.events_verified,0);
  assert.equal(data.d1_readback_verified,true);
 }
 assert.equal(db.rows.size,1);
 const got=await readOfficialCorridorReference({DB:db},
  new URLSearchParams("limit=25"),now);
 const data=await got.json();
 assert.equal(data.count,1);
 assert.equal(data.observations[0].numeric_value,1.1521);
 assert.equal(data.commercial_eligible,false);
 const purge=await purgeExpiredOfficialCorridorReferences({DB:db},now+96*3600000);
 assert.equal(purge.ok,true);
 assert.equal(db.rows.size,0);
});
test("unauthorized/unavailable D1 cannot return a paid signal",async()=>{
 const res=await putOfficialCorridorReference({},packet(),now);
 assert.equal(res.status,503);
 assert.equal((await res.json()).chargeable,false);
});
test("scheduled publisher performs both root-authenticated PUT and GET",async()=>{
 const db=new MockDB(),root="X".repeat(64);
 const token=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 const input={schema:"geomacro.corridor-official-reference-intake.v1",
  channel:"CORRIDOR_ONLY",checked_at:new Date(now).toISOString(),
  source_checks:["gdelt_v2_15m","world_bank_wdi","ecb_data","eurostat_data","imf_portwatch"]
   .map(id=>({id,state:"OFFICIAL_REFERENCE_OBSERVED",observations:id==="ecb_data"?1:0})),
  observation_count:1,observations:[observation()],website_intelligence_enabled:false,
  commercial_rights_verified:false};
 const out=await publishOfficialCorridorReferences({receipt:input,rootToken:root,
  now:new Date(now),fetchImpl:async(url,options)=>{
   assert.equal(options.headers.Authorization,"Bearer "+token);
   return options.method==="PUT"?
    putOfficialCorridorReference({DB:db},JSON.parse(options.body),now):
    readOfficialCorridorReference({DB:db},new URLSearchParams("limit=25"),now);
 }});
 assert.equal(out.d1_records_verified,1);
 assert.equal(out.authenticated_d1_put_readback,true);
 assert.equal(out.authenticated_d1_get_readback,true);
 assert.equal(out.commercial_eligible,false);
});
test("official intake endpoint is behind existing strong root authentication",()=>{
 const src=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(src.indexOf("const auth = authorized(request, env)")<
  src.indexOf('if(url.pathname==="/v1/internal/corridor-official-reference")'));
 assert.ok(!src.includes("/v1/public/corridor-official-reference"));
});

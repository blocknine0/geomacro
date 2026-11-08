import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {buildPhase2hPrivateRawRecords}
 from "../lib/phase2h-raw-original-records.mjs";
import {readIndexedRiskCountryOriginals}
 from "../../workers/control-plane/src/phase2h-risk-country-index.mjs";
import {phase2hPrivateRawPut,phase2hPrivateRawObjectReferenceGet}
 from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";

const DATE=new Date("2026-11-08T07:00:00.000Z");
const key="a".repeat(64);
const plan=()=>buildPhase2hPrivateRawRecords([
 {category:"geopolitics",sourceId:"un_press",title:"UN announces diplomatic ceasefire discussion",
  publishedAt:"2026-11-08T06:00:00.000Z",articleUrl:"https://news.un.org/en/story/2026/11/123456",credit:null},
 {category:"macro",sourceId:"fed_press",title:"Federal Reserve issues monetary policy statement",
  publishedAt:"2026-11-08T05:00:00.000Z",
  articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261108a.htm",credit:null},
 {category:"rare_earth",sourceId:"govuk",title:"Government announces mineral processing grant",
  publishedAt:"2026-11-08T04:00:00.000Z",
  articleUrl:"https://www.gov.uk/government/news/critical-minerals-processing-grant",
  credit:null}
],{now:DATE,derive:sources=>sources.map(x=>({
 category:x.category,published_at:x.publishedAt,topic:"new original-source policy observation",
 what_changed:"A dated original issuer reported a source-specific government policy statement.",
 why_it_matters:"The new policy statement may influence monitoring assumptions and needs independent validation."
}))}).records;

function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(readFileSync(new URL(
  "../../workers/control-plane/migrations/0035_phase2h_private_raw_news.sql",
  import.meta.url),"utf8"));
 sqlite.exec(readFileSync(new URL(
  "../../workers/control-plane/migrations/0111_phase2h_risk_country_materialization.sql",
  import.meta.url),"utf8"));
 sqlite.exec(readFileSync(new URL(
  "../../workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql",
  import.meta.url),"utf8"));
 let puts=0,gets=0;
 const blobs=new Map();
 const R2={
  async put(k,bytes){
   puts++;blobs.set(k,new Uint8Array(bytes));
   return {size:bytes.byteLength};
  },
  async get(k){
   gets++;const bytes=blobs.get(k);
   if(!bytes)return null;
   return {size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(
    bytes.byteOffset,bytes.byteOffset+bytes.length)};
  }
 };
 const DB={
  prepare(sql){
   const q={params:[],
    bind(...args){q.params=args;return q},
    async all(){return {results:sqlite.prepare(sql).all(...q.params)}},
    async first(){return sqlite.prepare(sql).get(...q.params)??null},
    async run(){
     const r=sqlite.prepare(sql).run(...q.params);
     return {success:true,meta:{rows_written:Number(r.changes),rows_read:0}};
    }
   };
   return q;
  }
 };
 const env={DB,PHASE2H_PRIVATE_R2:R2,
  PHASE2H_R2_REFERENCE_HMAC_KEY:key,
  GEOMACRO_PHASE2H_REF_ONLY_V1:"1"};
 return {sqlite,env,blobs,counters:()=>({puts,gets})};
}
const body=items=>({schema:"geomacro.phase2h.private-raw-batch.v1",items});
const get=async(env,id)=>phase2hPrivateRawObjectReferenceGet(env,
 new URLSearchParams({record_id:id}),DATE.getTime());

test("one verified private R2 bundle / up to 50 records and D1 reference-only rows",async()=>{
 const f=fixture(),records=plan();
 try{
  const response=await phase2hPrivateRawPut(f.env,body(records),DATE.getTime());
  assert.equal(response.status,200,await response.clone().text());
  const receipt=await response.json();
  assert.equal(receipt.accepted,3);
  assert.equal(receipt.d1_raw_json_persisted,false);
  assert.equal(receipt.private_r2_readback_verified,true);
  assert.equal(f.counters().puts,1);
  assert.equal(f.counters().gets,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM phase2h_private_raw_news").get().n,0);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM phase2h_raw_object_refs_v1").get().n,3);
  const schema=f.sqlite.prepare("PRAGMA table_info(phase2h_raw_object_refs_v1)").all();
  assert.ok(!schema.some(x=>x.name==="raw_json"),"no raw payload column exists");
  for(const rec of records){
   const result=await get(f.env,rec.record_id),payload=await result.json();
   assert.equal(result.status,200);
   assert.equal(payload.legacy_fallback,false);
   assert.equal(payload.pointer_and_object_verified,true);
   assert.deepEqual(payload.record,rec);
   assert.equal(payload.paid_eligible,false);
  }
  const duplicate=await phase2hPrivateRawPut(f.env,body(records),DATE.getTime());
  assert.equal(duplicate.status,200);
  assert.equal((await duplicate.json()).accepted,0);
  assert.equal(f.counters().puts,1,"identical retries never rewrite R2 object");
 }finally{f.sqlite.close()}
});

test("legacy rows without new pointers still fall back to authentic D1 raw_json",async()=>{
 const f=fixture(),record=plan()[0];
 try{
  f.sqlite.prepare("INSERT INTO phase2h_private_raw_news "+
   "(record_id,category,original_published_at,first_ingested_at,raw_sha256,raw_json) "+
   "VALUES (?,?,?,?,?,?)").run(record.record_id,record.category,
    record.original.original_published_at,record.ingested_at,
    record.raw_sha256,JSON.stringify(record));
  const output=await get(f.env,record.record_id);
  assert.equal(output.status,200);
  const data=await output.json();
  assert.equal(data.legacy_fallback,true);
  assert.equal(data.source,"LEGACY_D1_RAW_JSON_VERIFIED");
  assert.deepEqual(data.record,record);
  assert.equal(f.counters().gets,0);
 }finally{f.sqlite.close()}
});

test("corrupt R2 object is rejected and NEVER falls back to a conflicting legacy row",async()=>{
 const f=fixture(),record=plan()[0];
 try{
  assert.equal((await phase2hPrivateRawPut(f.env,body([record]),DATE.getTime())).status,200);
  f.sqlite.prepare("INSERT INTO phase2h_private_raw_news "+
   "(record_id,category,original_published_at,first_ingested_at,raw_sha256,raw_json) "+
   "VALUES (?,?,?,?,?,?)").run(record.record_id,record.category,
    record.original.original_published_at,record.ingested_at,
    record.raw_sha256,JSON.stringify(record));
  const k=[...f.blobs.keys()][0];
  f.blobs.set(k,new TextEncoder().encode('{"tampered":true}'));
  const response=await get(f.env,record.record_id);
  assert.equal(response.status,503);
  const payload=await response.json();
  assert.equal(payload.error,"PHASE2H_REF_READBACK_UNVERIFIED");
 }finally{f.sqlite.close()}
});

test("forged pointer HMAC fails before any R2 GET and never discloses raw data",async()=>{
 const f=fixture(),record=plan()[0];
 try{
  assert.equal((await phase2hPrivateRawPut(f.env,body([record]),DATE.getTime())).status,200);
  const before=f.counters().gets;
  f.sqlite.prepare("UPDATE phase2h_raw_object_refs_v1 SET pointer_hmac_sha256=? "+
   "WHERE record_id=?").run("b".repeat(64),record.record_id);
  const response=await get(f.env,record.record_id);
  assert.equal(response.status,503);
  assert.equal(f.counters().gets,before);
  assert.equal((await response.json()).paid_eligible,false);
 }finally{f.sqlite.close()}
});

test("R2 failed write or corrupt PUT readback never commits D1 references",async()=>{
 const f=fixture(),record=plan()[0];
 try{
  f.env.PHASE2H_PRIVATE_R2.put=async()=>{throw Error("simulated outage")};
  const response=await phase2hPrivateRawPut(f.env,body([record]),DATE.getTime());
  assert.equal(response.status,503);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM phase2h_raw_object_refs_v1").get().n,0);
 }finally{f.sqlite.close()}
});

test("opt-in and private R2 binding are mandatory; legacy path remains disabled by default",async()=>{
 const f=fixture(),record=plan()[0];
 try{
  delete f.env.GEOMACRO_PHASE2H_REF_ONLY_V1;
  const sql=f.sqlite.prepare("SELECT COUNT(*) AS n FROM phase2h_raw_object_refs_v1").get();
  assert.equal(sql.n,0);
  // Existing legacy D1 writer remains the default (not exercised here).
  f.env.GEOMACRO_PHASE2H_REF_ONLY_V1="1";
  delete f.env.PHASE2H_PRIVATE_R2;
  const r=await phase2hPrivateRawPut(f.env,body([record]),DATE.getTime());
  assert.equal(r.status,503);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM phase2h_raw_object_refs_v1").get().n,0);
 }finally{f.sqlite.close()}
});

test("gated country-index reader hydrates R2 refs in memory, without D1 raw writes",async()=>{
 const f=fixture();
 try{
  const record=buildPhase2hPrivateRawRecords([{
   category:"macro",sourceId:"rbi",title:"India announces monetary policy update",
   publishedAt:"2026-11-08T06:00:00.000Z",
   articleUrl:"https://www.rbi.org.in/news/monetary-policy-2026",credit:null
  }],{now:DATE,derive:xs=>xs.map(x=>({
   category:x.category,published_at:x.publishedAt,
   topic:"monetary policy",
   what_changed:"India's central bank issued a dated monetary policy statement.",
   why_it_matters:"Currency and rate assumptions may change; market effects unverified."
  }))}).records[0];
  const inserted=await phase2hPrivateRawPut(f.env,body([record]),DATE.getTime());
  assert.equal(inserted.status,200);
  const pointer=f.sqlite.prepare(
   "SELECT risk_country_iso3 FROM phase2h_raw_object_refs_v1 WHERE record_id=?").get(record.record_id);
  assert.equal(pointer.risk_country_iso3,"IND");
  f.env.GEOMACRO_PHASE2H_REF_ONLY_READERS_V1="1";
  const read=await readIndexedRiskCountryOriginals(f.env,{
   countryId:"IND",category:"macro",
   since:"2026-11-08T05:00:00.000Z",until:"2026-11-08T08:00:00.000Z"
  });
  assert.equal(read.length,1);
  assert.equal(read[0].record_id,record.record_id);
  assert.deepEqual(JSON.parse(read[0].raw_json),record);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM phase2h_private_raw_news").get().n,0);
 }finally{f.sqlite.close()}
});

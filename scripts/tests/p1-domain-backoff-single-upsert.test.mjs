import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {P1_DOMAIN_FAILURE_UPSERT_SQL,recordP1DomainFailure}
 from "../../workers/control-plane/src/p1-source-domain-backoff.mjs";

const T=Date.parse("2026-11-08T12:00:00.000Z");
const at=minutes=>new Date(T+minutes*60_000).toISOString();
function fixture(){
 const db=new DatabaseSync(":memory:");
 // Same physical CHECK and due index as migration 0119; no extra table.
 db.exec(`CREATE TABLE p1_source_domain_backoff (
  hostname TEXT PRIMARY KEY NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK(consecutive_failures>=0),
  next_allowed_at TEXT NOT NULL,
  last_failure_state TEXT NOT NULL CHECK(last_failure_state IN
    ('UNAVAILABLE','DENIED','RATE_LIMITED','MALFORMED')),
  updated_at TEXT NOT NULL);
  CREATE INDEX idx_p1_domain_next ON p1_source_domain_backoff(next_allowed_at);`);
 const statements=[];
 const DB={prepare(sql){statements.push(sql);return {bind(...args){
   return {async run(){const out=db.prepare(sql).run(...args);
     return {meta:{changes:out.changes}};}};}}};
 const row=(host="gov.example.org")=>db.prepare(
   "SELECT consecutive_failures,next_allowed_at,last_failure_state,updated_at "+
   "FROM p1_source_domain_backoff WHERE hostname=?").get(host);
 return {db,DB,row,statements};
}
test("failed domain poll is exactly one atomic UPSERT and zero pre-reads",async()=>{
 const f=fixture();
 try{
  const out=await recordP1DomainFailure(f.DB,{hostname:"gov.example.org",state:"UNAVAILABLE",now:T});
  assert.deepEqual(out,{updated:true,statement_count:1,pre_read_statements:0});
  assert.deepEqual(f.statements,[P1_DOMAIN_FAILURE_UPSERT_SQL]);
  assert.equal(f.row().consecutive_failures,1);
  assert.equal(f.row().next_allowed_at,at(5));
  assert.equal(f.row().last_failure_state,"UNAVAILABLE");
 }finally{f.db.close();}
});
test("exact 5m, 15m, 60m exponential failure backoff and saturating count",async()=>{
 const f=fixture();
 try{
  for(let i=0;i<4;i++)await recordP1DomainFailure(f.DB,{
   hostname:"gov.example.org",state:"UNAVAILABLE",now:T+i*60_000});
  assert.equal(f.row().consecutive_failures,4);
  assert.equal(f.row().next_allowed_at,at(63));
  assert.equal(f.statements.length,4);
  for(let n=4;n<102;n++)await recordP1DomainFailure(f.DB,{
   hostname:"gov.example.org",state:"MALFORMED",now:T+n*60_000});
  assert.equal(f.row().consecutive_failures,100);
  assert.equal(f.row().next_allowed_at,at(161));
 }finally{f.db.close();}
});
test("concurrent failed source polls never lose a counter increment",async()=>{
 const f=fixture();
 try{
  await Promise.all(Array.from({length:25},()=>recordP1DomainFailure(f.DB,{
   hostname:"gov.example.org",state:"UNAVAILABLE",now:T})));
  assert.equal(f.row().consecutive_failures,25);
  assert.equal(f.row().next_allowed_at,at(60));
 }finally{f.db.close();}
});
test("429 and denied backoff never shorten an already longer hold",async()=>{
 const f=fixture();
 try{
  await recordP1DomainFailure(f.DB,{hostname:"gov.example.org",state:"DENIED",now:T});
  assert.equal(f.row().next_allowed_at,at(60));
  await recordP1DomainFailure(f.DB,{
   hostname:"gov.example.org",state:"RATE_LIMITED",now:T+60_000,delay:30_000});
  assert.equal(f.row().next_allowed_at,at(60));
  await recordP1DomainFailure(f.DB,{
   hostname:"gov.example.org",state:"RATE_LIMITED",now:T+120_000,delay:5_400_000});
  assert.equal(f.row().next_allowed_at,at(92));
  assert.equal(f.row().last_failure_state,"RATE_LIMITED");
 }finally{f.db.close();}
});
test("nonfailure never writes; malformed state, missing DB and unknown receipts hold",async()=>{
 const f=fixture();
 try{
  for(const state of ["OBSERVED","EMPTY","UNCHANGED","CAPACITY_DEFERRED"]){
   assert.deepEqual(await recordP1DomainFailure(f.DB,{hostname:"gov.example.org",state,now:T}),
    {updated:false,reason:"NO_FAILURE"});
  }
  assert.equal(f.statements.length,0);
  await assert.rejects(()=>recordP1DomainFailure(null,{
   hostname:"gov.example.org",state:"UNAVAILABLE",now:T}),/INPUT_UNVERIFIED/);
  await assert.rejects(()=>recordP1DomainFailure(f.DB,{
   hostname:"gov.example.org",state:"RATE_LIMITED",now:T,delay:-1}),/INPUT_UNVERIFIED/);
  await assert.rejects(()=>recordP1DomainFailure({
   prepare:()=>({bind:()=>({run:async()=>({meta:{changes:0}})})})
  },{hostname:"gov.example.org",state:"DENIED",now:T}),/D1_ACK_UNVERIFIED/);
 }finally{f.db.close();}
});

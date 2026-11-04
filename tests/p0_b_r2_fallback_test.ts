import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {p0bSha256} from "../src/storage/b2-spool-manager.ts";
import {canonicalJson} from "../src/lib/canonical-json.ts";
import {stageP0bR2Fallback,restoreP0bR2Fallback}
 from "../src/storage/p0b-r2-fallback.ts";
import {processFetchedBatch} from "../src/workers/ingest-producer.ts";
import {drainR2Fallback} from "../src/workers/backlog-drain-cron.ts";

const at="2026-11-04T03:00:00.000Z",now=Date.parse(at);
function fixture(){
 const db=new DatabaseSync(":memory:");
 for(const name of ["0113_p0a_source_registry.sql",
 "0114_p0_b_spool_queue.sql","0115_p0_b_storage_circuit.sql",
 "0116_p0b_microbatch_spool.sql","0118_p0b_archive_outbox.sql",
 "0122_p0b_private_r2_fallback.sql"])
  db.exec(readFileSync(new URL("../workers/control-plane/migrations/"+name,
   import.meta.url),"utf8"));
 const prep=(sql:string,params:any[]=[]):any=>({
  sql,params,
  bind(...values:any[]){return prep(sql,values)},
  async run(){const result=db.prepare(sql).run(...params);return {meta:{changes:result.changes}}},
  async first(){return db.prepare(sql).get(...params)??null},
  async all(){return {results:db.prepare(sql).all(...params)}}
 });
 const objects=new Map<string,Uint8Array>();
 let corrupt=false;
 const r2={
  async put(key:string,body:Uint8Array){
   objects.set(key,new Uint8Array(body));return {etag:"private-encrypted"}
  },
  async get(key:string){
   const bytes=objects.get(key);
   if(!bytes)return null;
   const copy=new Uint8Array(bytes);
   if(corrupt)copy[0]^=255;
   return {arrayBuffer:async()=>copy.buffer};
  }
 };
 const DB={prepare:prep,async batch(statements:any[]){
   db.exec("BEGIN");
   try{
    const result=[];
    for(const s of statements)result.push(await s.run());
    db.exec("COMMIT");return result;
   }catch(error){db.exec("ROLLBACK");throw error;}
  }};
 const env:any={
  DB,INGEST_QUEUE:{async send(){}},
  B2_S3_ENDPOINT:"https://s3.us-east-005.backblazeb2.com",
  B2_KEY_ID:"sample-key-id-not-real",
  B2_APPLICATION_KEY:"a".repeat(32),
  B2_SPOOL_BUCKET:"geomacro-private-archive",
  B2_SPOOL_ENCRYPTION_KEY:"private-test-aes-gcm-key-"+("a".repeat(40)),
  P0B_PRIVATE_FALLBACK_R2:r2
 };
 return {db,env,objects,setCorrupt:(b:boolean)=>{corrupt=b},
  close:()=>db.close()};
}
const raw=(i:number)=>({title:"Sensitive original headline "+i,
 native_published_at:"2026-11-04T02:15:00.000Z",
 rights_tier:"RESEARCH_ONLY",category:["geopolitics","macro","rare_earth"][i%3]});
async function payload(i:number){
 const data=raw(i);
 return {candidateSha256:await p0bSha256(canonicalJson(data)),
  sourceId:"source_"+(i%3),rawPayload:data,headers:{},discoveredAt:at};
}
test("100 encrypted R2 originals are independently readback-verified and private D1 keeps only hashes",async()=>{
 const f=fixture();
 try{
  const items=await Promise.all(Array.from({length:100},(_,i)=>payload(i)));
  const staged=await stageP0bR2Fallback(f.env,items,new Date(now));
  assert.equal(staged.verified,true);assert.equal(staged.itemCount,100);
  assert.equal(staged.pendingB2,true);assert.equal(f.objects.size,1);
  const pointer=f.db.prepare("SELECT * FROM p0b_private_r2_fallback").get();
  assert.equal(pointer.state,"PENDING_B2");
  const content=JSON.stringify(pointer);
  assert.equal(content.includes("Sensitive original headline"),false);
  const ciphertext=[...f.objects.values()][0];
  assert.equal(Buffer.from(ciphertext).includes(Buffer.from("Sensitive original headline")),false);
  const restored=await restoreP0bR2Fallback(f.env,pointer);
  assert.deepEqual(restored.map(x=>x.candidateSha256),items.map(x=>x.candidateSha256));
  const again=await stageP0bR2Fallback(f.env,items,new Date(now));
  assert.equal(again.reused,true);assert.equal(f.objects.size,1);
 }finally{f.close()}
});
test("failed B2 canary produces durable R2_PENDING_B2, never false B2 success",async()=>{
 const f=fixture();
 try{
  const items=await Promise.all(Array.from({length:26},(_,i)=>payload(i+1000)));
  const receipt=await processFetchedBatch(items.map(x=>({
   candidateSha256:x.candidateSha256,sourceId:x.sourceId,raw:x.rawPayload
  })),f.env,{
   manager:{async spoolBundleAndVerify(){
    throw Error("P0B_B2_PUT_TRANSPORT_UNAVAILABLE");
   }},now:()=>new Date(now)
  });
  assert.equal(receipt.examined,26);
  assert.equal(receipt.unaccepted,0);
  assert.equal(receipt.bundles_created,0);
  assert.equal(receipt.r2_fallback_chunks_readback_verified,1);
  assert.ok(receipt.receipts.every(r=>r.status==="R2_DURABLE_PENDING_B2"));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM p0b_private_r2_fallback WHERE state='PENDING_B2'").get().n,1);
  const blocked=await drainR2Fallback(f.env,{now:now+60_000});
  assert.equal(blocked.status,"R2_FALLBACK_B2_CIRCUIT_HELD");
  const stillPending=await drainR2Fallback(f.env,{
   now:now+600_000,
   persist:async candidates=>({
    all_durable:false,receipts:candidates.map(()=>({status:"R2_DURABLE_PENDING_B2"}))
   })
  });
  assert.equal(stillPending.verified,0);
  assert.equal(stillPending.failed,1);
  assert.equal(f.db.prepare("SELECT state FROM p0b_private_r2_fallback").get().state,"PENDING_B2");
  const recovered=await drainR2Fallback(f.env,{
   now:now+1800_000,
   persist:async candidates=>({
    all_durable:true,receipts:candidates.map(()=>({status:"QUEUED"}))
   })
  });
  assert.equal(recovered.verified,1);
  assert.equal(recovered.failed,0);
  const final=f.db.prepare("SELECT state,b2_verified_at FROM p0b_private_r2_fallback").get();
  assert.equal(final.state,"B2_VERIFIED");
  assert.equal(final.b2_verified_at,new Date(now+1800_000).toISOString());
 }finally{f.close()}
});
test("corrupt R2 GET fails closed and never commits D1 fallback pointer",async()=>{
 const f=fixture();
 try{
  f.setCorrupt(true);
  await assert.rejects(stageP0bR2Fallback(f.env,[await payload(5500)],new Date(now)),
   /P0B_R2_FALLBACK_CIPHER_MISMATCH/);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM p0b_private_r2_fallback").get().n,0);
 }finally{f.close()}
});

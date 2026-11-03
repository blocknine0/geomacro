import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {B2SpoolManager,p0bSha256} from '../src/storage/b2-spool-manager.ts';
import {processFetchedBatch} from '../src/workers/ingest-producer.ts';
import {handleQueueBatch} from '../src/workers/ingest-consumer.ts';
import {drainBacklog} from '../src/workers/backlog-drain-cron.ts';

const at='2026-11-04T03:00:00.000Z',NOW=Date.parse(at);
const NOW_DATE=()=>new Date(NOW);
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../workers/control-plane/migrations/0113_p0a_source_registry.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../workers/control-plane/migrations/0114_p0_b_spool_queue.sql',import.meta.url),'utf8'));
 db.exec("PRAGMA foreign_keys=ON");
 db.prepare(
  'INSERT INTO source_registry(source_id,canonical_endpoint,parser_type,intended_category,'+
  'country_iso3,rights_tier,polling_interval_sec,rate_limit_backoff) VALUES (?,?,?,?,?,?,?,?)'
 ).run('src_probe','https://example.org/feed','RSS_2','GEOPOLITICS','GLOBAL',
  'RESEARCH_ONLY',300,'{"max_retries":1,"base_delay_ms":100,"respect_retry_after":true}');
 const prep=(sql,params=[])=>({
  sql,params,
  bind(...args){return prep(sql,args)},
  async first(){return db.prepare(sql).get(...params)??null},
  async all(){return {results:db.prepare(sql).all(...params)}},
  async run(){const info=db.prepare(sql).run(...params);return {meta:{changes:info.changes}}},
 });
 const env={
  DB:{prepare:sql=>prep(sql),async batch(commands){
   const output=[];
   db.exec('BEGIN');
   try{
    for(const c of commands){
     const result=db.prepare(c.sql).run(...c.params);
     output.push({meta:{changes:result.changes}});
    }
    db.exec('COMMIT');return output;
   }catch(error){db.exec('ROLLBACK');throw error;}
  }},
  B2_S3_ENDPOINT:'https://s3.us-east-005.backblazeb2.com',
  B2_KEY_ID:'test-access-key-00001',
  B2_APPLICATION_KEY:'test-secret-cannot-be-used-outside-tests',
  B2_SPOOL_BUCKET:'geomacro-private-archive',
  B2_SPOOL_ENCRYPTION_KEY:'test-256-bit-private-spool-key-not-for-prod-1234567',
  INGEST_QUEUE:{sent:[],async send(body){this.sent.push(body)}}
 };
 const objects=new Map(),requests=[];
 const fetchImpl=async (url,opts)=>{
  assert.match(opts.headers.Authorization,/^AWS4-HMAC-SHA256 Credential=/u);
  const key=new URL(url).pathname;
  requests.push({method:opts.method,key});
  if(opts.method==='PUT'){
   objects.set(key,Uint8Array.from(opts.body));
   return new Response(null,{status:200});
  }
  if(opts.method==='GET'){
   if(!objects.has(key))return new Response(null,{status:404});
   return new Response(objects.get(key),{status:200});
  }
  throw Error('UNEXPECTED_METHOD');
 };
 const manager=new B2SpoolManager(env,{fetchImpl,now:NOW_DATE,reserve:async()=>{}});
 return {db,env,objects,requests,manager,close:()=>db.close()};
}
async function candidate(index:number){
 const raw={title:'Unique publisher article '+index,
  native_published_at:'2026-11-04T02:10:00.000Z',rights_tier:'RESEARCH_ONLY'};
 return {candidateSha256:await p0bSha256(JSON.stringify(raw)),sourceId:'src_probe',raw};
}
function messages(sent:any[]){
 const records=sent.map(item=>({
  body:item,ackCount:0,retryCount:0,
  ack(){this.ackCount++},retry(){this.retryCount++}
 }));
 return {records,batch:{messages:records}};
}
test('test_b2_spool_write_and_readback',async()=>{
 const f=fixture();
 try{
  const c=await candidate(1);
  const receipt=await f.manager.spoolAndVerify({
   candidateSha256:c.candidateSha256,sourceId:c.sourceId,rawPayload:c.raw,
   discoveredAt:at,headers:{}
  });
  assert.equal(receipt.sha256,c.candidateSha256);
  assert.match(receipt.b2Uri,/^b2:\/\/spool\/20261104\/src_probe\//u);
  assert.ok(receipt.byteSize>0);
  assert.equal(f.requests.length,2);
  const stored=f.objects.values().next().value;
  assert.ok(stored&&!new TextDecoder().decode(stored).includes(c.raw.title));
  const recovered=await f.manager.readVerified(receipt.b2Uri,c.candidateSha256,c.sourceId);
  assert.deepEqual(recovered.rawPayload,c.raw);
 }finally{f.close()}
});
test('test_burst_admission_over_150: all 250 B2-spooled, no drop',async()=>{
 const f=fixture();
 try{
  const candidates=await Promise.all(Array.from({length:250},(_,i)=>candidate(i)));
  const receipt=await processFetchedBatch(candidates,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(receipt.unaccepted,0);
  assert.equal(receipt.receipts.filter(x=>x.status==='QUEUED').length,250);
  assert.equal(f.objects.size,250);
  assert.equal(f.env.INGEST_QUEUE.sent.length,250);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM ingestion_spool_queue WHERE state='PENDING'").get().n,250);
 }finally{f.close()}
});
test('test_state_machine_transitions: pending -> processing -> D1 commit -> ACK',async()=>{
 const f=fixture();
 try{
  const c=await candidate(300);
  await processFetchedBatch([c],f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(f.db.prepare('SELECT state FROM ingestion_spool_queue').get().state,'PENDING');
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  const receipt=await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(receipt.committed,1);
  assert.equal(records[0].ackCount,1);
  assert.equal(records[0].retryCount,0);
  assert.equal(f.db.prepare('SELECT state FROM ingestion_spool_queue').get().state,'D1_COMMITTED');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM normalized_articles WHERE status='ADMITTED'").get().n,1);
  await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(records[0].ackCount,2);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM normalized_articles').get().n,1);
 }finally{f.close()}
});
test('test_dead_letter_quarantine: third failure durable, no forged commit',async()=>{
 const f=fixture();
 try{
  const c=await candidate(400);
  await processFetchedBatch([c],f.env,{manager:f.manager,now:NOW_DATE});
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  const badManager={async readVerified(){throw Error('P0B_B2_GET_UNAVAILABLE')}};
  for(let n=0;n<3;n++)await handleQueueBatch(batch,f.env,{manager:badManager,now:NOW_DATE});
  const row=f.db.prepare('SELECT state,retry_count,last_error_code FROM ingestion_spool_queue').get();
  assert.equal(row.retry_count,3);
  assert.equal(row.state,'DEAD_LETTER');
  assert.equal(row.last_error_code,'P0B_B2_GET_UNAVAILABLE');
  assert.equal(records[0].retryCount,2);
  assert.equal(records[0].ackCount,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM normalized_articles').get().n,0);
  assert.equal(f.objects.size,1);
 }finally{f.close()}
});
test('test_backlog_drain_fifo_order: oldest pending spool dispatched first',async()=>{
 const f=fixture();
 try{
  for(let i=0;i<3;i++){
   const c=await candidate(i+500);
   f.db.prepare("INSERT INTO ingestion_spool_queue(id,candidate_sha256,source_id,b2_spool_uri,b2_byte_size,spooled_at) VALUES (?,?,?,?,?,?)")
    .run(crypto.randomUUID(),c.candidateSha256,c.sourceId,
     'b2://spool/20261104/src_probe/'+c.candidateSha256+'.json',
     100,new Date(NOW-(12-i)*60000).toISOString());
  }
  const receipt=await drainBacklog(f.env,{now:NOW,limit:3});
  assert.equal(receipt.status,'DRAINED_BATCH');
  assert.equal(receipt.count,3);
  const expected=f.db.prepare('SELECT candidate_sha256 FROM ingestion_spool_queue ORDER BY spooled_at ASC').all()
   .map(x=>x.candidate_sha256);
  assert.deepEqual(f.env.INGEST_QUEUE.sent.map(x=>x.candidateSha256),expected);
 }finally{f.close()}
});
test('test_zero_loss_on_worker_crash: expired lease recovers, B2 survives',async()=>{
 const f=fixture();
 try{
  const c=await candidate(650);
  await processFetchedBatch([c],f.env,{manager:f.manager,now:NOW_DATE});
  // A consumer crashes after locking but before commit; no queue ACK.
  f.db.prepare("UPDATE ingestion_spool_queue SET state='PROCESSING',locked_until=?")
   .run(new Date(NOW-120000).toISOString());
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  const receipt=await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(receipt.committed,1);
  assert.equal(records[0].ackCount,1);
  assert.equal(f.db.prepare('SELECT state FROM ingestion_spool_queue').get().state,'D1_COMMITTED');
  assert.equal(f.objects.size,1);
 }finally{f.close()}
});
test('a failed Queue send preserves B2 + D1 for backlog replay',async()=>{
 const f=fixture();
 try{
  const c=await candidate(700);
  f.env.INGEST_QUEUE.send=async()=>{throw Error('QUEUE_TEMPORARY_FAILURE')};
  const receipt=await processFetchedBatch([c],f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(receipt.receipts[0].status,'DURABLE_PENDING_REDISPATCH');
  assert.equal(receipt.all_durable,true);
  assert.equal(f.db.prepare('SELECT state FROM ingestion_spool_queue').get().state,'PENDING');
  assert.equal(f.objects.size,1);
 }finally{f.close()}
});

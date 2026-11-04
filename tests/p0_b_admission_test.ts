import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {B2SpoolManager,p0bSha256} from '../src/storage/b2-spool-manager.ts';
import {canonicalJson} from '../src/lib/canonical-json.ts';
import {processFetchedBatch} from '../src/workers/ingest-producer.ts';
import {handleQueueBatch} from '../src/workers/ingest-consumer.ts';
import {drainBacklog} from '../src/workers/backlog-drain-cron.ts';
import {pollP0aSources} from '../workers/control-plane/src/p0a-source-registry.mjs';

const at='2026-11-04T03:00:00.000Z',NOW=Date.parse(at);
const NOW_DATE=()=>new Date(NOW);
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../workers/control-plane/migrations/0113_p0a_source_registry.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../workers/control-plane/migrations/0114_p0_b_spool_queue.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../workers/control-plane/migrations/0115_p0_b_storage_circuit.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../workers/control-plane/migrations/0116_p0b_microbatch_spool.sql',import.meta.url),'utf8'));
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
  assert.equal(opts.redirect,'manual'); // origin never changes after SigV4
  assert.match(opts.headers.Authorization,/^AWS4-HMAC-SHA256 Credential=/u);
  const key=new URL(url).pathname;
  requests.push({method:opts.method,key});
  if(opts.method==='PUT'){
   objects.set(key,opts.body instanceof ArrayBuffer?new Uint8Array(opts.body):Uint8Array.from(opts.body));
   return new Response(null,{status:200});
  }
  if(opts.method==='GET'){
   if(!objects.has(key))return new Response(null,{status:404});
   return new Response(objects.get(key),{status:200});
  }
  throw Error('UNEXPECTED_METHOD');
 };
 const manager=new B2SpoolManager(env,{fetchImpl,now:NOW_DATE,reserve:async()=>{}});
 return {db,env,objects,requests,fetchImpl,manager,close:()=>db.close()};
}
async function candidate(index:number){
 const raw={title:'Unique publisher article '+index,
  native_published_at:'2026-11-04T02:10:00.000Z',rights_tier:'RESEARCH_ONLY'};
 return {candidateSha256:await p0bSha256(canonicalJson(raw)),sourceId:'src_probe',raw};
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
  assert.equal(f.objects.size,3);
  assert.equal(f.env.INGEST_QUEUE.sent.length,3);
  assert.equal(f.requests.filter(x=>x.method==='PUT').length,3);
  assert.equal(f.requests.filter(x=>x.method==='GET').length,3);
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
  assert.equal(receipt.bundles?.committed,1);
  assert.equal(records[0].ackCount,1);
  assert.equal(records[0].retryCount,0);
  assert.equal(f.db.prepare("SELECT state FROM ingestion_spool_bundles").get().state,'D1_COMMITTED');
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
  const badManager={async readBundleVerified(){throw Error('P0B_B2_GET_UNAVAILABLE')}};
  for(let n=0;n<3;n++)await handleQueueBatch(batch,f.env,{manager:badManager,now:NOW_DATE});
  const row=f.db.prepare('SELECT state,retry_count,last_error_code FROM ingestion_spool_bundles').get();
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
  f.db.prepare("UPDATE ingestion_spool_bundles SET state='PROCESSING',locked_until=?")
   .run(new Date(NOW-120000).toISOString());
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  const receipt=await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(receipt.bundles?.committed,1);
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

test('P0-B scoped private archive prefix preserves ciphertext readback and original identity',async()=>{
 const f=fixture();
 try{
  f.env.B2_SPOOL_PREFIX='geomacro-evidence/v1/private/spool/';
  const manager=new B2SpoolManager(f.env,{
   fetchImpl:f.fetchImpl,now:NOW_DATE,reserve:async()=>{}
  });
  const c=await candidate(821);
  const receipt=await manager.spoolAndVerify({
   candidateSha256:c.candidateSha256,sourceId:c.sourceId,rawPayload:c.raw,
   headers:{},discoveredAt:at
  });
  assert.match(receipt.b2Uri,
   /^b2:\/\/geomacro-evidence\/v1\/private\/spool\/20261104\/src_probe\//u);
  const verified=await manager.readVerified(receipt.b2Uri,c.candidateSha256,c.sourceId);
  assert.deepEqual(verified.rawPayload,c.raw);
  assert.equal(f.requests.length,3);
 }finally{f.close()}
});
test('P0-B global circuit halts repeated 403 B2 requests across independent source polls',async()=>{
 const f=fixture();
 try{
  const batch=await Promise.all([candidate(900),candidate(901),candidate(902)]);
  let requests=0;
  const bad={async spoolBundleAndVerify(){requests++;throw Error('P0B_B2_PUT_HTTP_403')}};
  const result=await processFetchedBatch(batch,f.env,{manager:bad,now:NOW_DATE});
  assert.equal(result.all_durable,false);
  assert.equal(result.receipts.length,3);
  assert.equal(requests,1);
  const hold=f.db.prepare('SELECT hold_until,last_error_code FROM p0b_storage_circuit').get();
  assert.equal(hold.last_error_code,'P0B_B2_PUT_HTTP_403');
  assert.ok(hold.hold_until>at);
  const again=await processFetchedBatch([await candidate(903)],f.env,{
   manager:bad,now:NOW_DATE
  });
  assert.equal(again.all_durable,false);
  assert.equal(again.receipts[0].error_code,'P0B_STORAGE_CIRCUIT_HELD');
  assert.equal(requests,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ingestion_spool_queue').get().n,0);
 }finally{f.close()}
});


test('100 independent item hashes and offsets occupy exactly one encrypted gzip PUT',async()=>{
 const f=fixture();
 try{
  const arr=await Promise.all(Array.from({length:100},(_,i)=>candidate(i+1000)));
  const result=await processFetchedBatch(arr,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(result.unaccepted,0);assert.equal(result.bundles_created,1);
  assert.equal(f.requests.filter(x=>x.method==='PUT').length,1);
  assert.equal(f.env.INGEST_QUEUE.sent.length,1);
  const msg=f.env.INGEST_QUEUE.sent[0];
  assert.equal(msg.kind,'P0B_BUNDLE_V1');
  assert.match(msg.b2Uri,
   /^b2:\/\/spool\/20261104\/src_probe\/bundle_20261104T030000Z_[0-9a-f]{64}\.json\.gz$/u);
  const restored=await f.manager.readBundleVerified(msg.b2Uri,msg.bundleSha256);
  assert.equal(restored.items.length,100);
  assert.equal(new Set(restored.index.map(x=>x.candidateSha256)).size,100);
  for(let i=1;i<restored.index.length;i++)
   assert.equal(restored.index[i].byteOffset,
    restored.index[i-1].byteOffset+restored.index[i-1].byteLength);
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  const done=await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(done.bundles?.committed,1);
  assert.equal(records[0].ackCount,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM ingestion_spool_queue WHERE state='D1_COMMITTED'").get().n,100);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM normalized_articles').get().n,100);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM ingestion_spool_bundles WHERE state='D1_COMMITTED'").get().n,1);
 }finally{f.close()}
});
test('tampered gzip bundle never ACKs or falsely commits candidate',async()=>{
 const f=fixture();
 try{
  await processFetchedBatch([await candidate(1200)],f.env,{manager:f.manager,now:NOW_DATE});
  const key=f.objects.keys().next().value;
  const tampered=Uint8Array.from(f.objects.get(key));tampered[tampered.length-3]^=1;
  f.objects.set(key,tampered);
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(records[0].ackCount,0);
  assert.equal(records[0].retryCount,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM normalized_articles').get().n,0);
 }finally{f.close()}
});
test('per-bundle send failure is recovered via one FIFO dispatch',async()=>{
 const f=fixture();
 try{
  const arr=await Promise.all(Array.from({length:35},(_,i)=>candidate(1300+i)));
  f.env.INGEST_QUEUE.send=async()=>{throw Error('QUEUE_OUTAGE')};
  const receipt=await processFetchedBatch(arr,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(receipt.all_durable,true);
  assert.equal(receipt.bundles_created,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ingestion_spool_bundles').get().n,1);
  // SQLite DEFAULT CURRENT_TIMESTAMP follows the real CI wall clock; the
  // FIFO redrive test must pin a genuine 12-minute-old pending bundle
  // relative to its own fixed NOW fixture, not rely on runner start time.
  f.db.prepare('UPDATE ingestion_spool_bundles SET created_at=?').run(at);
  f.env.INGEST_QUEUE.send=async body=>f.env.INGEST_QUEUE.sent.push(body);
  const redrive=await drainBacklog(f.env,{now:NOW+12*60000});
  assert.equal(redrive.count,1);
  assert.equal(redrive.bundles_selected,1);
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  const done=await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(done.bundles?.committed,1);
  assert.equal(records[0].ackCount,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM normalized_articles').get().n,35);
 }finally{f.close()}
});


test('same-window three-source P0-A poll uses one mixed B2 bundle before cursor advancement',async()=>{
 const f=fixture();
 try{
  const add=f.db.prepare(
   'INSERT INTO source_registry(source_id,canonical_endpoint,parser_type,intended_category,'+
   'country_iso3,rights_tier,polling_interval_sec,rate_limit_backoff) VALUES (?,?,?,?,?,?,?,?)');
  for(const [id,href] of [['src_second','https://example.org/second'],
                            ['src_third','https://example.org/third']]){
   add.run(id,href,'RSS_2','GEOPOLITICS','GLOBAL','RESEARCH_ONLY',
    300,'{"max_retries":1,"base_delay_ms":100,"respect_retry_after":true}');
  }
  f.env.GEOMACRO_P0B_ADMISSION_ACTIVE='1';
  const fetchImpl=async url=>{
   const title=String(url).includes('second')?'Second country report':
    String(url).includes('third')?'Third minerals policy':'First macro policy';
   const raw='<rss><channel><item><title>'+title+'</title>'+
    '<link>https://example.org/story/'+title.replaceAll(' ','-')+'</link>'+
    '<pubDate>Wed, 04 Nov 2026 02:00:00 GMT</pubDate></item></channel></rss>';
   return new Response(raw,{status:200,headers:{etag:'"batch-v1"'}});
  };
  const results=await pollP0aSources(f.env,{fetchImpl,now:NOW,limit:3,producerManager:f.manager});
  assert.equal(results.due_selected,3);
  assert.ok(results.receipts.every(x=>x.state==='OBSERVED'));
  assert.equal(f.objects.size,1);
  assert.equal(f.requests.filter(x=>x.method==='PUT').length,1);
  assert.equal(f.env.INGEST_QUEUE.sent.length,1);
  assert.match(f.env.INGEST_QUEUE.sent[0].b2Uri,/\/mixed\/bundle_/u);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ingestion_spool_queue').get().n,3);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM source_registry WHERE last_cursor=?')
   .get('etag:"batch-v1"').n,3);
  const {records,batch}=messages(f.env.INGEST_QUEUE.sent);
  const consumed=await handleQueueBatch(batch,f.env,{manager:f.manager,now:NOW_DATE});
  assert.equal(consumed.bundles?.committed,1);
  assert.equal(records[0].ackCount,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM normalized_articles").get().n,3);
 }finally{f.close()}
});


test('transient B2 transport failure retries EXACT same encrypted PUT once with new quota reservation',async()=>{
 const f=fixture();
 try{
  let tries=0;const urls:string[]=[],bytes:Uint8Array[]=[];
  const manager=new B2SpoolManager(f.env,{
   now:NOW_DATE,reserve:async()=>{f.requests.push({method:'QUOTA',key:'reserved'});},
   fetchImpl:async(url,opts)=>{
    if(opts.method==='PUT'){
     tries++;urls.push(url);bytes.push(opts.body instanceof ArrayBuffer?new Uint8Array(opts.body):Uint8Array.from(opts.body));
     if(tries===1)throw new TypeError('temporary connection closed');
    }
    return f.fetchImpl(url,opts);
   }
  });
  const c=await candidate(3001);
  const receipt=await manager.spoolAndVerify({
   candidateSha256:c.candidateSha256,sourceId:c.sourceId,
   rawPayload:c.raw,discoveredAt:at,headers:{}
  });
  assert.equal(tries,2);
  assert.deepEqual(urls,[urls[0],urls[0]]);
  assert.deepEqual(bytes[0],bytes[1]);
  assert.equal(bytes[0].length>0,true);
  assert.equal(f.objects.size,1);
  assert.equal(f.requests.filter(x=>x.method==='QUOTA').length,3);
  assert.equal(receipt.sha256,c.candidateSha256);
  const original=await manager.readVerified(receipt.b2Uri,c.candidateSha256,c.sourceId);
  assert.deepEqual(original.rawPayload,c.raw);
 }finally{f.close()}
});
test('B2 provider HTTP 403 is never retried, and no candidate is marked durable',async()=>{
 const f=fixture();
 try{
  let attempts=0,reservations=0;
  const manager=new B2SpoolManager(f.env,{
   now:NOW_DATE,reserve:async()=>{reservations++},
   fetchImpl:async()=>{attempts++;return new Response(null,{status:403})}
  });
  const c=await candidate(3002);
  await assert.rejects(manager.spoolAndVerify({
   candidateSha256:c.candidateSha256,sourceId:c.sourceId,
   rawPayload:c.raw,discoveredAt:at,headers:{}
  }),/P0B_B2_PUT_HTTP_403/u);
  assert.equal(attempts,1);
  assert.equal(reservations,1);
  assert.equal(f.objects.size,0);
 }finally{f.close()}
});
test('two failed B2 transport attempts never fabricate a successful PUT or D1 pointer',async()=>{
 const f=fixture();
 try{
  let attempts=0,reservations=0;
  const manager=new B2SpoolManager(f.env,{
   now:NOW_DATE,reserve:async()=>{reservations++},
   fetchImpl:async()=>{attempts++;throw new TypeError('simulated B2 network failure')}
  });
  const c=await candidate(3003);
  await assert.rejects(manager.spoolAndVerify({
   candidateSha256:c.candidateSha256,sourceId:c.sourceId,
   rawPayload:c.raw,discoveredAt:at,headers:{}
  }),/P0B_B2_PUT_TRANSPORT_UNAVAILABLE/u);
  assert.equal(attempts,2);
  assert.equal(reservations,2);
  assert.equal(f.objects.size,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM normalized_articles').get().n,0);
 }finally{f.close()}
});

test('backblaze HTTP 307 never follows arbitrary redirect or retries signed B2 PUT',async()=>{
 const f=fixture();
 try{
  let attempts=0,reservations=0;
  const manager=new B2SpoolManager(f.env,{
   now:NOW_DATE,reserve:async()=>{reservations++},
   fetchImpl:async(_url,opts)=>{
    attempts++;
    assert.equal(opts.redirect,'manual');
    return new Response(null,{status:307,
     headers:{location:'https://untrusted.example.net/steal-upload'}});
   },
  });
  const c=await candidate(3004);
  await assert.rejects(manager.spoolAndVerify({
   candidateSha256:c.candidateSha256,sourceId:c.sourceId,
   rawPayload:c.raw,discoveredAt:at,headers:{}
  }),/P0B_B2_PUT_HTTP_307/u);
  assert.equal(attempts,1);
  assert.equal(reservations,1);
  assert.equal(f.objects.size,0);
 }finally{f.close()}
});

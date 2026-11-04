/** P0-B microbatch producer: one B2 encrypted gzip bundle per <=100
 * cross-source candidates. Exact remote GET+SHA precedes D1 journal and
 * one Queue dispatch per bundle. No cursor advances on failed durability.
 */
import {B2SpoolManager,p0bSha256} from '../storage/b2-spool-manager.ts';
import {canonicalJson} from '../lib/canonical-json.ts';
import type {B2SpoolEnv,SpoolPayload} from '../storage/b2-spool-manager.ts';
export type IngestCandidate={candidateSha256:string;sourceId:string;raw:unknown};
export type ProducerEnv=B2SpoolEnv&{INGEST_QUEUE:{send:(message:unknown)=>Promise<void>}};
type ProducerOptions={manager?:Pick<B2SpoolManager,'spoolBundleAndVerify'>;now?:()=>Date};
const SHA=/^[a-f0-9]{64}$/u,SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const LIMIT=100,MAX_BYTES=320*1024,MAX_ITEM_BYTES=256*1024;
const encoder=new TextEncoder();
const failureCode=(error:unknown)=>{
 const m=error instanceof Error?error.message:'P0B_PRODUCER_FAILURE';
 return /^P0B_[A-Z0-9_]{3,80}$/u.test(m)?m:'P0B_PRODUCER_FAILURE';
};
function holdMillis(code:string,date:Date){
 if(code==='P0B_B2_QUOTA_HELD')return Math.max(60000,
  Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)-date.getTime());
 if(/^P0B_B2_(?:PUT|GET)_HTTP_(?:401|403)$/u.test(code)||
  code==='P0B_B2_BUNDLE_INTEGRITY_MISMATCH'||code==='P0B_BUNDLE_AUTHENTICATION_FAILED')
  return 3600000;
 if(/^P0B_B2_(?:PUT|GET)_(?:HTTP_[0-9]{3}|UNAVAILABLE)$/u.test(code))
  return 300000;
 return 0;
}
async function hold(env:ProducerEnv,code:string,until:string){
 await env.DB.prepare(
  'INSERT INTO p0b_storage_circuit(singleton,hold_until,last_error_code,updated_at) '+
  'VALUES (1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET '+
  'hold_until=CASE WHEN p0b_storage_circuit.hold_until>excluded.hold_until '+
  'THEN p0b_storage_circuit.hold_until ELSE excluded.hold_until END,'+
  'last_error_code=excluded.last_error_code,updated_at=excluded.updated_at'
 ).bind(until,code,new Date().toISOString()).run();
}
type Pending={candidate:IngestCandidate;payload:SpoolPayload;bytes:number};
export async function processFetchedBatch(candidates:IngestCandidate[],
 env:ProducerEnv,opts:ProducerOptions={}){
 if(!Array.isArray(candidates)||!env?.DB?.prepare||!env?.DB?.batch||
  !env.INGEST_QUEUE?.send)throw Error('P0B_PRODUCER_CONFIG_INVALID');
 const manager=opts.manager??new B2SpoolManager(env),now=opts.now??(()=>new Date());
 const receipts:any[]=[],seen=new Map<string,string>(),pending:Pending[]=[];
 const guard=await env.DB.prepare(
  'SELECT hold_until FROM p0b_storage_circuit WHERE singleton=1').first();
 let stopCode:string|null=guard?.hold_until>now().toISOString()?
  'P0B_STORAGE_CIRCUIT_HELD':null;
 const status=(candidate:IngestCandidate,kind:string,code?:string)=>
  receipts.push({sha256:candidate.candidateSha256??null,
   source_id:candidate.sourceId??null,status:kind,...(code?{error_code:code}:{})});
 for(const c of candidates){
  if(!c||!SHA.test(c.candidateSha256??'')||!SOURCE.test(c.sourceId??'')){
   receipts.push({sha256:null,source_id:c?.sourceId??null,status:'INVALID_CANDIDATE'});
   continue;
  }
  const seenSource=seen.get(c.candidateSha256);
  if(seenSource){
   status(c,seenSource===c.sourceId?'DUPLICATE_IN_BATCH':'FAILED_NOT_ACKNOWLEDGED',
    seenSource===c.sourceId?undefined:'P0B_DUPLICATE_SHA_SOURCE_CONFLICT');continue;
  }
  seen.set(c.candidateSha256,c.sourceId);
  if(stopCode){status(c,'FAILED_NOT_ACKNOWLEDGED',stopCode);continue;}
  try{
   if(await p0bSha256(canonicalJson(c.raw))!==c.candidateSha256)
    throw Error('P0B_CANDIDATE_IDENTITY_INVALID');
   const old=await env.DB.prepare(
    'SELECT source_id,state,b2_spool_uri,bundle_offset FROM ingestion_spool_queue '+
    'WHERE candidate_sha256=?').bind(c.candidateSha256).first();
   if(old){
    if(old.source_id!==c.sourceId)throw Error('P0B_DUPLICATE_SHA_SOURCE_CONFLICT');
    if(['D1_COMMITTED','ACKNOWLEDGED'].includes(old.state)){
     status(c,'ALREADY_COMMITTED');continue;
    }
    if(['DEAD_LETTER','QUARANTINED'].includes(old.state)){
     status(c,'HELD_FOR_REVIEW');continue;
    }
    if(!['PENDING','RETRY','PROCESSING'].includes(old.state))
     throw Error('P0B_D1_QUEUE_STATE_INVALID');
    try{
     if(old.bundle_offset!==null&&old.bundle_offset!==undefined){
      const bundle=await env.DB.prepare(
       'SELECT bundle_sha256,item_count FROM ingestion_spool_bundles WHERE b2_spool_uri=?'
      ).bind(old.b2_spool_uri).first();
      if(!bundle)throw Error('P0B_BUNDLE_JOURNAL_MISSING');
      await env.INGEST_QUEUE.send({kind:'P0B_BUNDLE_V1',
       b2Uri:old.b2_spool_uri,bundleSha256:bundle.bundle_sha256,
       candidateCount:bundle.item_count});
     }else await env.INGEST_QUEUE.send({
      candidateSha256:c.candidateSha256,sourceId:c.sourceId,b2Uri:old.b2_spool_uri});
     status(c,'QUEUED');
    }catch{status(c,'DURABLE_PENDING_REDISPATCH');}
    continue;
   }
   const length=encoder.encode(canonicalJson({
    candidateSha256:c.candidateSha256,sourceId:c.sourceId,rawPayload:c.raw,
    discoveredAt:now().toISOString()})+'\n').byteLength;
   if(length>MAX_ITEM_BYTES)throw Error('P0B_BUNDLE_ITEM_TOO_LARGE');
   pending.push({candidate:c,bytes:length,payload:{
    candidateSha256:c.candidateSha256,sourceId:c.sourceId,
    rawPayload:c.raw,headers:{},discoveredAt:now().toISOString()}});
  }catch(error){status(c,'FAILED_NOT_ACKNOWLEDGED',failureCode(error));}
 }
 let bundles_created=0,objects_requested=0;
 let cursor=0;
 while(cursor<pending.length){
  const chunk:Pending[]=[];let bytes=0;
  while(cursor<pending.length&&chunk.length<LIMIT&&
   (chunk.length===0||bytes+pending[cursor].bytes<=MAX_BYTES)){
   chunk.push(pending[cursor++]);bytes+=chunk[chunk.length-1].bytes;
  }
  if(stopCode){
   for(const p of chunk)status(p.candidate,'FAILED_NOT_ACKNOWLEDGED',stopCode);
   continue;
  }
  try{
   objects_requested++;
   const verified=await manager.spoolBundleAndVerify(chunk.map(x=>x.payload));
   if(verified.items.length!==chunk.length)throw Error('P0B_BUNDLE_ITEM_READBACK_MISMATCH');
   const registeredAt=now().toISOString();
   const commands=[env.DB.prepare(
    'INSERT INTO ingestion_spool_bundles(id,bundle_sha256,b2_spool_uri,b2_byte_size,item_count,state) '+
    "VALUES (?,?,?,?,?,'PENDING') ON CONFLICT(bundle_sha256) DO NOTHING"
   ).bind(crypto.randomUUID(),verified.batchSha256,verified.b2Uri,
    verified.byteSize,verified.items.length)];
   for(const item of verified.items){
    commands.push(env.DB.prepare(
     'INSERT INTO ingestion_spool_queue '+
     '(id,candidate_sha256,source_id,b2_spool_uri,b2_byte_size,bundle_offset,bundle_length,state) '+
     "VALUES (?,?,?,?,?,?,?,'PENDING') ON CONFLICT(candidate_sha256) DO NOTHING"
    ).bind(crypto.randomUUID(),item.candidateSha256,item.sourceId,
     verified.b2Uri,verified.byteSize,item.byteOffset,item.byteLength));
   }
   // A partial D1 batch or cross-source identity conflict never counts as durable.
   await env.DB.batch(commands);
   const registered=await env.DB.prepare(
    'SELECT bundle_sha256,item_count,state,b2_byte_size FROM ingestion_spool_bundles '+
    'WHERE b2_spool_uri=?').bind(verified.b2Uri).first();
   const stored=await env.DB.prepare(
    'SELECT candidate_sha256,source_id,bundle_offset,bundle_length '+
    'FROM ingestion_spool_queue WHERE b2_spool_uri=?'
   ).bind(verified.b2Uri).all();
   if(registered?.bundle_sha256!==verified.batchSha256||
    registered.item_count!==chunk.length||registered.b2_byte_size!==verified.byteSize||
    (stored.results??[]).length!==chunk.length)
    throw Error('P0B_BUNDLE_D1_READBACK_FAILED');
   const bySha=new Map((stored.results??[]).map((r:any)=>[r.candidate_sha256,r]));
   for(const item of verified.items){
    const r:any=bySha.get(item.candidateSha256);
    if(!r||r.source_id!==item.sourceId||r.bundle_offset!==item.byteOffset||
     r.bundle_length!==item.byteLength)throw Error('P0B_BUNDLE_D1_READBACK_FAILED');
   }
   bundles_created++;
   let kind='QUEUED';
   try{await env.INGEST_QUEUE.send({kind:'P0B_BUNDLE_V1',
    b2Uri:verified.b2Uri,bundleSha256:verified.batchSha256,
    candidateCount:chunk.length});}
   catch{kind='DURABLE_PENDING_REDISPATCH';}
   for(const p of chunk)status(p.candidate,kind);
  }catch(error){
   const code=failureCode(error);
   for(const p of chunk)status(p.candidate,'FAILED_NOT_ACKNOWLEDGED',code);
   const millis=holdMillis(code,now());
   if(millis){
    stopCode='P0B_STORAGE_CIRCUIT_HELD';
    try{await hold(env,code,new Date(now().getTime()+millis).toISOString())}
    catch{/* failure not accepted; no source cursor advancement */}
   }
  }
 }
 const unaccepted=receipts.filter(x=>x.status==='FAILED_NOT_ACKNOWLEDGED'||
  x.status==='INVALID_CANDIDATE'||x.status==='HELD_FOR_REVIEW').length;
 return {schema:'geomacro.p0b.producer-microbatch.v1',
  examined:candidates.length,receipts,unaccepted,all_durable:unaccepted===0,
  bundles_created,objects_requested,no_news_silently_dropped:true,
  paid_published:false};
}

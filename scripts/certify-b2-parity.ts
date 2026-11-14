#!/usr/bin/env node
/** Bounded D1-indexed independent B2/R2 object readback; no bucket listing. */
import {createHash,createHmac,createDecipheriv} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createB2Client} from './ops/b2-s3-client.mjs';
import {ORIGIN,need,envString,api,canonicalD1,queryD1,canonicalContentSha256,canonical,signedReport,holdError,SHA_RE,persist} from './release-common.ts';
const B2_ENDPOINT='https://s3.us-east-005.backblazeb2.com',B2_BUCKET='geomacro-private-archive';
const QUEUES=['geomacro-ingestion-spool','geomacro-ingestion-dead-letter','geomacro-source-poll','geomacro-source-poll-dlq'];
const MAX=Number(process.env.PARITY_MAX_B2_READS||'250');
const hmac=(key:string|Buffer,data:string)=>createHmac('sha256',key).update(data).digest();
async function admin(path:string){
 const bearer=envString('CONTROL_PLANE_TOKEN',64);
 need(/^[a-f0-9]{64}$/i.test(bearer),'PARITY_OWNER_BEARER_INVALID');
 const res=await fetch(ORIGIN+path,{headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
 const raw=await res.text();need(res.status===200&&raw.length<800000,'PARITY_CONTROL_PLANE_RESPONSE_UNAVAILABLE');
 const b=JSON.parse(raw);need(b.ok===true,'PARITY_CONTROL_PLANE_DENIED');return b;
}
async function remoteManifest(prefix:string){
 const pages=[],seen=new Set<string>();let cursor='';
 while(true){
  const page=await admin('/v1/internal/p0b/parity-manifest?limit=25'+(cursor?'&after='+encodeURIComponent(cursor):''));
  need(page.schema==='geomacro.p0b-remote-manifest-page.v1'&&Array.isArray(page.rows)&&page.rows.length<=25,'PARITY_MANIFEST_PAGE_INVALID');
  for(const row of page.rows){
   need(SHA_RE.test(row.batch_id)&&SHA_RE.test(row.b2_object_sha256)&&row.b2_uri?.startsWith('b2://'+prefix)&&
    Number.isSafeInteger(row.item_count)&&row.item_count>0&&row.item_count<=100&&!seen.has(row.batch_id),'PARITY_INDEX_INVALID');
   seen.add(row.batch_id);pages.push(row);
   need(pages.length<=MAX,'PARITY_READ_BUDGET_PARTIAL');
  }
  if(page.complete===true&&page.next_cursor===null)return pages.sort((a,b)=>a.batch_id.localeCompare(b.batch_id));
  need(SHA_RE.test(page.next_cursor??'')&&page.next_cursor!==cursor,'PARITY_CURSOR_INVALID');cursor=page.next_cursor;
 }
}
function verifyEncryptedBatch(bytes:Buffer,batch:string,count:number){
 need(bytes.length<1024*1024,'PARITY_OBJECT_OVERSIZED');
 const o=JSON.parse(gunzipSync(bytes,{maxOutputLength:1024*1024}).toString('utf8'));
 need(o.schema==='geomacro.p0b.encrypted-microbatch.v1'&&o.algorithm==='AES-256-GCM'&&o.batch_sha256===batch&&o.item_count===count&&SHA_RE.test(o.compressed_sha256),'PARITY_ENCRYPTED_ENVELOPE_INVALID');
 const nonce=Buffer.from(o.nonce,'base64'),cipher=Buffer.from(o.ciphertext,'base64');
 need(nonce.length===12&&cipher.length>16,'PARITY_AES_GCM_INVALID');
 const key=createHash('sha256').update(envString('B2_SPOOL_ENCRYPTION_KEY',32)).digest();
 const decipher=createDecipheriv('aes-256-gcm',key,nonce);
 decipher.setAAD(Buffer.from('p0b.bundle|'+batch));decipher.setAuthTag(cipher.subarray(-16));
 const compressed=Buffer.concat([decipher.update(cipher.subarray(0,-16)),decipher.final()]);
 need(canonicalContentSha256(compressed)===o.compressed_sha256,'PARITY_CIPHERTEXT_HASH_MISMATCH');
 const plain=gunzipSync(compressed,{maxOutputLength:1024*1024});
 need(canonicalContentSha256(plain)===batch,'PARITY_PLAINTEXT_HASH_MISMATCH');
 const inner=JSON.parse(plain.toString('utf8'));
 need(inner.schema==='geomacro.p0b.microbatch.v1'&&inner.index?.length===count&&
  new Set(inner.index.map((x:any)=>x.candidateSha256)).size===count,'PARITY_ITEM_INDEX_INVALID');
}
async function queueSnapshot(){
 const list=await api('/queues?per_page=100');
 need(Array.isArray(list),'PARITY_QUEUE_LIST_UNAVAILABLE');
 const snap=[];
 for(const name of QUEUES){
  const q=list.filter((x:any)=>x.queue_name===name);
  need(q.length===1&&typeof q[0].queue_id==='string','PARITY_QUEUE_MISSING');
  const data=await api('/queues/'+q[0].queue_id+'/metrics');
  need(Number.isSafeInteger(data.backlog_count)&&data.backlog_count>=0,'PARITY_QUEUE_METRIC_MISSING');
  snap.push({name,backlog:data.backlog_count});
 }
 need(snap.every(s=>s.backlog===0),'PARITY_QUEUE_BACKLOG_NOT_ZERO');return snap;
}

/** R2 signed GET only against an exact private fallback D1 object key. */
async function r2Request(key:string){
 const account=envString('CLOUDFLARE_ACCOUNT_ID',32),bucket=envString('P0B_PRIVATE_R2_BUCKET');
 need(/^[a-z0-9-]{3,63}$/.test(bucket),'PARITY_R2_BUCKET_INVALID');
 const endpoint=`https://${account}.r2.cloudflarestorage.com`;
 const access=envString('R2_ACCESS_KEY_ID'),secret=envString('R2_SECRET_ACCESS_KEY');
 const region='auto',date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
 const day=date.slice(0,8),empty=canonicalContentSha256('');
 need(/^p0b\/private-fallback\/v1\/[A-Za-z0-9_./-]+$/u.test(key)&&!key.includes('..'),'PARITY_R2_D1_KEY_INVALID');
 const path='/'+bucket+'/'+key.split('/').map(encodeURIComponent).join('/');
 const query='';
 const host=new URL(endpoint).host;
 const header=`host:${host}\nx-amz-content-sha256:${empty}\nx-amz-date:${date}\n`;
 const hNames='host;x-amz-content-sha256;x-amz-date';
 const scope=`${day}/${region}/s3/aws4_request`;
 const toSign=['AWS4-HMAC-SHA256',date,scope,canonicalContentSha256(['GET',path,query,header,hNames,empty].join('\n'))].join('\n');
 const signer=hmac(hmac(hmac(hmac('AWS4'+secret,day),region),'s3'),'aws4_request');
 const sig=createHmac('sha256',signer).update(toSign).digest('hex');
 const res=await fetch(endpoint+path+(query?'?'+query:''),{method:'GET',redirect:'error',
  headers:{'x-amz-content-sha256':empty,'x-amz-date':date,
   Authorization:`AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${hNames}, Signature=${sig}`},
  signal:AbortSignal.timeout(30000)});
 need(res.ok&&!res.redirected,'PARITY_R2_S3_READ_UNAVAILABLE');
 const bytes=Buffer.from(await res.arrayBuffer());
 need(bytes.length<=1536*1024,'PARITY_R2_CIPHERTEXT_OVERSIZED');return bytes;
}
async function verifyR2Physical(){
 const db=await canonicalD1();
 // A 251-row ordered query is a bounded fail-closed limit, not an unbounded COUNT.
 const raw=await queryD1(db.uuid,'SELECT batch_id,object_key,cipher_sha256,item_count,state FROM p0b_private_r2_fallback ORDER BY batch_id LIMIT 251');
 need(raw.rows.length<=250,'PARITY_R2_TOO_MANY_ROWS_FOR_REQUEST_BUDGET');
 const rows=raw.rows;
 // D1-indexed R2 object checks; the physical namespace cannot be certified.
 const prefix='p0b/private-fallback/v1/';
 for(const row of rows){
  need(SHA_RE.test(row.batch_id)&&SHA_RE.test(row.cipher_sha256)&&
   row.object_key.startsWith(prefix),'PARITY_R2_D1_METADATA_INVALID');
  const bytes=await r2Request(row.object_key);
  need(bytes.length>0&&bytes.length<=1536*1024&&canonicalContentSha256(bytes)===row.cipher_sha256,
   'PARITY_R2_CIPHERTEXT_SHA_MISMATCH');
  // Verify AEAD, not merely the object digest: a cached encrypted blob that
  // can no longer be restored is NOT a valid archive recovery path.
  const envelope=JSON.parse(gunzipSync(bytes,{maxOutputLength:1536*1024}).toString('utf8'));
  need(envelope.schema==='geomacro.p0b.r2-fallback-aead.v1'&&
    envelope.batch_id===row.batch_id&&SHA_RE.test(envelope.plain_sha256),
    'PARITY_R2_AEAD_ENVELOPE_INVALID');
  const nonce=Buffer.from(envelope.nonce,'base64');
  const cipher=Buffer.from(envelope.ciphertext,'base64');
  need(nonce.length===12&&cipher.length>=17,'PARITY_R2_AEAD_NONCE_INVALID');
  const secret=createHash('sha256').update(envString('B2_SPOOL_ENCRYPTION_KEY',32)).digest();
  const dec=createDecipheriv('aes-256-gcm',secret,nonce);
  dec.setAAD(Buffer.from('p0b-r2-fallback|'+row.batch_id));
  dec.setAuthTag(cipher.subarray(-16));
  const restored=Buffer.concat([dec.update(cipher.subarray(0,-16)),dec.final()]);
  need(restored.length<=512*1024&&canonicalContentSha256(restored)===envelope.plain_sha256,
    'PARITY_R2_PLAINTEXT_SHA_UNVERIFIED');
  const doc=JSON.parse(restored.toString('utf8'));
  need(Array.isArray(doc.items)&&doc.items.length===row.item_count&&
    doc.items.every((item:any)=>typeof item.sourceId==='string'&&SHA_RE.test(item.candidateSha256))&&
    canonicalContentSha256(doc.items.map((item:any)=>item.sourceId+'|'+item.candidateSha256).sort().join('\n'))===row.batch_id,
    'PARITY_R2_MEMBER_MANIFEST_UNVERIFIED');
 }
 return {r2_aes_gcm_and_member_manifest_verified:true,objects_verified:rows.length,
  d1_r2_manifest_sha256:canonicalContentSha256(canonical(rows)),all_r2_objects_physically_enumerated:false,
  r2_unindexed_orphans_not_ruled_out:true};
}

async function main(){
 need(process.env.B2_ACCOUNT_QUOTA_REQUIRED==='1'&&
  Number.isSafeInteger(MAX)&&MAX>=1&&MAX<=250,'PARITY_ACCOUNT_BUDGET_UNAVAILABLE');
 const status=await admin('/v1/internal/p0b/status');
 const prefix=status.b2_spool_scope?.prefix;
 need(typeof prefix==='string'&&/^geomacro-evidence\/v1\/(?:[A-Za-z0-9_-]+\/)*spool\/$/.test(prefix),'PARITY_LIVE_PREFIX_INVALID');
 const before=await admin('/v1/internal/activation/hot50-census');
 // Persist only known numeric counters. No B2 request, source content,
 // credentials or licensing claims are emitted by this diagnostic.
 const safeCount=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0?x:null;
 const backlog=before?.backlog??{};
 persist('artifacts/release/hot50-b2-d1-backlog-diagnostic.json',{
  schema:'geomacro.hot50-b2-d1-backlog-diagnostic.v1',
  observed_at:new Date().toISOString(),
  census_schema_valid:before?.schema==='geomacro.hot50-production-activation-census.v1',
  total_unhandled:safeCount(backlog.total_unhandled),
  exact_bundle_journal_mismatch:safeCount(backlog.exact_bundle_journal_mismatch),
  archived_outboxes:safeCount(backlog.archived_outboxes),
  pending_outbox:safeCount(backlog.outbox),
  pending_r2_fallback:safeCount(backlog.r2),
  d1_zero_unhandled_proven:backlog.d1_zero_unhandled_proven===true,
  indexed_physical_b2_parity_verified:false,full_bucket_inventory_verified:false,
  b2_requests:0,provider_mutations:0,payments:0,diagnosis_only:true
 });

 need(before.schema==='geomacro.hot50-production-activation-census.v1'&&before.backlog?.total_unhandled===0&&
  before.backlog?.exact_bundle_journal_mismatch===0,'PARITY_D1_BACKLOG_NOT_ZERO');
 const snap1=await queueSnapshot();
 const expected=await remoteManifest(prefix);
 need(expected.length>0&&expected.length===before.backlog.archived_outboxes,'PARITY_D1_MANIFEST_COUNT_MISMATCH');
 // Never enumerate Backblaze B2: repository's no-list provider quota guard.
 // Verified D1-indexed B2 GETs do not prove absence of orphaned B2 objects.
 const b2=createB2Client({endpointUrl:B2_ENDPOINT,bucket:B2_BUCKET,
  accessKey:envString('B2_KEY_ID'),secretKey:envString('B2_APPLICATION_KEY'),allowedKeyPrefixes:[prefix]});
 for(const row of expected){const bytes=await b2.get(row.b2_uri.slice(5));
  verifyEncryptedBatch(bytes,row.b2_object_sha256,row.item_count);
 }
 const end=await remoteManifest(prefix);
 need(canonical(end)===canonical(expected),'PARITY_D1_CHANGED_DURING_AUDIT');
 const after=await admin('/v1/internal/activation/hot50-census');
 need(after.backlog?.total_unhandled===0&&after.backlog?.exact_bundle_journal_mismatch===0&&
  after.backlog.archived_outboxes===expected.length,'PARITY_D1_CHANGED_OR_BACKLOG_RECURRED');
 const snap2=await queueSnapshot();
 // D1-indexed R2 ciphertext GET and AES-GCM verification only.
 const r2=await verifyR2Physical();
 need((after.backlog?.r2??-1)===0,'PARITY_R2_FALLBACK_NOT_RECONCILED');
 const receipt={schema:'geomacro.b2-d1-physical-parity.v1',status:'HOLD',verified_at:new Date().toISOString(),
  scope:'D1_INDEXED_B2_R2_READBACK_ONLY',scope_prefix:prefix,
  archive_batch_count:expected.length,d1_manifest_sha256:canonicalContentSha256(canonical(expected)),
  physical_list_complete:false,bidirectional_parity_pass:false,
  b2_unindexed_orphans_not_ruled_out:true,
  each_d1_indexed_b2_get_aes_gcm_sha256_verified:true,ordered_d1_start_end_unchanged:true,
  four_queues_start:snap1,four_queues_end:snap2,all_queue_snapshots_zero:true,
  unresolved_r2_fallback_count:0,...r2,provider_b2_listing_calls:0,
  existing_no_list_quota_policy_preserved:true,worker_storage_modified:false,payments_authorized:false};
 signedReport('artifacts/release/b2-physical-parity-certificate.json',receipt);
 console.log(JSON.stringify({status:'HOLD',code:'B2_FULL_PHYSICAL_INVENTORY_NOT_PROVEN',
  d1_indexed_readback:'PASS',batches:expected.length,scope:prefix}));
 process.exitCode=3;
}
main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),certificate_not_issued:true}));process.exitCode=2});
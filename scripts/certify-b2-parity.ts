#!/usr/bin/env node
/** Fully paginated, exact-key B2↔D1 and optional R2↔manifest readback. */
import {createHash,createHmac,createDecipheriv} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readFileSync,existsSync} from 'node:fs';
import {createB2Client} from './ops/b2-s3-client.mjs';
import {createB2D1AccountGovernor} from './ops/b2-d1-account-governor.mjs';
import {ORIGIN,need,envString,api,canonicalD1,queryD1,sha256,canonical,signedReport,holdError,SHA_RE} from './release-common.ts';
const B2_ENDPOINT='https://s3.us-east-005.backblazeb2.com',B2_BUCKET='geomacro-private-archive',REGION='us-east-005';
const QUEUES=['geomacro-ingestion-spool','geomacro-ingestion-dead-letter','geomacro-source-poll','geomacro-source-poll-dlq'];
const MAX=Number(process.env.PARITY_MAX_B2_READS||'250');
const MAX_PAGES=Number(process.env.PARITY_MAX_B2_LIST_PAGES||'5');
const hmac=(key:string|Buffer,data:string)=>createHmac('sha256',key).update(data).digest();
// S3 ListObjectsV2 requests encoding-type=url. Read provider XML tokens as-is:
// never XML-unescape and then URI-unescape the same untrusted value (CodeQL
// double-decoding finding). Entity-containing keys/tokens HOLD rather than
// silently changing a physical object identity.
function xmlText(xml:string,tag:string){
 const m=new RegExp(`<${tag}>([^<]{0,4096})</${tag}>`,'u').exec(xml);
 if(!m||m[1].includes('&'))return null;
 return m[1];
}
function exactPhysicalKey(raw:string|null,prefix:string){
 need(typeof raw==='string'&&/^(?:[A-Za-z0-9._~/-]|%[0-9a-fA-F]{2}){1,4096}$/u.test(raw),
  'PARITY_S3_URL_ENCODED_KEY_INVALID');
 let decoded:string;
 try{decoded=decodeURIComponent(raw)}catch{throw Error('PARITY_S3_KEY_PERCENT_DECODING_FAILED')}
 need(/^[A-Za-z0-9_./-]+$/u.test(decoded)&&!decoded.includes('..')&&
  decoded.startsWith(prefix),'PARITY_S3_KEY_OUT_OF_SCOPE');
 return decoded;
}
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
async function listPhysicalB2(prefix:string):Promise<string[]>{
 need(process.env.B2_LIST_ALLOWED==='1','PARITY_B2_LIST_OWNER_AUTHORIZATION_REQUIRED');
 need(Number.isSafeInteger(MAX_PAGES)&&MAX_PAGES>=1&&MAX_PAGES<=20,'PARITY_B2_LIST_PAGE_BUDGET');
 const access=envString('B2_KEY_ID'),secret=envString('B2_APPLICATION_KEY');
 const governor=createB2D1AccountGovernor();
 const keys:string[]=[];let continuation='';
 for(let page=0;page<MAX_PAGES;page++){
  // The existing ledger has GET/HEAD/PUT/NATIVE_AUTH only; reserve GET as a
  // conservative TOTAL B2 request ticket for this special owner-only LIST.
  // This is NOT a separately certified Backblaze Class-C transaction cap.
  await governor.reserve('GET');
  const params=new URLSearchParams({'list-type':'2','encoding-type':'url','max-keys':'1000',prefix});
  if(continuation)params.set('continuation-token',continuation);
  const query=[...params].sort(([a],[b])=>a.localeCompare(b))
   .map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  const path='/'+B2_BUCKET+'/';const host=new URL(B2_ENDPOINT).host;
  const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');const day=date.slice(0,8);
  const empty=sha256('');const headers=`host:${host}\nx-amz-content-sha256:${empty}\nx-amz-date:${date}\n`;
  const signedHeaders='host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest=['GET',path,query,headers,signedHeaders,empty].join('\n');
  const scope=`${day}/${REGION}/s3/aws4_request`;
  const toSign=['AWS4-HMAC-SHA256',date,scope,sha256(canonicalRequest)].join('\n');
  const key=hmac(hmac(hmac(hmac('AWS4'+secret,day),REGION),'s3'),'aws4_request');
  const sig=createHmac('sha256',key).update(toSign).digest('hex');
  const res=await fetch(`${B2_ENDPOINT}${path}?${query}`,{headers:{'x-amz-content-sha256':empty,'x-amz-date':date,
   Authorization:`AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`},
   redirect:'error',signal:AbortSignal.timeout(30000)});
  const xml=await res.text();
  need(res.ok&&xml.length<3000000&&!/<!DOCTYPE|<!ENTITY/i.test(xml)&&xml.includes('<ListBucketResult'),'PARITY_B2_LIST_FAILED');
  for(const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
   const encoded=xmlText(m[1],'Key');need(encoded!==null,'PARITY_B2_LIST_KEY_MISSING');
   const objectKey=exactPhysicalKey(encoded,prefix);
    need(!keys.includes(objectKey),'PARITY_B2_LIST_ORDER_OR_PREFIX_INVALID');
   keys.push(objectKey);need(keys.length<=MAX,'PARITY_B2_FULL_LIST_OVER_BUDGET');
  }
  if(xmlText(xml,'IsTruncated')==='false')return keys.sort();
  continuation=xmlText(xml,'NextContinuationToken')??'';
  need(continuation.length>0&&continuation.length<4096&&
   /^(?:[A-Za-z0-9._~+/-]|%[0-9a-fA-F]{2}|=)+$/u.test(continuation),
   'PARITY_B2_PAGINATION_INCOMPLETE');
 }
 throw Error('PARITY_B2_PAGINATION_INCOMPLETE');
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
 need(sha256(compressed)===o.compressed_sha256,'PARITY_CIPHERTEXT_HASH_MISMATCH');
 const plain=gunzipSync(compressed,{maxOutputLength:1024*1024});
 need(sha256(plain)===batch,'PARITY_PLAINTEXT_HASH_MISMATCH');
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

/** R2 signed GET/LIST against the exact private fallback D1 ledger. */
async function r2Request(key:string|null,continuation:string|null=null){
 const account=envString('CLOUDFLARE_ACCOUNT_ID',32),bucket=envString('P0B_PRIVATE_R2_BUCKET');
 need(/^[a-z0-9-]{3,63}$/.test(bucket),'PARITY_R2_BUCKET_INVALID');
 const endpoint=`https://${account}.r2.cloudflarestorage.com`;
 const access=envString('R2_ACCESS_KEY_ID'),secret=envString('R2_SECRET_ACCESS_KEY');
 const region='auto',date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
 const day=date.slice(0,8),empty=sha256('');
 const path=key?'/'+bucket+'/'+key.split('/').map(encodeURIComponent).join('/'):'/'+bucket+'/';
 let query='';
 if(!key){
  const params=new URLSearchParams({'list-type':'2','encoding-type':'url','max-keys':'1000',prefix:'p0b/private-fallback/v1/'});
  if(continuation)params.set('continuation-token',continuation);
  query=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
 }
 const host=new URL(endpoint).host;
 const header=`host:${host}\nx-amz-content-sha256:${empty}\nx-amz-date:${date}\n`;
 const hNames='host;x-amz-content-sha256;x-amz-date';
 const scope=`${day}/${region}/s3/aws4_request`;
 const toSign=['AWS4-HMAC-SHA256',date,scope,sha256(['GET',path,query,header,hNames,empty].join('\n'))].join('\n');
 const signer=hmac(hmac(hmac(hmac('AWS4'+secret,day),region),'s3'),'aws4_request');
 const sig=createHmac('sha256',signer).update(toSign).digest('hex');
 const res=await fetch(endpoint+path+(query?'?'+query:''),{method:'GET',redirect:'error',
  headers:{'x-amz-content-sha256':empty,'x-amz-date':date,
   Authorization:`AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${hNames}, Signature=${sig}`},
  signal:AbortSignal.timeout(30000)});
 need(res.ok&&!res.redirected,'PARITY_R2_S3_READ_UNAVAILABLE');
 return key?Buffer.from(await res.arrayBuffer()):await res.text();
}
async function verifyR2Physical(){
 const db=await canonicalD1();
 // A 251-row ordered query is a bounded fail-closed limit, not an unbounded COUNT.
 const raw=await queryD1(db.uuid,'SELECT batch_id,object_key,cipher_sha256,item_count,state FROM p0b_private_r2_fallback ORDER BY batch_id LIMIT 251');
 need(raw.rows.length<=250,'PARITY_R2_TOO_MANY_ROWS_FOR_REQUEST_BUDGET');
 const rows=raw.rows;
 const prefix='p0b/private-fallback/v1/',physical:string[]=[];
 let continuation:string|null=null;
 for(let n=0;n<5;n++){
  const xml=await r2Request(null,continuation);
  need(xml.length<3000000&&!/<!DOCTYPE|<!ENTITY/i.test(xml)&&xml.includes('<ListBucketResult'),'PARITY_R2_LIST_INVALID');
  for(const c of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
   const encoded=xmlText(c[1],'Key');need(!!encoded,'PARITY_R2_LIST_KEY_MISSING');
   const key=exactPhysicalKey(encoded,prefix);
   physical.push(key);need(physical.length<=250,'PARITY_R2_READ_BUDGET_PARTIAL');
  }
  if(xmlText(xml,'IsTruncated')==='false'){continuation=null;break}
  continuation=xmlText(xml,'NextContinuationToken');
   need(!!continuation&&continuation.length<4096&&
    /^(?:[A-Za-z0-9._~+/-]|%[0-9a-fA-F]{2}|=)+$/u.test(continuation),
    'PARITY_R2_TRUNCATION_UNKNOWN');
 }
 need(continuation===null,'PARITY_R2_PAGINATION_INCOMPLETE');
 const wanted=rows.map(r=>r.object_key).sort();
 need(canonical([...physical].sort())===canonical(wanted),'PARITY_R2_MISSING_OR_ORPHAN_CIPHERTEXT');
 for(const row of rows){
  need(SHA_RE.test(row.batch_id)&&SHA_RE.test(row.cipher_sha256)&&
   row.object_key.startsWith(prefix),'PARITY_R2_D1_METADATA_INVALID');
  const bytes=await r2Request(row.object_key);
  need(bytes.length>0&&bytes.length<=1536*1024&&sha256(bytes)===row.cipher_sha256,
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
  need(restored.length<=512*1024&&sha256(restored)===envelope.plain_sha256,
    'PARITY_R2_PLAINTEXT_SHA_UNVERIFIED');
  const doc=JSON.parse(restored.toString('utf8'));
  need(Array.isArray(doc.items)&&doc.items.length===row.item_count&&
    doc.items.every((item:any)=>typeof item.sourceId==='string'&&SHA_RE.test(item.candidateSha256))&&
    sha256(doc.items.map((item:any)=>item.sourceId+'|'+item.candidateSha256).sort().join('\n'))===row.batch_id,
    'PARITY_R2_MEMBER_MANIFEST_UNVERIFIED');
 }
 return {r2_aes_gcm_and_member_manifest_verified:true,objects_verified:rows.length,d1_r2_manifest_sha256:sha256(canonical(rows)),
  r2_physical_list_sha256:sha256(canonical(wanted)),all_r2_objects_physically_enumerated:true};
}

async function main(){
 need(process.env.B2_ACCOUNT_QUOTA_REQUIRED==='1'&&
  Number.isSafeInteger(MAX)&&MAX>=1&&MAX<=250,'PARITY_ACCOUNT_BUDGET_UNAVAILABLE');
 const status=await admin('/v1/internal/p0b/status');
 const prefix=status.b2_spool_scope?.prefix;
 need(typeof prefix==='string'&&/^geomacro-evidence\/v1\/(?:[A-Za-z0-9_-]+\/)*spool\/$/.test(prefix),'PARITY_LIVE_PREFIX_INVALID');
 const before=await admin('/v1/internal/activation/hot50-census');
 need(before.schema==='geomacro.hot50-production-activation-census.v1'&&before.backlog?.total_unhandled===0&&
  before.backlog?.exact_bundle_journal_mismatch===0,'PARITY_D1_BACKLOG_NOT_ZERO');
 const snap1=await queueSnapshot();
 const expected=await remoteManifest(prefix);
 need(expected.length>0&&expected.length===before.backlog.archived_outboxes,'PARITY_D1_MANIFEST_COUNT_MISMATCH');
 const physical=await listPhysicalB2(prefix);
 const expectedKeys=expected.map(x=>x.b2_uri.slice(5)).sort();
 need(canonical(physical)===canonical(expectedKeys),'PARITY_B2_HAS_MISSING_OR_UNINDEXED_OBJECTS');
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
 // Full R2 listing and exact ciphertext GET against canonical D1 metadata.
 const r2=await verifyR2Physical();
 need((after.backlog?.r2??-1)===0,'PARITY_R2_FALLBACK_NOT_RECONCILED');
 const receipt={schema:'geomacro.b2-d1-physical-parity.v1',status:'PASS',verified_at:new Date().toISOString(),
  scope_prefix:prefix,archive_batch_count:expected.length,d1_manifest_sha256:sha256(canonical(expected)),
  physical_b2_list_sha256:sha256(canonical(physical)),physical_list_complete:true,
  each_b2_get_aes_gcm_sha256_verified:true,ordered_d1_start_end_unchanged:true,
  four_queues_start:snap1,four_queues_end:snap2,all_queue_snapshots_zero:true,
  unresolved_r2_fallback_count:0,...r2,
  b2_list_class_c_provider_quota_not_separately_proven:true,
  worker_storage_modified:false,payments_authorized:false};
 signedReport('artifacts/release/b2-physical-parity-certificate.json',receipt);
 console.log(JSON.stringify({status:'PASS',batches:expected.length,scope:prefix}));
}
main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),certificate_not_issued:true}));process.exitCode=2});
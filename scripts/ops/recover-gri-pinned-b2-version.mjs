#!/usr/bin/env node
// One old D1-pinned object, one metadata page, one immutable-version GET.
// No retries, alternate credentials, raw output, B2 PUT or product promotion.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createB2D1AccountGovernor} from './b2-d1-account-governor.mjs';
import {readGlobalRiskB2Anchor} from './publish-b2-verified-hot-snapshot.mjs';
import {classifyPinnedGlobalRiskAnchor,verifyPinnedGlobalRiskBaseline} from './verify-global-risk-b2-historical-readback.mjs';
const KEY='geomacro-evidence/v1/live/global-risk/latest.json.gz';
const BUCKET='geomacro-private-archive';
const MAX=2*1024*1024;
const fail=code=>{throw Error('GRI_VERSION_'+code)};
const sha=x=>createHash('sha256').update(x).digest('hex');
async function bounded(response,max){
 if(!response?.body)fail('BODY_MISSING');
 if(Number(response.headers.get('content-length')??0)>max){await response.body.cancel();fail('BODY_OVERSIZE');}
 const reader=response.body.getReader(),chunks=[];let n=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>max)fail('BODY_OVERSIZE');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(chunks);
}
function origin(raw,host){
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('AUTH_ORIGIN_INVALID');return u.origin;}
 catch{fail('AUTH_ORIGIN_INVALID');}
}
export function selectPinnedHistoricalVersion(list,anchor,bucketId){
 if(!Array.isArray(list?.files)||list.files.length>1000)fail('VERSION_LIST_INVALID');
 const generated=Date.parse(anchor.generated_at);
 const candidates=list.files.filter(x=>{
  const at=Number(x?.uploadTimestamp);
  return x?.action==='upload'&&x.fileName===KEY&&x.bucketId===bucketId&&
   /^[A-Za-z0-9_-]{10,240}$/.test(x.fileId??'')&&
   Number.isSafeInteger(x.contentLength)&&x.contentLength>=30&&x.contentLength<=MAX&&
   Number.isSafeInteger(at)&&at>=generated-5*60_000&&at<=generated+15*60_000;
 });
 // Metadata narrows a single candidate; ONLY the pre-existing D1 SHA authorizes bytes.
 // Never enumerate candidate downloads or invent a new anchor from observed content.
 if(candidates.length!==1)fail(candidates.length?'VERSION_SELECTION_AMBIGUOUS':'PINNED_VERSION_NOT_IN_BOUNDED_PAGE');
 return candidates[0];
}
export async function recoverPinnedGriVersion({env=process.env,fetchImpl=fetch,getAnchor=readGlobalRiskB2Anchor,
 governor,now=new Date()}={}){
 for(const [key,value] of Object.entries(env))if(value&&(/^(?:APP_|HISTORICAL_)?SUPABASE_(?:URL|DB_URL|SERVICE_ROLE_KEY|DB_PASSWORD)$/.test(key)||/^COINBASE_.*(?:KEY|SECRET)$/.test(key)))fail('FORBIDDEN_CREDENTIAL');
 if(env.B2_ACCOUNT_QUOTA_REQUIRED!=='1'||env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=='historical_gri_version_recovery'||
  env.B2_REQUEST_BUDGET!=='4'||!env.B2_KEY_ID||!env.B2_APPLICATION_KEY)fail('GOVERNED_RUNTIME_REQUIRED');
 const anchor=await getAnchor();classifyPinnedGlobalRiskAnchor({anchor,now});
 const ledger=governor??createB2D1AccountGovernor({env});let operations=0;
 const request=async(url,kind,init,max)=>{
  if(operations>=4)fail('REQUEST_BOUND_EXCEEDED');
  await ledger.reserve(kind);operations++;
  let r;try{r=await fetchImpl(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('TRANSPORT_UNAVAILABLE');}
  if(!r.ok){await r.body?.cancel();fail('HTTP_'+r.status);}
  return {r,bytes:await bounded(r,max)};
 };
 const json=async(...args)=>{const {bytes}=await request(...args);try{return JSON.parse(bytes.toString('utf8'));}catch{fail('JSON_INVALID');}};
 const auth=await json('https://api.backblazeb2.com/b2api/v4/b2_authorize_account','NATIVE_AUTH',
  {headers:{Authorization:'Basic '+Buffer.from(env.B2_KEY_ID+':'+env.B2_APPLICATION_KEY).toString('base64')}},256*1024);
 const storage=auth?.apiInfo?.storageApi,allowed=storage?.allowed;
 if(typeof auth.authorizationToken!=='string'||!auth.authorizationToken||!Array.isArray(allowed?.capabilities)||!allowed.capabilities.includes('listFiles')||!allowed.capabilities.includes('readFiles'))fail('LIST_AND_READ_CAPABILITIES_REQUIRED');
 if(allowed.namePrefix&&!KEY.startsWith(allowed.namePrefix))fail('PREFIX_NOT_AUTHORIZED');
 const api=origin(storage.apiUrl,'api005.backblazeb2.com'),download=origin(storage.downloadUrl,'f005.backblazeb2.com');
 const headers={Authorization:auth.authorizationToken};
 let buckets=allowed.buckets;
 if(buckets!=null&&!Array.isArray(buckets))fail('BUCKET_SCOPE_INVALID');
 if(!buckets?.length){
  if(!allowed.capabilities.includes('listBuckets')||!/^\w{8,100}$/.test(auth.accountId??''))fail('BUCKET_SCOPE_UNAVAILABLE');
  const u=new URL(api+'/b2api/v4/b2_list_buckets');u.searchParams.set('accountId',auth.accountId);u.searchParams.set('bucketName',BUCKET);
  const listed=await json(u.href,'GET',{headers},256*1024);buckets=listed.buckets;
 }
 const matches=Array.isArray(buckets)?buckets.filter(x=>(x.name??x.bucketName)===BUCKET):[];
 const bucketId=matches.length===1?(matches[0].id??matches[0].bucketId):null;
 if(!/^[a-f0-9]{16,64}$/.test(bucketId??''))fail('BUCKET_SCOPE_INVALID');
 const u=new URL(api+'/b2api/v4/b2_list_file_versions');
 u.searchParams.set('bucketId',bucketId);u.searchParams.set('prefix',KEY);u.searchParams.set('startFileName',KEY);u.searchParams.set('maxFileCount','1000');
 const selected=selectPinnedHistoricalVersion(await json(u.href,'GET',{headers},MAX),anchor,bucketId);
 const d=new URL(download+'/b2api/v4/b2_download_file_by_id');d.searchParams.set('fileId',selected.fileId);
 const {r,bytes}=await request(d.href,'GET',{headers},MAX);
 let name;try{name=decodeURIComponent(r.headers.get('x-bz-file-name')??'');}catch{fail('DOWNLOADED_IDENTITY_INVALID');}
 if(r.headers.get('x-bz-file-id')!==selected.fileId||name!==KEY||bytes.length!==selected.contentLength)fail('DOWNLOADED_IDENTITY_INVALID');
 const {d1_writes:unusedProductWriteCount,...verified}=verifyPinnedGlobalRiskBaseline({anchor,compressed:bytes,now});
 return {...verified,d1_product_writes:0,d1_quota_reservations:operations,schema:'geomacro.gri-immutable-version-readback.v1',
  anchor_key_type:'IMMUTABLE_B2_FILE_VERSION_AT_EXISTING_D1_PIN',immutable_file_version_verified:true,
  immutable_file_id_sha256:sha(selected.fileId),retained_version_uploaded_at:new Date(Number(selected.uploadTimestamp)).toISOString(),
  actual_b2_operations:operations,maximum_b2_operations:4,metadata_page_limit:1,maximum_downloaded_versions:1,
  new_anchor_minted:false,raw_source_content_logged:false,current_gri_qualified:false,
  immutable_historical_lineage_verified:false};
}
if(process.argv[1]?.endsWith('/recover-gri-pinned-b2-version.mjs')){
 try{
  const r=await recoverPinnedGriVersion();mkdirSync('artifacts/gri-b2-history',{recursive:true});
  writeFileSync('artifacts/gri-b2-history/immutable-version-readback.json',JSON.stringify(r,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(r));
 }catch(e){
  const message=e instanceof Error?e.message:'';
  const code=/^GRI_VERSION_[A-Z0-9_]+$/.test(message)?message:
   /^HISTORICAL_GRI_B2_[A-Z0-9_]+$/.test(message)?message:
   /QUOTA/.test(message)?'GRI_VERSION_SHARED_QUOTA_HELD':'GRI_VERSION_READBACK_UNAVAILABLE';
  console.error(JSON.stringify({schema:'geomacro.gri-immutable-version-readback-failure.v1',error_code:code,
   current_gri_qualified:false,publication_performed:false,raw_content_logged:false,b2_puts:0,supabase_requests:0,payments:0}));process.exitCode=2;
 }
}

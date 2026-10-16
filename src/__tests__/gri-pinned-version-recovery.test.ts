import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {recoverPinnedGriVersion,selectPinnedHistoricalVersion} from '../../scripts/ops/recover-gri-pinned-b2-version.mjs';
const now=new Date('2026-10-16T19:00:00.000Z'),KEY='geomacro-evidence/v1/live/global-risk/latest.json.gz';
const bucket='a'.repeat(24),id='4_z_immutable_original_version';
const value={schema:'geomacro.public-global-risk-live.v1',generated_at:'2026-10-08T06:39:43.490Z',source_project:'ldpwajisioljyjtojvfx',data:{snapshotAsOf:'2026-10-08T06:30:00.000Z',verificationStatus:'verified',auditPersisted:true,methodologyVersion:'gri-v1.2.0'}};
const raw=Buffer.from(JSON.stringify(value)),packed=gzipSync(raw),sha=(x:any)=>createHash('sha256').update(x).digest('hex');
const anchor={schema:'geomacro.global-risk-b2-anchor.v1',product:'global-risk',ok:true,b2_object_key:KEY,b2_sha256:sha(packed),payload_sha256:sha(raw),generated_at:value.generated_at,source_run_id:'123456789',baseline_b2_readback_verified:true,baseline_exact_gzip_restore_verified:true,anchor_kind:'prior_b2_baseline_of_independent_gri_proof'};
const entry={fileId:id,fileName:KEY,bucketId:bucket,action:'upload',contentLength:packed.length,uploadTimestamp:Date.parse(value.generated_at)+2000};
const env={B2_ACCOUNT_QUOTA_REQUIRED:'1',B2_ACCOUNT_QUOTA_WORKFLOW_ID:'historical_gri_version_recovery',B2_REQUEST_BUDGET:'4',B2_KEY_ID:'test-id',B2_APPLICATION_KEY:'private-fixture'};
function fixture(options:any={}){
 const operations:string[]=[],ledger={reserve:vi.fn(async(kind:string)=>{if(options.quotaDenied)throw Error('B2_GLOBAL_DAILY_QUOTA_EXHAUSTED');operations.push(kind);})};
 const auth={accountId:'account123',authorizationToken:'private-native-token',apiInfo:{storageApi:{apiUrl:'https://api005.backblazeb2.com',downloadUrl:options.downloadUrl??'https://f005.backblazeb2.com',allowed:{capabilities:options.capabilities??['listFiles','readFiles','listBuckets'],namePrefix:null,buckets:options.unrestricted?null:[{id:bucket,name:'geomacro-private-archive'}]}}}};
 const fetcher=vi.fn(async(input:any,init:any)=>{
  const u=new URL(String(input));expect(init.redirect).toBe('error');
  if(options.http&&u.pathname.endsWith('b2_list_file_versions'))return new Response('secret upstream denial',{status:options.http});
  if(u.pathname.endsWith('b2_authorize_account'))return Response.json(auth);
  if(u.pathname.endsWith('b2_list_buckets'))return Response.json({buckets:[{bucketId:bucket,bucketName:'geomacro-private-archive'}]});
  if(u.pathname.endsWith('b2_list_file_versions')){
   expect(u.searchParams.get('prefix')).toBe(KEY);expect(u.searchParams.get('maxFileCount')).toBe('1000');
   return Response.json({files:options.entries??[entry],nextFileId:'never-followed'});
  }
  expect(u.pathname).toBe('/b2api/v4/b2_download_file_by_id');expect(u.searchParams.get('fileId')).toBe(id);
  return new Response(options.bytes??packed,{headers:{'x-bz-file-id':options.wrongId?'wrong-id':id,'x-bz-file-name':encodeURIComponent(KEY)}});
 });
 return {env,now,getAnchor:async()=>anchor,governor:ledger,fetchImpl:fetcher,operations,ledger,fetcher};
}
describe('bounded historical B2 immutable version recovery',()=>{
 it('reads the original compressed bytes matching the pre-existing D1 pin and preserves old source clocks',async()=>{
  const f=fixture();const r=await recoverPinnedGriVersion(f);
  expect(r).toMatchObject({immutable_file_version_verified:true,actual_b2_operations:3,new_anchor_minted:false,current_gri_qualified:false,immutable_historical_lineage_verified:false,original_generated_at:value.generated_at,original_source_as_of:value.data.snapshotAsOf,d1_product_writes:0,d1_quota_reservations:3,b2_puts:0,x402_charges:0});
  expect(r).not.toHaveProperty('d1_writes');
  expect(f.operations).toEqual(['NATIVE_AUTH','GET','GET']);
  expect(JSON.stringify(r)).not.toMatch(/private-native-token|private-fixture|latest.json.gz|4_z_immutable/);
 });
 it('uses at most one extra read to resolve an unrestricted key bucket by exact name',async()=>{
  const f=fixture({unrestricted:true});expect((await recoverPinnedGriVersion(f)).actual_b2_operations).toBe(4);
  expect(f.fetcher).toHaveBeenCalledTimes(4);
 });
 it('rejects invalid D1 provenance before auth, and quota exhaustion before any B2 fetch',async()=>{
  const f=fixture();await expect(recoverPinnedGriVersion({...f,getAnchor:async()=>({...anchor,b2_sha256:'bad'})})).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();
  const q=fixture({quotaDenied:true});await expect(recoverPinnedGriVersion(q)).rejects.toThrow('B2_GLOBAL_DAILY_QUOTA_EXHAUSTED');expect(q.fetcher).not.toHaveBeenCalled();
 });
 it('rejects duplicate/absent/oversized candidates without scanning more pages or reading content',async()=>{
  for(const entries of [[],[entry,{...entry,fileId:'4_z_different_version'}],[{...entry,fileName:KEY+'.other'}],[{...entry,uploadTimestamp:Date.parse(value.generated_at)+3600000}],[{...entry,contentLength:3*1024*1024}]]){
   const f=fixture({entries});await expect(recoverPinnedGriVersion(f)).rejects.toThrow(/GRI_VERSION_/);expect(f.fetcher).toHaveBeenCalledTimes(2);
  }
  expect(()=>selectPinnedHistoricalVersion({files:Array(1001).fill(entry)},anchor,bucket)).toThrow('GRI_VERSION_VERSION_LIST_INVALID');
 });
 it('never retries a 401/403/429/404/500 or changes credentials after a denial',async()=>{
  for(const http of [401,403,429,404,500]){const f=fixture({http});await expect(recoverPinnedGriVersion(f)).rejects.toThrow('GRI_VERSION_HTTP_'+http);expect(f.fetcher).toHaveBeenCalledTimes(2);}
 });
 it('requires listFiles and readFiles on the selected credential and never sends auth to another host',async()=>{
  const f=fixture({capabilities:['readFiles']});await expect(recoverPinnedGriVersion(f)).rejects.toThrow('GRI_VERSION_LIST_AND_READ_CAPABILITIES_REQUIRED');expect(f.fetcher).toHaveBeenCalledTimes(1);
  for(const downloadUrl of ['https://attacker.invalid','https://f005.backblazeb2.com:444','https://x@f005.backblazeb2.com','http://f005.backblazeb2.com']){const x=fixture({downloadUrl});await expect(recoverPinnedGriVersion(x)).rejects.toThrow('GRI_VERSION_AUTH_ORIGIN_INVALID');expect(x.fetcher).toHaveBeenCalledTimes(1);}
 });
 it('rejects wrong identity or changed compressed bytes without reanchoring the observed content',async()=>{
  const f=fixture({wrongId:true});await expect(recoverPinnedGriVersion(f)).rejects.toThrow('GRI_VERSION_DOWNLOADED_IDENTITY_INVALID');
  const changed=Buffer.from(packed);changed[10]^=1;
  await expect(recoverPinnedGriVersion(fixture({bytes:changed}))).rejects.toThrow('HISTORICAL_GRI_B2_COMPRESSED_B2_READBACK_SHA_MISMATCH');
 });
 it('does not inherit frozen database/payment credentials or allow a larger request budget',async()=>{
  const f=fixture();for(const patch of [{SUPABASE_URL:'never-call'},{COINBASE_API_KEY:'never-call'},{B2_REQUEST_BUDGET:'5'}])await expect(recoverPinnedGriVersion({...f,env:{...env,...patch}})).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();
 });
});

import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {historyRowFromVerifiedVersion,restoreVerifiedGriHistory,existingD1HistoryWriter} from '../../scripts/ops/restore-gri-verified-version-to-d1.mjs';
import {privateVerifiedGriHistoryProjection} from '../../workers/control-plane/src/website-gri-history.mjs';
const now=new Date('2026-10-16T19:00:00.000Z');
const value={schema:'geomacro.public-global-risk-live.v1',generated_at:'2026-10-08T06:39:43.490Z',source_project:'ldpwajisioljyjtojvfx',data:{snapshotAsOf:'2026-10-08T06:38:59.944+00:00',verificationStatus:'verified',auditPersisted:true,methodologyVersion:'gri-v1.2.0',proofHash:'a'.repeat(64),inputHash:'b'.repeat(64),calculationHash:'c'.repeat(64),domainIndices:{geopolitics:{readingAsOf:'2026-10-08T06:38:59.944+00:00'}},recentEvents:[],drivers:[],provenance:{source_url:'https://private-source.invalid'},level:40}};
const raw=Buffer.from(JSON.stringify(value)),packed=gzipSync(raw),sha=(x:any)=>createHash('sha256').update(x).digest('hex');
const anchor={schema:'geomacro.global-risk-b2-anchor.v1',product:'global-risk',ok:true,b2_object_key:'geomacro-evidence/v1/live/global-risk/latest.json.gz',b2_sha256:sha(packed),payload_sha256:sha(raw),generated_at:value.generated_at,source_run_id:'12345678',baseline_b2_readback_verified:true,baseline_exact_gzip_restore_verified:true};
const receipt={immutable_file_version_verified:true,new_anchor_minted:false,b2_sha256:anchor.b2_sha256,original_payload_sha256:anchor.payload_sha256,immutable_file_id_sha256:'d'.repeat(64)};
const input={anchor,compressed:packed,readbackReceipt:receipt,now};
function fixture(options:any={}){
 let row:any;
 const query=vi.fn(async(sql:string,params:any[])=>{
  expect(sql).not.toMatch(/public_b2_hot_snapshot|risk_object_index|UPDATE |DELETE /i);
  if(sql.startsWith('INSERT')){
   expect(sql).toContain('INSERT OR IGNORE');
   const fields=['source_as_of','payload_sha256','b2_sha256','original_generated_at','original_verified_at','proof_schema','payload_json','created_at'];
   row=Object.fromEntries(fields.map((k,i)=>[k,params[i]]));return [];
  }
  return [{...row,...(options.corrupt?{payload_json:'{}'}:{})}];
 });
 const fetcher=vi.fn(async(url:string)=>{
  expect(url).toBe('https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-lagged-global-risk');
  const doc=privateVerifiedGriHistoryProjection(row,{now:now.getTime()});
  if(options.wrongPublic)doc.data.level=99;
  return Response.json(doc,{status:options.status??200});
 });
 return {query,fetchImpl:fetcher,fetcher};
}
describe('actual immutable original GRI -> existing D1 historical website ring',()=>{
 it('preserves exact old bytes/clocks, inserts without overwriting and verifies independent historical readback',async()=>{
  const f=fixture();const result=await restoreVerifiedGriHistory({...input,...f});
  expect(result).toMatchObject({verified:true,exact_d1_readback_verified:true,original_snapshot_as_of:value.data.snapshotAsOf,original_generated_at:value.generated_at,historical_only:true,current_hot_snapshot_written:false,current_gri_qualified:false,d1_historical_insert_attempts:1,b2_puts:0,payments:0});
  expect(f.query).toHaveBeenCalledTimes(2);expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.query.mock.calls[0][1][6]).toBe(raw.toString());
  expect(JSON.stringify(result)).not.toContain('private-source');
 });
 it('rejects invalid version proof, changed bytes and non-projectable artifacts before any D1 write',async()=>{
  const f=fixture();
  for(const readbackReceipt of [{...receipt,immutable_file_version_verified:false},{...receipt,new_anchor_minted:true},{...receipt,b2_sha256:'0'.repeat(64)}])await expect(restoreVerifiedGriHistory({...input,...f,readbackReceipt})).rejects.toThrow();
  const changed=Buffer.from(packed);changed[10]^=1;
  await expect(restoreVerifiedGriHistory({...input,...f,compressed:changed})).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
  expect(()=>historyRowFromVerifiedVersion({...input,now:new Date('2027-01-01')})).toThrow();
 });
 it('stops on a colliding/corrupt D1 record and never asserts a public readback',async()=>{
  const f=fixture({corrupt:true});await expect(restoreVerifiedGriHistory({...input,...f})).rejects.toThrow('GRI_HISTORY_RESTORE_EXACT_D1_READBACK_FAILED');expect(f.fetcher).not.toHaveBeenCalled();
 });
 it('rejects public unavailability or altered derived values even if clocks and flags are unchanged',async()=>{
  await expect(restoreVerifiedGriHistory({...input,...fixture({status:503})})).rejects.toThrow('GRI_HISTORY_RESTORE_PUBLIC_HISTORICAL_READ_UNAVAILABLE');
  await expect(restoreVerifiedGriHistory({...input,...fixture({wrongPublic:true})})).rejects.toThrow('GRI_HISTORY_RESTORE_PUBLIC_HISTORICAL_PROOF_MISMATCH');
 });
 it('validates D1 configuration before any request and binds SQL parameters instead of shell interpolation',async()=>{
  const fetcher=vi.fn();expect(()=>existingD1HistoryWriter({},fetcher)).toThrow();expect(fetcher).not.toHaveBeenCalled();
  const fake=vi.fn(async(url:string,init:any)=>{
   expect(url).toMatch(/^https:\/\/api.cloudflare.com/);expect(init.method).toBe('POST');
   expect(JSON.parse(init.body).params).toEqual(["a'b"]);
   return Response.json({success:true,result:[{success:true,results:[]}]});
  });
  await existingD1HistoryWriter({CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),D1_DATABASE_ID:'b'.repeat(36),CLOUDFLARE_API_TOKEN:'private-test'},fake)('SELECT ?',["a'b"]);
  expect(fake).toHaveBeenCalledOnce();
 });
});

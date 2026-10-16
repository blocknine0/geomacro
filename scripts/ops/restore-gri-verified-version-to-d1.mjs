#!/usr/bin/env node
// Restores only the original historical WEBSITE ring. Never writes current hot
// products, claims current GRI, publishes article sources or changes clocks.
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
import {recoverPinnedGriVersion} from './recover-gri-pinned-b2-version.mjs';
import {verifyPinnedGlobalRiskBaseline} from './verify-global-risk-b2-historical-readback.mjs';
import {privateVerifiedGriHistoryProjection} from '../../workers/control-plane/src/website-gri-history.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Error('GRI_HISTORY_RESTORE_'+code)};
const ROOT='https://geomacro-control-plane.daspallab202391.workers.dev';
export function historyRowFromVerifiedVersion({anchor,compressed,readbackReceipt,now=new Date()}){
 const checked=verifyPinnedGlobalRiskBaseline({anchor,compressed,now});
 if(readbackReceipt?.immutable_file_version_verified!==true||readbackReceipt.new_anchor_minted!==false||
  readbackReceipt.b2_sha256!==anchor.b2_sha256||readbackReceipt.original_payload_sha256!==anchor.payload_sha256||
  !/^[a-f0-9]{64}$/.test(readbackReceipt.immutable_file_id_sha256??''))fail('IMMUTABLE_VERSION_PROOF_REQUIRED');
 const raw=gunzipSync(compressed,{maxOutputLength:12*1024*1024});
 if(raw.length>1024*1024)fail('D1_PAYLOAD_BOUND_EXCEEDED');
 const row={source_as_of:checked.original_source_as_of,payload_sha256:anchor.payload_sha256,b2_sha256:anchor.b2_sha256,
  original_generated_at:anchor.generated_at,original_verified_at:now.toISOString(),
  proof_schema:'geomacro.public-global-risk-live-proof.v1',payload_json:raw.toString('utf8'),created_at:now.toISOString()};
 if(sha(Buffer.from(row.payload_json))!==anchor.payload_sha256)fail('UTF8_PAYLOAD_IDENTITY_INVALID');
 if(!privateVerifiedGriHistoryProjection(row,{now:now.getTime()}))fail('WEBSITE_PROJECTION_NOT_VERIFIED');
 return row;
}
export async function restoreVerifiedGriHistory({anchor,compressed,readbackReceipt,query,fetchImpl=fetch,now=new Date()}){
 if(typeof query!=='function')fail('D1_WRITER_REQUIRED');
 const row=historyRowFromVerifiedVersion({anchor,compressed,readbackReceipt,now});
 const expected=privateVerifiedGriHistoryProjection(row,{now:now.getTime()});
 // Immutable first write, not an overwrite/upsert of a current public product.
 await query(`INSERT OR IGNORE INTO website_verified_gri_snapshot_history
 (source_as_of,payload_sha256,b2_sha256,original_generated_at,original_verified_at,proof_schema,payload_json,created_at)
 VALUES (?,?,?,?,?,?,?,?)`,[row.source_as_of,row.payload_sha256,row.b2_sha256,row.original_generated_at,
  row.original_verified_at,row.proof_schema,row.payload_json,row.created_at]);
 const rows=await query(`SELECT source_as_of,payload_sha256,b2_sha256,original_generated_at,original_verified_at,proof_schema,payload_json
 FROM website_verified_gri_snapshot_history WHERE source_as_of=? AND payload_sha256=? LIMIT 1`,[row.source_as_of,row.payload_sha256]);
 const got=rows?.[0];
 if(!got||got.b2_sha256!==row.b2_sha256||got.original_generated_at!==row.original_generated_at||
  got.source_as_of!==row.source_as_of||got.proof_schema!==row.proof_schema||
  sha(Buffer.from(String(got.payload_json??'')))!==row.payload_sha256||
  !privateVerifiedGriHistoryProjection(got,{now:now.getTime()}))fail('EXACT_D1_READBACK_FAILED');
 const response=await fetchImpl(ROOT+'/v1/public/website-lagged-global-risk',{
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok||Number(response.headers.get('content-length')??0)>2*1024*1024)fail('PUBLIC_HISTORICAL_READ_UNAVAILABLE');
 const raw=await response.text();if(raw.length>2*1024*1024)fail('PUBLIC_HISTORICAL_READ_TOO_LARGE');
 let doc;try{doc=JSON.parse(raw)}catch{fail('PUBLIC_HISTORICAL_SCHEMA_INVALID');}
 if(doc.ok!==true||doc.schema!=='geomacro.website-lagged-global-risk.v1'||doc.website_only!==true||
  doc.chargeable!==false||doc.paid_delivery_authorized!==false||doc.source_identity_disclosed!==false||
  doc.raw_upstream_disclosed!==false||doc.snapshot_as_of!==row.source_as_of||doc.data?.snapshotAsOf!==row.source_as_of||
  JSON.stringify(doc.data)!==JSON.stringify(expected.data))
  fail('PUBLIC_HISTORICAL_PROOF_MISMATCH');
 return {schema:'geomacro.gri-pinned-version-d1-historical-restore.v1',verified:true,
  original_snapshot_as_of:row.source_as_of,original_generated_at:row.original_generated_at,
  exact_d1_readback_verified:true,independent_public_historical_http_status:response.status,
  website_only:true,historical_only:true,current_hot_snapshot_written:false,current_gri_qualified:false,
  native_source_clock_preserved:true,d1_historical_insert_attempts:1,raw_source_content_logged:false,b2_puts:0,supabase_requests:0,payments:0};
}
export function existingD1HistoryWriter(env=process.env,fetchImpl=fetch){
 const account=env.CLOUDFLARE_ACCOUNT_ID,database=env.D1_DATABASE_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!/^[a-f0-9]{32}$/.test(account??'')||!/^[a-f0-9-]{36}$/.test(database??'')||!token)fail('D1_CONFIGURATION_REQUIRED');
 return async(sql,params)=>{
  const r=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{
   method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)fail('D1_QUERY_UNAVAILABLE');
  const d=await r.json();if(d.success!==true||!Array.isArray(d.result)||d.result.length!==1||d.result[0]?.success!==true||!Array.isArray(d.result[0].results))fail('D1_QUERY_INVALID');
  return d.result[0].results;
 };
}
if(process.argv[1]?.endsWith('/restore-gri-verified-version-to-d1.mjs')){
 try{
  if(process.env.GEOMACRO_GRI_RESTORE_WEBSITE_HISTORY!=='1')fail('EXPLICIT_HISTORICAL_MODE_REQUIRED');
  const query=existingD1HistoryWriter();
  const receipt=await recoverPinnedGriVersion({onVerified:args=>restoreVerifiedGriHistory({...args,query})});
  mkdirSync('artifacts/gri-b2-history',{recursive:true});
  writeFileSync('artifacts/gri-b2-history/historical-d1-restore.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(receipt.history_restore));
 }catch(e){
  const text=e instanceof Error?e.message:'';
  const code=/^(?:GRI_HISTORY_RESTORE_|GRI_VERSION_|HISTORICAL_GRI_B2_)[A-Z0-9_]+$/.test(text)?text:
   /QUOTA/.test(text)?'GRI_HISTORY_RESTORE_SHARED_QUOTA_HELD':'GRI_HISTORY_RESTORE_UNAVAILABLE';
  console.error(JSON.stringify({schema:'geomacro.gri-pinned-version-d1-restore-failure.v1',error_code:code,
   current_product_promoted:false,source_clock_refreshed:false,b2_puts:0,supabase_requests:0,payments:0}));process.exitCode=2;
 }
}

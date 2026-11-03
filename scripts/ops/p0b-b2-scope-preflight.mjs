/**
 * One-time-per-deploy P0-B B2 key-scope preflight.
 * Reserves a single existing shared native-auth quota ticket, reads the actual
 * application's permitted file-name prefix / bucket / read-write capabilities,
 * and sends ONLY the safe prefix and S3 region to the Wrangler runtime config.
 * Never uploads an invented article or exposes provider tokens.
 */
import {createHmac} from 'node:crypto';
import {appendFileSync} from 'node:fs';
const fail=code=>{throw Error(code)};
export function deriveP0bB2Scope(data,bucket){
 const storage=data?.apiInfo?.storageApi,allowed=storage?.allowed;
 if(!allowed||!Array.isArray(allowed.capabilities))
  fail('P0B_B2_KEY_SCOPE_UNAVAILABLE');
 if(!allowed.capabilities.includes('writeFiles')||
    !allowed.capabilities.includes('readFiles'))
  fail('P0B_B2_KEY_REQUIRES_READ_AND_WRITE');
 if(!Array.isArray(allowed.buckets))
  fail('P0B_B2_BUCKET_SCOPE_UNAVAILABLE');
 const names=allowed.buckets.map(x=>x?.name).filter(Boolean);
 if(names.length&&!names.includes(bucket))
  fail('P0B_B2_KEY_NOT_AUTHORIZED_FOR_ARCHIVE_BUCKET');
 const namePrefix=allowed.namePrefix??'';
 if(typeof namePrefix!=='string'||namePrefix.length>190||
   (namePrefix!==''&&!/^(?:[a-zA-Z0-9._+-]+\/)*[a-zA-Z0-9._+-]*\/?$/u.test(namePrefix))||
   namePrefix.includes('../')||namePrefix.includes('/./'))
  fail('P0B_B2_KEY_PREFIX_UNSUPPORTED');
 const prefix=(namePrefix?namePrefix.replace(/\/?$/u,'/'):'')+'spool/';
 if(!/^(?:[a-zA-Z0-9._+-]+\/)*spool\/$/u.test(prefix)||prefix.length>220)
  fail('P0B_B2_DERIVED_SPOOL_PREFIX_INVALID');
 let url;
 try{url=new URL(storage?.s3ApiUrl??'')}catch{fail('P0B_B2_S3_ENDPOINT_INVALID')}
 if(url.protocol!=='https:'||!/^s3\.[a-z0-9-]+\.backblazeb2\.com$/u.test(url.hostname)||
   url.pathname!=='/'||url.search||url.hash)
  fail('P0B_B2_S3_ENDPOINT_INVALID');
 return {prefix,endpoint:url.origin,restricted:Boolean(namePrefix)};
}
export async function runP0bB2Preflight(env,{fetchImpl=fetch,append=appendFileSync}={}){
 if(String(env.ROOT_LEDGER_TOKEN??'').length<32||
    String(env.P0B_B2_KEY_ID??'').length<5||
    String(env.P0B_B2_APPLICATION_KEY??'').length<20||
    String(env.P0B_B2_BUCKET??'').length<3)
  fail('P0B_B2_PREFLIGHT_CREDENTIAL_MISSING');
 const bearer=createHmac('sha256',env.ROOT_LEDGER_TOKEN)
  .update('geomacro-control-plane-v1').digest('hex');
 const request={method:'POST',headers:{
  authorization:'Bearer '+bearer,'content-type':'application/json'},
  body:JSON.stringify({kind:'NATIVE_AUTH',workflow_id:'p0b_b2_scope_preflight'}),
  signal:AbortSignal.timeout(20000)};
 const reserved=await fetchImpl(
  'https://geomacro-control-plane.daspallab202391.workers.dev/v1/b2-quota/reserve',
  request);
 if(!reserved.ok)
  fail('P0B_B2_NATIVE_AUTH_RESERVATION_HTTP_'+reserved.status);
 if((await reserved.json())?.reserved!==true)
  fail('P0B_B2_NATIVE_AUTH_NOT_RESERVED');
 const auth=Buffer.from(env.P0B_B2_KEY_ID+':'+env.P0B_B2_APPLICATION_KEY).toString('base64');
 const response=await fetchImpl(
  'https://api.backblazeb2.com/b2api/v4/b2_authorize_account',
  {headers:{Authorization:'Basic '+auth},signal:AbortSignal.timeout(20000)});
 if(!response.ok)fail('P0B_B2_KEY_AUTH_FAILED_HTTP_'+response.status);
 const scope=deriveP0bB2Scope(await response.json(),env.P0B_B2_BUCKET);
 append(env.GITHUB_ENV,'P0B_SPOOL_PREFIX='+scope.prefix+'\n');
 append(env.GITHUB_ENV,'P0B_S3_ENDPOINT='+scope.endpoint+'\n');
 return {ok:true,read_write_verified:true,restricted_prefix_adapted:scope.restricted};
}
if(process.argv[1]?.endsWith('/p0b-b2-scope-preflight.mjs')){
 try{
  const receipt=await runP0bB2Preflight(process.env);
  console.log('P0B_B2_KEY_READ_WRITE_SCOPE_VERIFIED='+receipt.read_write_verified);
  console.log('P0B_B2_RESTRICTED_NAME_PREFIX_ADAPTED='+receipt.restricted_prefix_adapted);
 }catch(error){
  console.error(error instanceof Error&&/^P0B_[A-Z0-9_]+$/u.test(error.message)?
   error.message:'P0B_B2_SCOPE_PREFLIGHT_FAILED');
  process.exitCode=1;
 }
}

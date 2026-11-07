#!/usr/bin/env node
/** Native provider metadata, unlike Wrangler info JSON which removes version. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function readProductionD1Info({env=process.env,databaseId,fetchImpl=fetch}={}){
 if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
    !/^[a-f0-9-]{36}$/i.test(databaseId??'')||(env.CLOUDFLARE_API_TOKEN??'').length<20)
  throw Error('MIGRATION_PROVIDER_INFO_IDENTITY_UNVERIFIED');
 const response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+
  env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+databaseId,{
  headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,Accept:'application/json'},
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 const body=await response.json();
 if(response.status!==200||body?.success!==true||body.result?.uuid!==databaseId||
    body.result?.name!=='geomacro-control-plane'||body.result?.version!=='production')
  throw Error('MIGRATION_PROVIDER_PRODUCTION_INFO_UNVERIFIED');
 return body.result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)throw Error('MIGRATION_INFO_CONFIG_REQUIRED');
  const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const databases=config.d1_databases?.filter(x=>x.binding==='DB'&&x.database_name==='geomacro-control-plane');
  if(databases?.length!==1)throw Error('MIGRATION_INFO_CONFIG_UNVERIFIED');
  console.log(JSON.stringify(await readProductionD1Info({databaseId:databases[0].database_id})));
 }catch(e){console.error(/^MIGRATION_[A-Z0-9_]+$/.test(e?.message??'')?e.message:
  'MIGRATION_PROVIDER_INFO_UNAVAILABLE');process.exitCode=2;}
}

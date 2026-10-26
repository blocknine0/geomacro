#!/usr/bin/env node
/**
 * Read-only outside-in deployment provenance for WDI ingestion changes.
 * Checks ONLY public Geomacro build identity. Never touches a customer,
 * rights, signer, payment or WDI provider API. Publish is owner-controlled.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const ORIGIN='https://geomacro.live';
const MARKER='/.well-known/geomacro-build.json';
const SHA=/^[a-f0-9]{40}$/u;
const LIMIT=8192;
export function inspectPublishedWdiBuild({status,payload,expectedSha}){
 if(!SHA.test(expectedSha??''))throw Error('WDI_EXPECTED_MAIN_SHA_INVALID');
 const real=payload&&typeof payload==='object'&&!Array.isArray(payload)?
   String(payload.canonical_main_sha??''):'';
 const valid=status===200&&payload?.schema_version==='geomacro.deployment-build.v1'&&
   payload.canonical_repository==='blocknine0/geomacro'&&SHA.test(real);
 const match=valid&&real===expectedSha;
 return Object.freeze({
   schema:'geomacro.wdi-production-build-readback.v1',
   status:match?'DEPLOYED_MAIN_SHA_MATCH':valid?'DEPLOYED_SHA_DIFFERS':'DEPLOYMENT_MARKER_UNVERIFIED',
   deployed_main_sha_match:match,
   expected_sha_short:expectedSha.slice(0,12),
   observed_sha_short:valid?real.slice(0,12):null,
   public_http_status:Number.isInteger(status)?status:null,
   published_build_not_claimed_from_git_mirror:true,
   wdi_source_data_health_verified_separately:true,
   external_provider_requests:0,d1_writes:0,b2_requests:0,payments:0,
 });
}
async function boundedJson(r){
 const header=Number(r.headers.get('content-length')??0);
 if(!Number.isFinite(header)||header>LIMIT)throw Error('BUILD_MARKER_OVERSIZE');
 if(!r.body)throw Error('BUILD_MARKER_EMPTY');
 const reader=r.body.getReader();let total=0;const chunks=[];
 try{
   for(;;){
     const {done,value}=await reader.read();
     if(done)break;
     total+=value.byteLength;
     if(total>LIMIT)throw Error('BUILD_MARKER_OVERSIZE');
     chunks.push(value);
   }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const data=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
}
export async function probePublishedWdiBuild({expectedSha,fetchImpl=fetch}){
 if(!SHA.test(expectedSha??''))throw Error('WDI_EXPECTED_MAIN_SHA_INVALID');
 try{
   const r=await fetchImpl(ORIGIN+MARKER,{
     method:'GET',redirect:'error',cache:'no-store',
     headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000),
   });
   let payload=null;
   if(r.status===200)payload=await boundedJson(r);
   else await r.body?.cancel().catch(()=>{});
   return inspectPublishedWdiBuild({status:r.status,payload,expectedSha});
 }catch{
   return {
     ...inspectPublishedWdiBuild({status:null,payload:null,expectedSha}),
     status:'DEPLOYMENT_READBACK_UNAVAILABLE',
   };
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if(process.env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
    process.env.GITHUB_REF!=='refs/heads/main'||
    !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??'')||
    !SHA.test(process.env.GITHUB_SHA??''))
   throw Error('PROTECTED_MAIN_DEPLOYMENT_CHECK_REQUIRED');
 const result=await probePublishedWdiBuild({expectedSha:process.env.GITHUB_SHA});
 mkdirSync('artifacts/free-source-updates',{recursive:true,mode:0o700});
 writeFileSync('artifacts/free-source-updates/deployed-main-readback.json',
   JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(result));
 if(!result.deployed_main_sha_match){
   console.warn('::warning title=WDI_DEPLOYED_BUILD_UNVERIFIED::'+result.status+
     '; GitHub main does not prove Lovable site publication.');
   process.exitCode=2;
 }
}

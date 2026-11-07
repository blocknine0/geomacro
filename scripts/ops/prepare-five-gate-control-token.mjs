#!/usr/bin/env node
/**
 * Protected GitHub runner only: recover the EXISTING Control Plane credential
 * from the existing ledger root when no explicit GitHub secret is available.
 *
 * Prove that the derived credential matches the currently live Worker before
 * exporting it to subsequent job steps. No Worker secret put, deploy, D1
 * mutation, B2 operation, signer change, or payment action.
 */
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deriveControlPlaneRootToken} from './derive-control-plane-root-token.mjs';

const AUTH=/^[a-f0-9]{64}$/u;
const URL='https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/p0b/status';
const reject=(code)=>{throw Error(code)};

export async function prepareFiveGateControlToken({
 env=process.env,
 fetchImpl=fetch,
 appendEnv=(path,line)=>appendFileSync(path,line,{encoding:'utf8',mode:0o600}),
 mask=(value)=>process.stdout.write('::add-mask::'+value+'\n'),
}={}){
 if(env.GITHUB_ACTIONS!=='true'||
    env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
    env.GITHUB_REF!=='refs/heads/main'||
    typeof env.GITHUB_ENV!=='string'||!env.GITHUB_ENV.startsWith('/'))
  reject('RELEASE_CONTROL_PLANE_GITHUB_IDENTITY_UNVERIFIED');

 const explicit=String(env.CONTROL_PLANE_TOKEN??'');
 let token,source;
 if(explicit){
  if(!AUTH.test(explicit))reject('RELEASE_CONTROL_PLANE_EXPLICIT_SECRET_INVALID');
  token=explicit;source='EXISTING_GITHUB_SECRET';
 }else{
  const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'');
  if(root.trim().length<32)reject('RELEASE_EXISTING_LEDGER_ROOT_MISSING');
  token=deriveControlPlaneRootToken(root);
  source='DERIVED_FROM_EXISTING_LEDGER_ROOT';
 }
 if(!AUTH.test(token))reject('RELEASE_CONTROL_PLANE_CREDENTIAL_INVALID');

 // One bounded read-only request. The status route checks admin auth before
 // any status computation and by default avoids costly deep D1 scans.
 // Validation must occur BEFORE any environment-file export.
 let response;
 try{
  response=await fetchImpl(URL,{
   method:'GET',redirect:'error',cache:'no-store',
   headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   signal:AbortSignal.timeout(12000),
  });
 }catch{reject('RELEASE_CONTROL_PLANE_AUTH_CHECK_UNAVAILABLE')}
 if(response?.status===401||response?.status===403)
  reject('RELEASE_CONTROL_PLANE_SECRET_DOES_NOT_MATCH_WORKER');
 if(response?.status!==200||response?.redirected)
  reject('RELEASE_CONTROL_PLANE_READONLY_STATUS_UNAVAILABLE');
 let body;
 try{
  const value=await response.text();
  if(value.length>100000)reject('RELEASE_CONTROL_PLANE_AUTH_RESPONSE_TOO_LARGE');
  body=JSON.parse(value);
 }catch{reject('RELEASE_CONTROL_PLANE_AUTH_RESPONSE_INVALID')}
 if(body?.ok!==true)reject('RELEASE_CONTROL_PLANE_AUTH_RESPONSE_UNVERIFIED');

 // GitHub Actions' add-mask command prevents display in subsequent log lines.
 // GitHub's runner-only GITHUB_ENV file is never uploaded as an artifact.
 mask(token);
 appendEnv(env.GITHUB_ENV,'CONTROL_PLANE_TOKEN='+token+'\n');
 return {status:'PASS',source,live_worker_admin_readback:true,provider_status:200,
  original_worker_secret_unchanged:true,cloudflare_mutations:0,
  d1_writes:0,b2_requests:0,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 prepareFiveGateControlToken().then(receipt=>console.log(JSON.stringify(receipt)))
  .catch(error=>{
   const code=error instanceof Error&&
    /^RELEASE_[A-Z0-9_]+$/u.test(error.message)?error.message:
    'RELEASE_CONTROL_PLANE_PREPARE_FAILED';
   console.error(JSON.stringify({status:'HOLD',code,credentials_not_exposed:true}));
   process.exitCode=2;
  });
}

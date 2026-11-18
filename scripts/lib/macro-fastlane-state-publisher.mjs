/**
 * Protected Macro/FX source-state writer. This is not a public route or a
 * commercial publisher. A successful PUT must be independently read back;
 * source cursors never advance on transient HTTP or a false acknowledgement.
 */
export const MACRO_STATE_MAX_BYTES=64*1024;
const RETRYABLE=new Set([429,500,502,503,504]);
const VALID_ERRORS=new Set(['MACRO_STATE_INVALID','MACRO_STATE_PAYLOAD_TOO_LARGE',
 'MACRO_STATE_D1_WRITE_UNAVAILABLE','MACRO_STATE_D1_WRITE_UNVERIFIED',
 'BODY_TOO_LARGE','UNAUTHORIZED','CONTROL_PLANE_AUTH_UNCONFIGURED']);
const safeCode=x=>VALID_ERRORS.has(x)?x:'UNCLASSIFIED';
const sleepDefault=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function persistMacroFastlaneState({
 fetchImpl=fetch,url,token,state,sleep=sleepDefault,timeoutMs=12000,
}={}){
 if(typeof url!=='string'||!url.endsWith('/v1/internal/macro-fastlane')||
    !url.startsWith('https://')||typeof token!=='string'||token.length<32||
    state?.schema!=='geomacro.macro-fastlane-state.v1'||
    !Number.isFinite(Date.parse(state.checked_at)))
  throw Error('MACRO_STATE_REQUEST_INVALID');
 const body=JSON.stringify(state),bytes=new TextEncoder().encode(body).byteLength;
 if(bytes>MACRO_STATE_MAX_BYTES)throw Error('MACRO_STATE_PAYLOAD_TOO_LARGE');
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 let latestStatus=0,lastError='UNCLASSIFIED';
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetchImpl(url,{method:'PUT',redirect:'error',
    headers,body,signal:AbortSignal.timeout(timeoutMs)});
   latestStatus=response.status;
   let ack=null;
   try{ack=await response.json();}catch{}
   if(response.ok&&ack?.ok===true&&ack?.state_saved===true){
    // Exactly one additional protected state GET, never a public D1 query.
    // On readback failure do not re-PUT a commit that may already be durable.
    let verify;
    try{verify=await fetchImpl(url,{method:'GET',redirect:'error',
      headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(timeoutMs)});}
    catch{throw Error('MACRO_STATE_READBACK_NETWORK_UNVERIFIED')}
    if(!verify.ok)throw Error('MACRO_STATE_READBACK_HTTP_'+verify.status);
    let fetched;try{fetched=await verify.json()}catch{throw Error('MACRO_STATE_READBACK_INVALID')}
    if(fetched?.ok!==true||fetched.state?.schema!==state.schema||
       fetched.state?.checked_at!==state.checked_at||
       JSON.stringify(fetched.state.source_checks)!==JSON.stringify(state.source_checks)||
       JSON.stringify(fetched.state.mineral_checks??[])!==JSON.stringify(state.mineral_checks??[]))
      throw Error('MACRO_STATE_READBACK_MISMATCH');
    return Object.freeze({schema:'geomacro.macro-fastlane-state-write-receipt.v1',
     saved:true,verified_d1_readback:true,attempts:attempt,payload_bytes:bytes,
     commercial_eligible:false,source_text_included:false});
   }
   lastError=safeCode(ack?.error);
   if(!RETRYABLE.has(response.status))
    throw Error('MACRO_STATE_PUT_HTTP_'+response.status+'_'+lastError);
  }catch(error){
   const code=String(error?.message??'');
   if(code.startsWith('MACRO_STATE_')){
    // Non-retryable rejections and failed readbacks must not be retried.
    if(!code.startsWith('MACRO_STATE_PUT_HTTP_')||!RETRYABLE.has(latestStatus))
      throw error;
   }
   lastError=code==='TimeoutError'?'TIMEOUT':'NETWORK_OR_PROVIDER';
  }
  if(attempt<3)await sleep(attempt*300);
 }
 throw Error('MACRO_STATE_PUT_RETRY_EXHAUSTED_HTTP_'+latestStatus+'_'+lastError);
}

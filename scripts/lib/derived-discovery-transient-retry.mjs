/**
 * Transient Cloudflare protection for read-only discovery GETs and
 * idempotent, verified discovery POSTs. A 503 is never a D1 receipt.
 * Exactly three retries follow the initial attempt; other HTTP codes
 * (including authorization and stale-page conflicts) fail immediately.
 */
export const DISCOVERY_RETRY_DELAYS_MS=Object.freeze([2000,5000,10000]);
export const DISCOVERY_LANE_PACE_MS=500;
export const DISCOVERY_RETRY_JITTER_MS=500;

export const pauseDiscoveryRequest=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function isTransientDiscoveryNetworkError(error){
 const name=String(error?.name??"");
 const code=String(error?.code??error?.cause?.code??"");
 return error instanceof TypeError||
   name==="AbortError"||name==="TimeoutError"||
   ["ECONNRESET","ETIMEDOUT","EAI_AGAIN","ECONNREFUSED","ENETUNREACH","EPIPE"].includes(code);
}

export async function retryTransientDiscoveryRequest(operation,{
 sleep=pauseDiscoveryRequest,random=Math.random,
}={}){
 for(let attempt=0;attempt<=DISCOVERY_RETRY_DELAYS_MS.length;attempt++){
  try{
   const response=await operation();
   if(response?.status!==503||attempt===DISCOVERY_RETRY_DELAYS_MS.length)
    return response;
  }catch(error){
   if(!isTransientDiscoveryNetworkError(error)||
      attempt===DISCOVERY_RETRY_DELAYS_MS.length)throw error;
  }
  const jitter=Math.round((random()*2-1)*DISCOVERY_RETRY_JITTER_MS);
  await sleep(Math.max(0,DISCOVERY_RETRY_DELAYS_MS[attempt]+jitter));
 }
 throw Error("DERIVED_DISCOVERY_RETRY_UNREACHABLE");
}

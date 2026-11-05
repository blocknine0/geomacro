/**
 * Protected no-funds Predge pilot transport. Retry only a bounded transient
 * network/502/503/504 failure; never retry auth, schema or hard quota 429.
 * Each request gets its own timeout. No token, URL or response content is logged.
 * The owner PUT is an idempotent verified signed-envelope upsert, so one
 * same-byte transport retry cannot grant risk or payment authority.
 */
const RETRYABLE=new Set([502,503,504]);
const sleepDefault=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function fetchProtectedPilot(url,options={},{
 fetchImpl=fetch,sleep=sleepDefault,attempts=2,delayMs=2000,timeoutMs=20000
}={}){
 if(!Number.isSafeInteger(attempts)||attempts<1||attempts>2||
    !Number.isSafeInteger(delayMs)||delayMs<0||delayMs>10000||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
   throw Error("PREDGE_PILOT_RETRY_CONFIGURATION_INVALID");
 for(let i=0;i<attempts;i++){
   let response;
   try{response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(timeoutMs)});}
   catch{
     if(i+1===attempts)throw Error("PREDGE_PILOT_TRANSPORT_UNAVAILABLE");
     await sleep(delayMs);continue;
   }
   if(!RETRYABLE.has(response.status)||i+1===attempts)return response;
   try{await response.body?.cancel?.();}catch{/* no body or already consumed */}
   await sleep(delayMs);
 }
 throw Error("PREDGE_PILOT_RETRY_EXHAUSTED");
}

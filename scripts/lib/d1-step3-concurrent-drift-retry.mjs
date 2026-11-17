/**
 * Retry only the reviewed Step 3 full-index proof's transient cross-query
 * source-count/parity drift. Every retry reruns the complete read-only audit;
 * schema, key, DDL, budget and all other failures remain fail-closed.
 */
const RETRYABLE=/^STEP3_SET_INDEX_(?:JOIN_)?(?:CONCURRENT_SOURCE_ROW_COUNT_DRIFT|COMPLETE_ROWID_AND_KEY_PARITY_UNVERIFIED)$/u;
const DEFAULT_BACKOFF_MS=Object.freeze([2000,4000]);
const wait=ms=>{
 const signal=new Int32Array(new SharedArrayBuffer(4));
 Atomics.wait(signal,0,0,ms);
};
export function withStep3ConcurrentDriftRetry(operation,{
 attempts=3,backoffMs=DEFAULT_BACKOFF_MS,sleep=wait
}={}){
 if(typeof operation!=="function"||!Number.isInteger(attempts)||attempts<1||attempts>3||
    !Array.isArray(backoffMs)||typeof sleep!=="function")
  throw new Error("STEP3_CONCURRENT_DRIFT_RETRY_CONFIG_INVALID");
 for(let i=0;i<attempts;i++){
  try{return operation();}
  catch(error){
   const message=String(error?.message??"");
   if(!RETRYABLE.test(message)||i===attempts-1)throw error;
   const delay=backoffMs[i]??DEFAULT_BACKOFF_MS.at(-1);
   if(!Number.isInteger(delay)||delay<2000||delay>5000)
    throw new Error("STEP3_CONCURRENT_DRIFT_RETRY_BACKOFF_INVALID");
   sleep(delay);
  }
 }
 throw new Error("STEP3_CONCURRENT_DRIFT_RETRY_UNREACHABLE");
}

/**
 * Retry only the reviewed Step 3 full-index proof's transient cross-query
 * source-count/parity drift. Every retry reruns the complete read-only audit;
 * schema, key, DDL, budget and all other failures remain fail-closed.
 */
const RETRYABLE=/^STEP3_SET_INDEX_(?:JOIN_)?(?:CONCURRENT_SOURCE_ROW_COUNT_DRIFT|COMPLETE_ROWID_AND_KEY_PARITY_UNVERIFIED)$/u;
const DEFAULT_BACKOFF_MS=Object.freeze([2000,4000]);
const READ_QUERY_RETRYABLE=/^STEP3_PROVIDER_D1_EXECUTE_(?:EXIT_1|TIMEOUT)$/u;
const READ_QUERY_BACKOFF_MS=Object.freeze([250,500]);
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

/** Retry only transient failures from read-only D1 execute commands. */
export function withStep3ReadOnlyQueryRetry(operation,{
 attempts=3,backoffMs=READ_QUERY_BACKOFF_MS,sleep=wait
}={}){
 if(typeof operation!=="function"||!Number.isInteger(attempts)||attempts<1||
    attempts>3||!Array.isArray(backoffMs)||typeof sleep!=="function")
  throw new Error("STEP3_READ_QUERY_RETRY_CONFIG_INVALID");
 for(let i=0;i<attempts;i++){
  try{return operation();}
  catch(error){
   if(!READ_QUERY_RETRYABLE.test(String(error?.message??""))||
      i===attempts-1)throw error;
   const delay=backoffMs[i]??READ_QUERY_BACKOFF_MS.at(-1);
   if(!Number.isInteger(delay)||delay<100||delay>2000)
    throw new Error("STEP3_READ_QUERY_RETRY_BACKOFF_INVALID");
   sleep(delay);
  }
 }
 throw new Error("STEP3_READ_QUERY_RETRY_UNREACHABLE");
}

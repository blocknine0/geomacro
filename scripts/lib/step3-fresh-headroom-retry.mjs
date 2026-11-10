/** Fail-closed bounded Cloudflare Paid headroom retry for protected Stage2.
 * Every attempt calls the authoritative provider-backed verifier anew.
 * No cached result, user-declared Paid flag, quota override or alternate PASS.
 */
const RETRY_DELAYS_MS=Object.freeze([1500,3500,6500]);
const RETRY_REASON="PAID_SUBSCRIPTION_OR_CURRENT_CYCLE_PROVIDER_UNVERIFIED";
const isSafeCode=s=>typeof s==="string"&&/^[A-Z][A-Z0-9_]{2,110}$/u.test(s);
export async function readStep3FreshHeadroomWithRetry({read,wait,request}={}){
 if(typeof read!=="function"||typeof wait!=="function"||
    !request||!["migration","shadow"].includes(request.lane))
  throw Error("STEP3_HEADROOM_RECHECK_CONTRACT_INVALID");
 const attempts=[];
 let last=null;
 for(let i=0;i<=RETRY_DELAYS_MS.length;i++){
  // A new provider read and new subscription proof are required every time.
  // The original check is the sole issuer of a PASS receipt.
  try{last=await read({...request});}
  catch{last={status:"HOLD",
   reason:RETRY_REASON,provider_error:"STEP3_PROVIDER_RECHECK_THROWN"};}
  attempts.push(Object.freeze({
   attempt:i+1,status:last?.status==="PASS"?"PASS":"HOLD",
   code:isSafeCode(last?.code)?last.code:"PROVIDER_UNVERIFIED",
   reason:isSafeCode(last?.reason)?last.reason:"PROVIDER_UNVERIFIED",
   provider_error:isSafeCode(last?.provider_error)?last.provider_error:null,
  }));
  if(last?.status==="PASS")return Object.freeze({
   receipt:last,attempts:Object.freeze(attempts),provider_pass_observed:true});
  // Actual quota/pacing HOLDs, invalid caller scope or anything unknown
  // cannot be bypassed by retry. Only recheck a transient missing provider
  // observation, and retain HOLD if all fresh attempts fail.
  if(last?.status!=="HOLD"||last.reason!==RETRY_REASON||
     i===RETRY_DELAYS_MS.length)break;
  await wait(RETRY_DELAYS_MS[i]);
 }
 return Object.freeze({
  receipt:last,attempts:Object.freeze(attempts),provider_pass_observed:false});
}

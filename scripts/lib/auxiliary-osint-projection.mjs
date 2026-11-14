/**
 * Source-neutral, no-funds projection boundary for already D1-verified OSINT.
 * A lagging protected Control Plane may respond 405 while its reviewed Worker
 * version is still held by canary. The auxiliary projection must NEVER turn
 * that into a successful commercial GRO, nor destroy the source-only encrypted
 * queue/independent D1 readback that occurred before this request.
 *
 * This is NOT a replacement for deploying the signed production endpoint.
 * Its explicit deferred status is consumed by monitoring and replay policy.
 */
const STATUS=Object.freeze({
 OK:"VERIFIED_UNVERIFIED_PROJECTION",
 EMPTY:"NO_D1_VERIFIED_OBSERVATIONS",
 TRANSPORT:"DEFERRED_TRANSPORT_UNAVAILABLE",
 HTTP:"DEFERRED_ENDPOINT_HTTP",
 RECEIPT:"DEFERRED_RECEIPT_UNVERIFIED",
});
const REASONABLE_URL=/^https:\/\/[^/?#]+\/v1\/internal\/risk-gate\/progressive-(?:facts|observations)$/u;
const validToken=token=>typeof token==="string"&&token.length>=32;
const deferred=(status,reason,total,accepted,requests,httpStatus=null)=>Object.freeze({
 schema:"geomacro.auxiliary-osint-projection-outcome.v1",
 status,reason,requested:total,acknowledged:accepted,
 deferred:total-accepted,verified_receipt_count:accepted,
 requests,http_status:httpStatus,complete:false,production_endpoint_verified:false,
 verified_original_source_d1_receipts_unchanged:true,
 raw_news_text_sent:false,rights_verified:false,commercial_eligible:false,
 independent_reviewed:false,signed_gro_published:false,predge_delivered:false,
 payments:0,
});
export async function submitAuxiliaryOsintProjection({
 records,endpoint,token,requestSchema,requestField,receiptSchema,
 validateReceipt,fetchImpl=fetch,timeoutMs=12000
}={}){
 if(!Array.isArray(records)||records.length>100||!records.every(x=>x&&typeof x==="object"&&!Array.isArray(x))||
    !REASONABLE_URL.test(endpoint??"")||!validToken(token)||
    !/^geomacro\.[a-z0-9.-]+\.v1$/u.test(requestSchema??"")||
    !["facts","observations"].includes(requestField)||
    !/^geomacro\.[a-z0-9.-]+\.v1$/u.test(receiptSchema??"")||
    typeof validateReceipt!=="function"||
    !Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>20000)
   throw Error("AUXILIARY_OSINT_PROJECTION_POLICY_INVALID");
 if(records.length===0)return deferred(STATUS.EMPTY,"NO_RECORDS",0,0,0);
 let accepted=0,requests=0;
 for(let i=0;i<records.length;i+=25){
  const batch=records.slice(i,i+25);
  let response;
  requests++;
  try{
   response=await fetchImpl(endpoint,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Accept":"application/json",
     "Content-Type":"application/json","Cache-Control":"no-store"},
    body:JSON.stringify({schema:requestSchema,[requestField]:batch}),
    signal:AbortSignal.timeout(timeoutMs),
   });
  }catch{
   return deferred(STATUS.TRANSPORT,"FETCH_OR_TIMEOUT",records.length,accepted,requests);
  }
  if(!response||response.status!==200){
   const status=Number.isInteger(response?.status)?response.status:null;
   return deferred(STATUS.HTTP,status===405?"WORKER_ROUTE_NOT_DEPLOYED_OR_METHOD_NOT_ALLOWED":
    "ENDPOINT_REJECTED",records.length,accepted,requests,status);
  }
  let receipt;
  try{receipt=await response.json()}catch{
   return deferred(STATUS.RECEIPT,"NON_JSON_RECEIPT",records.length,accepted,requests,200);
  }
  if(receipt?.ok!==true||receipt.schema!==receiptSchema||
     receipt.accepted!==batch.length||validateReceipt(receipt,batch)!==true){
   return deferred(STATUS.RECEIPT,"RECEIPT_CONTRACT_MISMATCH",records.length,accepted,requests,200);
  }
  accepted+=batch.length;
 }
 return Object.freeze({...deferred(STATUS.OK,"VERIFIED",records.length,accepted,requests,200),
  complete:true,production_endpoint_verified:true,deferred:0});
}

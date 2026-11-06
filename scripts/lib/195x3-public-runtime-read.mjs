/**
 * Bounded, public-only reads used by the independent 195x3 audit.
 * Retry transport failures, 429 and transient 5xx; never retry 401/403,
 * malformed proof, oversized bodies or invalid endpoint paths.
 * This cannot turn a failed D1 read into a quiet-source certification.
 */
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/";
const PATHS=new Set(["source-runtime","automated-finds"]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fail=code=>{throw new Error("COUNTRY_RUNTIME_"+code)};
const retryableStatus=status=>status===429||[500,502,503,504].includes(status);
export async function readPublicCountryRuntime(path,{
  fetcher=fetch,pause=sleep,maxBytes=300_000,attempts=3,timeoutMs=10_000,
}={}){
  if(!PATHS.has(path)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>750_000||
     !Number.isSafeInteger(attempts)||attempts<1||attempts>3||
     !Number.isSafeInteger(timeoutMs)||timeoutMs<500||timeoutMs>15_000)
    fail("READ_BOUNDS_INVALID");
  for(let attempt=0;attempt<attempts;attempt++){
    let response;
    try{
      response=await fetcher(ROOT+path,{
        method:"GET",redirect:"error",cache:"no-store",
        headers:{Accept:"application/json"},
        signal:AbortSignal.timeout(timeoutMs),
      });
    }catch{
      if(attempt+1===attempts)fail("TRANSPORT_UNAVAILABLE");
      await pause(Math.min(1000,200*(attempt+1)));
      continue;
    }
    if(!response||typeof response.status!=="number")fail("RESPONSE_INVALID");
    if(!response.ok){
      if(!retryableStatus(response.status))fail(
        response.status===401||response.status===403?"AUTH_OR_ACCESS_DENIED":"HTTP_PERMANENT");
      if(attempt+1===attempts)fail(response.status===429?"PROVIDER_THROTTLED":"PROVIDER_UNAVAILABLE");
      await pause(Math.min(1000,200*(attempt+1)));
      continue;
    }
    const declared=response.headers?.get("content-length");
    if(declared!==null&&declared!==undefined&&
       (!/^\d+$/u.test(declared)||Number(declared)>maxBytes))fail("RESPONSE_TOO_LARGE");
    let raw;
    try{raw=await response.text();}catch{
      if(attempt+1===attempts)fail("BODY_READ_UNAVAILABLE");
      await pause(Math.min(1000,200*(attempt+1)));
      continue;
    }
    if(Buffer.byteLength(raw,"utf8")>maxBytes)fail("RESPONSE_TOO_LARGE");
    let document;
    try{document=JSON.parse(raw);}catch{fail("JSON_INVALID")}
    if(!document||typeof document!=="object"||Array.isArray(document))
      fail("DOCUMENT_INVALID");
    return document;
  }
  fail("READ_EXHAUSTED");
}

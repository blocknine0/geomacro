/**
 * Per-POP read-through cache for exact, anonymous, PUBLIC free D1 projections.
 * A bounded 45s window reduces repeated 250-750-row D1 reads; never cache
 * protected/private responses, live signed products, error/503 or paid routes.
 * This is a best-effort query reduction, NOT a global quota reservation or
 * proof that an upstream news publisher is fresh.
 */
export const PUBLIC_FREE_D1_TTL_SECONDS = 45;
const PATHS = new Set([
  "/v1/public/three-domain-continuity",
  "/v1/public/website-derived-news",
  "/v1/public/website-derived-news-immediate",
  "/v1/public/website-derived-news-html",
  "/v1/public/reusable-source-news",
]);
const forbidden = new Set(["authorization","cookie","range","x-api-key"]);
// Per-isolate single-flight avoids the D1 read stampede between a cache miss
// and the cache PUT. Cache API remains authoritative across requests/POPs.
const inFlightPublicReads=new Map();
export function eligiblePublicFreeD1CacheRequest(request){
  if(request?.method!=="GET")return false;
  const url=new URL(request.url);
  if(!PATHS.has(url.pathname))return false;
  // The public native-news lane is requested by category. Cache only the
  // three fixed category filters, never arbitrary country, offset or encoded
  // query permutations. Internal authenticated readback MUST bypass cache.
  if(url.search){
    const params=url.searchParams;
    if(url.pathname!=="/v1/public/reusable-source-news"||
       params.size!==1||params.getAll("domain").length!==1||
       !["geopolitics","macro","rare_earth"].includes(params.get("domain")))
      return false;
  }
  if(request.headers.has("cache-control")&&
     /(?:no-cache|no-store)/iu.test(request.headers.get("cache-control")))return false;
  return [...forbidden].every(name=>!request.headers.has(name));
}
export async function readPublicFreeD1Cached(request,calculate,{
  cache=null,waitUntil=null,
}={}){
  if(typeof calculate!=="function")throw Error("PUBLIC_D1_CACHE_HANDLER_REQUIRED");
  if(!eligiblePublicFreeD1CacheRequest(request)||!cache)
    return calculate();
  const url=new URL(request.url);
  // Cache key never captures cookies, tokens, headers or query parameters.
  const key=new Request(url.origin+url.pathname+url.search,{method:"GET"});
  try {
    const cached=await cache.match(key);
    if(cached?.status===200 &&
       cached.headers.get("Cache-Control")==="public, max-age="+PUBLIC_FREE_D1_TTL_SECONDS &&
       !cached.headers.has("Set-Cookie"))return cached;
  }catch{ /* unavailable cache: fall back to truthful D1 response */ }
  const pending=inFlightPublicReads.get(key.url);
  if(pending)return (await pending).clone();
  const work=(async()=>{
    const response=await calculate();
    // Never cache invalid, paid, protected, cookie-set or 503/429 response.
    if(response?.status!==200||response.headers.has("Set-Cookie"))
      return response;
    const headers=new Headers(response.headers);
    headers.set("Cache-Control","public, max-age="+PUBLIC_FREE_D1_TTL_SECONDS);
    headers.set("Vary","Accept-Encoding");
    const bounded=new Response(response.body,{status:200,headers});
    try{
      // Keep the single-flight open until the cache is warm. Scheduling a PUT
      // only with waitUntil permits simultaneous new misses after this request.
      // A failed cache write is degraded but cannot alter D1 truth.
      await cache.put(key,bounded.clone());
    }catch{/* Unavailable cache never turns a failed D1 read into success. */}
    return bounded;
  })();
  inFlightPublicReads.set(key.url,work);
  try{return (await work).clone()}
  finally{
    if(inFlightPublicReads.get(key.url)===work)
      inFlightPublicReads.delete(key.url);
  }
}

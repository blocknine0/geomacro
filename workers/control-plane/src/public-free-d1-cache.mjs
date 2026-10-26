/**
 * Per-POP read-through cache for exact, anonymous, PUBLIC free D1 projections.
 * A bounded 45s window reduces repeated public reads; the full 600-row
 * journal bundle uses a 15s TTL so strict readback freshness remains valid.
 * Never cache protected/private responses, signed products, errors or paid routes.
 * Per-POP caching is best-effort, NOT a global quota reservation or freshness SLA.
 */
export const PUBLIC_FREE_D1_TTL_SECONDS = 45;
export const PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS = 15;
const PATHS = new Set([
  "/v1/public/three-domain-continuity",
  "/v1/public/website-derived-news",
  "/v1/public/website-derived-news-immediate",
  "/v1/public/website-derived-news-bundle",
  "/v1/public/website-derived-news-html",
]);
const forbidden = new Set(["authorization","cookie","range","x-api-key"]);
const TTL_REQUEST_BYPASS = /(?:^|,)(?:\s*no-cache\s*|\s*no-store\s*|\s*max-age\s*=\s*0\s*)(?:,|$)/iu;
function cacheTtl(pathname){
  return pathname==="/v1/public/website-derived-news-bundle"
    ?PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS:PUBLIC_FREE_D1_TTL_SECONDS;
}
export function eligiblePublicFreeD1CacheRequest(request){
  if(request?.method!=="GET")return false;
  const url=new URL(request.url);
  if(url.search||!PATHS.has(url.pathname))return false;
  // Internal readback clients can demand a fresh D1 response. Never let a
  // stale edge entry override explicit Cache-Control/Pragma revalidation.
  const cacheControl=String(request.headers.get("cache-control")??"");
  const pragma=String(request.headers.get("pragma")??"");
  if(TTL_REQUEST_BYPASS.test(cacheControl)||/(?:^|,)\s*no-cache\s*(?:,|$)/iu.test(pragma))return false;
  return [...forbidden].every(name=>!request.headers.has(name));
}
export async function readPublicFreeD1Cached(request,calculate,{
  cache=null,waitUntil=null,
}={}){
  if(typeof calculate!=="function")throw Error("PUBLIC_D1_CACHE_HANDLER_REQUIRED");
  if(!eligiblePublicFreeD1CacheRequest(request)||!cache)
    return calculate();
  const url=new URL(request.url),ttl=cacheTtl(url.pathname);
  // Cache key never captures cookies, tokens, headers or query parameters.
  const key=new Request(url.origin+url.pathname,{method:"GET"});
  try {
    const cached=await cache.match(key);
    if(cached?.status===200 &&
       cached.headers.get("Cache-Control")==="public, max-age="+ttl &&
       !cached.headers.has("Set-Cookie"))return cached;
  }catch{ /* unavailable cache: fall back to truthful D1 response */ }
  const response=await calculate();
  // Do not conceal missing quotas/storage: fail-closed responses are NEVER
  // cached and retain their original 503/no-store semantics.
  if(response?.status!==200||response.headers.has("Set-Cookie"))
    return response;
  const headers=new Headers(response.headers);
  headers.set("Cache-Control","public, max-age="+ttl);
  headers.set("Vary","Accept-Encoding");
  const bounded=new Response(response.body,{status:200,headers});
  try {
    const write=Promise.resolve(cache.put(key,bounded.clone())).catch(()=>{});
    if(typeof waitUntil==="function")waitUntil(write);
    else await write;
  }catch{ /* no effect on response or D1 */ }
  return bounded;
}

/**
 * Per-POP read-through cache for exact, anonymous, PUBLIC free D1 projections.
 * A bounded 45s window reduces repeated D1 reads for public website pages
 * (0/250/500) and the source-neutral machine pilot feed, across matching
 * requests at a given POP. No new D1/B2 writes, remote vendor or credentials.
 * Never cache protected/private responses, partner Predge views, signed
 * products, errors/503/429 or paid routes.
 * This is a best-effort query reduction, NOT a global quota reservation or
 * proof that an upstream news publisher is fresh.
 */
export const PUBLIC_FREE_D1_TTL_SECONDS = 45;
export const PUBLIC_FREE_D1_DERIVED_TTL_SECONDS = 120;
export const PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS = 15;
const PATHS = new Set([
  "/v1/public/macro-fastlane",
  "/v1/public/fastlane-intelligence",
  "/v1/public/three-domain-continuity",
  "/v1/public/website-derived-news",
  "/v1/public/website-derived-news-immediate",
  "/v1/public/website-derived-news-bundle",
  "/v1/public/website-derived-news-html",
  "/v1/public/reusable-source-news",
  "/v1/public/derived-structural-72h",
]);
const PAGED_NEWS_PATHS = new Set([
  "/v1/public/website-derived-news",
  "/v1/public/website-derived-news-immediate",
]);
const DOMAINS = new Set(["macro","geopolitics","rare_earth"]);
const CANONICAL_OFFSETS = new Set(["offset=250","offset=500"]);
// Query string must be *literally canonical*: no duplicate, encoded, nested
// or arbitrary filtering that can poison a shared public cache key.
const categoryQuery = query => query.startsWith("domain=") &&
  DOMAINS.has(query.slice("domain=".length)) &&
  query === "domain="+query.slice("domain=".length);
const forbidden = new Set(["authorization","cookie","range","x-api-key"]);
const HIGH_READ_DERIVED_PATHS=new Set([
  "/v1/public/website-derived-news",
  "/v1/public/website-derived-news-immediate",
  "/v1/public/website-derived-news-html",
  "/v1/public/derived-structural-72h",
]);
const ttlForPath=pathname=>
  pathname==="/v1/public/website-derived-news-bundle"?PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS:
  HIGH_READ_DERIVED_PATHS.has(pathname)?PUBLIC_FREE_D1_DERIVED_TTL_SECONDS:
  PUBLIC_FREE_D1_TTL_SECONDS;
// Per-isolate single-flight avoids the D1 read stampede between a cache miss
// and the cache PUT. Cache API remains authoritative across requests/POPs.
const inFlightPublicReads=new Map();
export function eligiblePublicFreeD1CacheRequest(request){
  if(request?.method!=="GET")return false;
  const url=new URL(request.url);
  if(!PATHS.has(url.pathname))return false;
  // Cache only exact public categories and bounded journal pages; no custom
  // country, arbitrary offset, query aliases or untrusted query permutations.
  // Internal readback must explicitly send Cache-Control: no-cache, and
  // authenticated requests are always excluded below.
  if(url.search){
    const raw=url.search.slice(1);
    if(url.pathname==="/v1/public/reusable-source-news" ||
       url.pathname==="/v1/public/derived-structural-72h" ||
       url.pathname==="/v1/public/fastlane-intelligence"){
      if(!categoryQuery(raw))return false;
    }else if(PAGED_NEWS_PATHS.has(url.pathname)){
      if(!CANONICAL_OFFSETS.has(raw))return false;
    }else return false;
  }
  if(request.headers.has("cache-control")&&
     /(?:no-cache|no-store|max-age\s*=\s*0)/iu.test(request.headers.get("cache-control")))return false;
  // Cache-Control and Pragma are both used by strict readback clients.
  if(/(?:^|,)\s*no-cache\s*(?:,|$)/iu.test(request.headers.get("pragma")??""))return false;
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
  const ttl=ttlForPath(url.pathname);
  try {
    const cached=await cache.match(key);
    if(cached?.status===200 &&
       cached.headers.get("Cache-Control")==="public, max-age="+ttl &&
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
    headers.set("Cache-Control","public, max-age="+ttl);
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

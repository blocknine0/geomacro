// #1827: A PRIVATE Cache API marker avoids repeated Backblaze origin reads
// from the same POP while a D1 hot snapshot/verified continuity is unavailable.
// This is NOT a current risk record, a historical claim or a public HTTP 200.
// Global D1 B2 reservation still applies to every actual origin GET.
export const B2_ORIGIN_FAILURE_TTL_SECONDS = 120;
const MARKER = "x-geomacro-internal-b2-origin-failure";
const PRODUCTS = new Set(["/intelligence","/global-risk","/risk-indices"]);

export function b2OriginFailureCacheKey(origin,product) {
  const url=new URL(origin);
  if(url.protocol!=="https:")
    throw new Error("B2_ORIGIN_CACHE_ORIGIN_INVALID");
  if(!PRODUCTS.has(product)) throw new Error("B2_ORIGIN_CACHE_PRODUCT_INVALID");
  // Public Worker route rejects all queries. A customer cannot fetch the
  // private 200 marker directly, even if they guess this exact cache key.
  return new Request(url.origin+product+"?__geomacro_private_b2_failed=v1",{
    method:"GET",
  });
}

export async function failedB2OriginRecently(cache,key) {
  try {
    const response=await cache.match(key);
    return response?.status===200 && response.headers.get(MARKER)==="1";
  } catch {
    // Cache API failure never waives the global D1 B2 admission guard.
    return false;
  }
}

export async function rememberFailedB2Origin(cache,key) {
  const internalOnly=new Response("",{
    status:200,
    headers:{
      "cache-control":"public, max-age="+B2_ORIGIN_FAILURE_TTL_SECONDS,
      [MARKER]:"1",
      "x-content-type-options":"nosniff",
    },
  });
  try {
    await cache.put(key,internalOnly);
    return true;
  } catch {
    // Best-effort POP-only optimization; caller still returns fail-closed 503.
    return false;
  }
}

/**
 * Cloudflare Cache API read-through, for explicitly allowlisted anonymous GETs.
 * Cache API DOES NOT implement RFC stale-while-revalidate itself; we emulate
 * soft/hard expiry, ctx.waitUntil revalidation, and per-isolate single-flight.
 * Never use this for PREDGE authenticated APIs, payments, signed risk decisions,
 * customer-scoped data, protected readback, or responses with Set-Cookie.
 */
const inFlight=new Map();
const banned=["authorization","cookie","x-api-key","range"];
export function publicEdgeCacheEligible(req){
 if(req?.method!=="GET")return false;
 const path=new URL(req.url).pathname;
 if(!(path.startsWith("/v1/public/")||path.startsWith("/api/v1/feed/")))return false;
 if(banned.some(h=>req.headers.has(h)))return false;
 if(/(?:no-store|no-cache|max-age\\s*=\\s*0)/iu.test(req.headers.get("Cache-Control")??""))return false;
 if(/\\bno-cache\\b/iu.test(req.headers.get("Pragma")??""))return false;
 return true;
}
const epoch=()=>Date.now();
const freshResponse=(body,state,soft)=> {
 const r=new Response(body.body,{status:body.status,statusText:body.statusText,headers:body.headers});
 r.headers.delete("x-geomacro-cache-soft-until");
 r.headers.delete("x-geomacro-cache-hard-until");
 r.headers.delete("x-geomacro-private-cache-tags");
 r.headers.set("X-GeoMacro-Edge-Cache",state);
 // Never let browsers extend the stale window beyond the edge hard expiry.
 r.headers.set("Cache-Control","public, max-age="+(state==="STALE"?0:soft));
 return r;
};
export async function withPublicEdgeCache(req,producer,{
 cache=null,waitUntil=null,eligible=publicEdgeCacheEligible,
 ttlSeconds=60,staleSeconds=300,tag="geomacro-public",now=epoch,
}={}){
 if(typeof producer!=="function")throw Error("EDGE_CACHE_PRODUCER_REQUIRED");
 if(!eligible(req)||!cache)return producer();
 if(!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>300||
    !Number.isInteger(staleSeconds)||staleSeconds<0||staleSeconds>300||
    !/^[a-z0-9-]{1,50}$/u.test(tag))throw Error("EDGE_CACHE_POLICY_INVALID");
 const url=new URL(req.url),key=new Request(url.toString(),{method:"GET"});
 const mapKey=key.url,instant=now();
 let saved=null;
 try{saved=await cache.match(key)}catch{/* Go to origin; never hide an error. */}
 if(saved?.status===200&&!saved.headers.has("Set-Cookie")){
  const soft=Number(saved.headers.get("x-geomacro-cache-soft-until"));
  const hard=Number(saved.headers.get("x-geomacro-cache-hard-until"));
  if(Number.isSafeInteger(soft)&&Number.isSafeInteger(hard)&&
     soft<=hard&&instant<hard){
    if(instant<soft)return freshResponse(saved.clone(),"HIT",Math.max(0,Math.ceil((soft-instant)/1000)));
    if(typeof waitUntil==="function"){
      // Stale response is safe only within explicit 5-minute max stale window.
      const task=refresh();try{waitUntil(task)}catch{/* no background task */ }
      return freshResponse(saved.clone(),"STALE",ttlSeconds);
    }
  }
 }
 return await refresh();

 async function refresh(){
  if(inFlight.has(mapKey))return (await inFlight.get(mapKey)).clone();
  const job=(async()=>{
   const result=await producer();
   if(result?.status!==200||result.headers.has("Set-Cookie")||
      result.headers.get("Cache-Control")?.includes("private")||
      result.headers.get("Cache-Control")?.includes("no-store")&&result.headers.get("X-GeoMacro-Public-Offload")==="protected")
    return result;
   const soft=now()+ttlSeconds*1000,hard=soft+staleSeconds*1000;
   const headers=new Headers(result.headers);
   headers.set("Cache-Control","public, max-age="+(ttlSeconds+staleSeconds));
   headers.set("Cache-Tag",tag);
   headers.set("x-geomacro-private-cache-tags",tag);
   headers.set("x-geomacro-cache-soft-until",String(soft));
   headers.set("x-geomacro-cache-hard-until",String(hard));
   const stored=new Response(result.body,{status:result.status,headers});
   try{await cache.put(key,stored.clone())}catch{/* origin result stays truthful */}
   return freshResponse(stored,"MISS",ttlSeconds);
  })();
  inFlight.set(mapKey,job);
  try{return (await job).clone()}finally{
   if(inFlight.get(mapKey)===job)inFlight.delete(mapKey);
  }
 }
}

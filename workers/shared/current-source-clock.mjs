/**
 * Live/chargeable edge replies are a stricter contract than an immutable
 * 12h/3h signed reference or a successful B2 archive hash readback.
 * No clock can be advanced by cache fill, D1 restore, or deploy time.
 */
export const LIVE_CURRENT_SOURCE_MS = 60 * 60_000;
export const MAX_FUTURE_CLOCK_MS = 5 * 60_000;

export function originalSourceIsCurrent(value,now=Date.now()){
  const source=Date.parse(String(value??""));
  return Number.isFinite(now) && Number.isFinite(source) &&
    source<=now+MAX_FUTURE_CLOCK_MS &&
    source>=0 && now-source<=LIVE_CURRENT_SOURCE_MS;
}

export function liveEdgeCacheControl(original,now=Date.now()){
 if(!originalSourceIsCurrent(original,now))return "no-store";
 const source=Date.parse(String(original));
 // Never allow intermediary/CDN stale-while-revalidate or stale-if-error:
 // those could resurrect an expired proof without running the Worker.
 const seconds=Math.floor((source+LIVE_CURRENT_SOURCE_MS-now)/1000);
 return seconds>1?"public, max-age="+Math.min(30,seconds-1):"no-store";
}

export function intelligenceOriginalSourceTime(rows){
  if(!Array.isArray(rows)||rows.length===0)return null;
  const scored=rows.filter(row=>row?.public_status==="verified_b2");
  if(!scored.length)return null;
  const times=scored.map(row=>Date.parse(String(row?.published_at??"")));
  if(!times.every(Number.isFinite))return null;
  return new Date(Math.max(...times)).toISOString();
}

export async function validatedCachedLiveResponse(cached,product,now=Date.now()){
  if(!cached||cached.status!==200)return null;
  const header=cached.headers.get("x-geomacro-source-as-of");
  if(!originalSourceIsCurrent(header,now))return null;
  // Old cache responses without a recorded verified B2/D1 authority cannot
  // acquire commercial/current authority through a new Worker deployment.
  if(!cached.headers.get("x-geomacro-b2-verification") &&
     !cached.headers.get("x-geomacro-continuity"))return null;
  let body;
  try{body=await cached.clone().json();}catch{return null;}
  if(body?.source_project!=="ldpwajisioljyjtojvfx")return null;
  let nativeTime;
  switch(product){
    case "intelligence":
      if(body?.schema!=="geomacro.public-intelligence-live.v1")return null;
      nativeTime=intelligenceOriginalSourceTime(body.rows);
      if(!nativeTime)return null;
      break;
    case "global-risk":
      if(body?.schema!=="geomacro.public-global-risk-live.v1" ||
         body?.data?.verificationStatus!=="verified")return null;
      nativeTime=body.data.snapshotAsOf;
      break;
    case "risk-indices":
      if(body?.schema!=="geomacro.public-risk-indices-live.v1" ||
         body?.data?.verificationStatus!=="verified")return null;
      nativeTime=body.data.snapshotAsOf;
      break;
    default:return null;
  }
  if(!originalSourceIsCurrent(nativeTime,now) ||
     Date.parse(nativeTime)!==Date.parse(header))return null;
  // The caller retains its own schema/hash/scores and verification checks.
  return cached;
}

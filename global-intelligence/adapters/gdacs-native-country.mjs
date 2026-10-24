import {gdacsOfficialEqRssCountryFallback} from "./gdacs-official-eq-rss.mjs";
// Official GDACS disaster event list. A first-party native event country
// field is a source assertion, not an independently verified affected region,
// official country impact, news publication time, or geopolitical event.
const GDACS_EVENTS_ENDPOINT = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const DAY_MS = 86_400_000;
// This is a rolling hazard discovery lookback, not a claim of current publication
// or a verified affected-country set. Never request a future calendar date.
export function gdacsCountryEventListUrl(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw Error("GDACS_CLOCK_INVALID");
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  const url = new URL(GDACS_EVENTS_ENDPOINT);
  url.searchParams.set("eventlist", "EQ");
  url.searchParams.set("fromdate", start);
  url.searchParams.set("todate", end);
  // Two protected-main runs hit 512 KiB with default/25-event GeoJSON.
  // Use the provider quickstart\x27s lowercase pagesize/pagenumber keys and a
  // three-item first page, while retaining the fixed memory/timeout limits.
  url.searchParams.set("pagesize", "3");
  url.searchParams.set("pagenumber", "1");
  return url.href;
}
const MAX_BYTES=512*1024;
function nativeIso3(p){
  const s=String(p?.iso3??p?.countryiso3??p?.country_iso3??"").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s)?s:null;
}
function nativeDate(p){
  const s=String(p?.fromdate??p?.fromDate??p?.eventdate??"");
  const d=Date.parse(s);
  return Number.isFinite(d)&&s?new Date(d).toISOString():null;
}
export function inspectGdacsCountryNative(payload){
  const features=payload?.features??payload?.events;
  if(!Array.isArray(features)||features.length>500)
    throw Error("GDACS_FEATURE_COLLECTION_INVALID");
  let nativeCountryRows=0,validNativeTimeRows=0,geoRows=0;
  const seen=new Set();
  for(const f of features){
    const p=f?.properties;
    if(!p||typeof p!=="object")continue;
    const id=String(p.eventid??p.eventId??"");
    if(!/^\d{1,14}$/u.test(id)||seen.has(id))continue;
    seen.add(id);
    const code=nativeIso3(p);
    const country=String(p.country??p.countryname??"").trim();
    if(code&&country&&country.length<=120)nativeCountryRows++;
    if(nativeDate(p))validNativeTimeRows++;
    const coords=f?.geometry?.coordinates;
    if(f.geometry?.type==="Point"&&Array.isArray(coords)&&coords.length===2&&
       Number.isFinite(coords[0])&&Number.isFinite(coords[1])&&
       coords[0]>=-180&&coords[0]<=180&&coords[1]>=-90&&coords[1]<=90)
      geoRows++;
  }
  // Non-empty provider data that contains zero valid first-party event IDs
  // is an upstream shape failure, NOT a healthy empty hazard response.
  if(features.length>0&&seen.size===0)throw Error("GDACS_EVENT_IDS_UNVERIFIED");
  return {
    schema:"geomacro.gdacs-native-event-attribution.v1",
    event_count:seen.size,native_country_identifiers:nativeCountryRows,
    native_event_time_count:validNativeTimeRows,point_geometry_valid_count:geoRows,
    // A country code found next to a hazard epicenter is not verification
    // of *all affected countries*, or a current geopolitical event.
    all_affected_countries_verified:false,native_release_clock_verified:false,
    verified_current_geopolitical_events:0,
    source_rights_approved:false,commercial_paid_eligible:false,
    raw_upstream_payload_stored:false,
  };
}
export async function fetchGdacsNativeCountry({fetchImpl=fetch,now=new Date()}={}){
 const url=gdacsCountryEventListUrl(now);
 const r=await fetchImpl(url,{method:"GET",redirect:"error",
   signal:AbortSignal.timeout(12000),headers:{accept:"application/json"}});
 if(!r.ok){await r.body?.cancel().catch(()=>{});throw Error("GDACS_HTTP_"+r.status);}
 let primary;
 try{
   if(!r.body||Number(r.headers.get("content-length")??0)>MAX_BYTES)
     throw Error("GDACS_BODY_LIMIT");
   const rd=r.body.getReader(),parts=[];let size=0;
   try{for(;;){
     const {done,value}=await rd.read();if(done)break;
     size+=value.byteLength;
     if(size>MAX_BYTES)throw Error("GDACS_BODY_LIMIT");
     parts.push(value);
   }}finally{await rd.cancel().catch(()=>{});rd.releaseLock();}
   const b=new Uint8Array(size);let n=0;for(const p of parts){b.set(p,n);n+=p.byteLength;}
   try{primary=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(b));}
   catch{throw Error("GDACS_JSON_SHAPE_INVALID");}
 }catch(error){
   if(error?.message!=="GDACS_BODY_LIMIT")throw error;
   // One documented first-party alternate only for a 512KiB body cap.
   // 401/403/429, invalid JSON, redirect and unknown shape NEVER use fallback.
   await r.body?.cancel().catch(()=>{});
   const rss=await gdacsOfficialEqRssCountryFallback({fetchImpl,now});
   return {...inspectGdacsCountryNative(rss),
     same_publisher_24h_rss_used:true};
 }
 return {...inspectGdacsCountryNative(primary),
   same_publisher_24h_rss_used:false};
}

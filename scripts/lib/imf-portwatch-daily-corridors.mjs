// First-party IMF PortWatch / ArcGIS daily maritime reference observations.
// Reuses the existing "imf_portwatch" source family and named-corridor IDs.
// Private derived research only: no paid permission, score or raw redistribution.
const ENDPOINT="https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";
const MAX_BYTES=128*1024;
const DAY_MS=86_400_000;
const MAX_LAG_DAYS=21;
const LIMIT=60;
export const PORTWATCH_ROUTE_IDS=Object.freeze({
  chokepoint1:"suez_canal",
  chokepoint2:"panama_canal",
  chokepoint4:"bab_el_mandeb",
  chokepoint5:"strait_of_malacca",
  chokepoint6:"strait_of_hormuz",
  chokepoint11:"taiwan_strait"
});
const IDS=Object.keys(PORTWATCH_ROUTE_IDS);
function utcDay(value){
  if(typeof value==="number" && Number.isSafeInteger(value) && value>=0){
    const date=new Date(value);
    return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
  }
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const parsed=Date.parse(value+"T00:00:00.000Z");
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value?value:null;
}
export function portwatchDailyQueryUrl(){
 const url=new URL(ENDPOINT);
 url.searchParams.set("where","portid IN ("+IDS.map(id=>"'"+id+"'").join(",")+")");
 url.searchParams.set("outFields","portid,date,n_total,n_tanker,n_container");
 url.searchParams.set("orderByFields","date DESC");
 url.searchParams.set("resultRecordCount",String(LIMIT));
 url.searchParams.set("returnGeometry","false");
 url.searchParams.set("f","json");
 return url.href;
}
export function inspectPortwatchDailyResponse(data,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("PORTWATCH_CLOCK_INVALID");
 if(data?.error || !Array.isArray(data?.features) || data.features.length>LIMIT ||
    data.features.length===0)throw Error("PORTWATCH_RESPONSE_INVALID");
 const lastDay=now.toISOString().slice(0,10);
 const perRoute=new Map(IDS.map(id=>[id,new Map()]));
 let malformed=0;
 for(const feature of data.features){
   const a=feature?.attributes;
   if(!a || typeof a!=="object"){malformed++;continue;}
   const id=typeof a.portid==="string"?a.portid.toLowerCase():null;
   const day=utcDay(a.date);
   if(!id || !perRoute.has(id) || !day || day>lastDay ||
      !Number.isSafeInteger(a.n_total) || a.n_total<0 ||
      !(a.n_tanker==null || Number.isSafeInteger(a.n_tanker)&&a.n_tanker>=0) ||
      !(a.n_container==null || Number.isSafeInteger(a.n_container)&&a.n_container>=0)){
      malformed++;continue;
   }
   // A single day/route must not become multiple observations.
   if(perRoute.get(id).has(day)){malformed++;continue;}
   perRoute.get(id).set(day,{
     total:a.n_total,tanker:a.n_tanker??null,container:a.n_container??null
   });
 }
 const routes=IDS.map(id=>{
    const items=[...perRoute.get(id)].sort((a,b)=>b[0].localeCompare(a[0]));
    const latest=items[0],previous=items[1];
    const days=latest?Math.floor((Date.parse(lastDay+"T00:00:00Z")-
                                 Date.parse(latest[0]+"T00:00:00Z"))/DAY_MS):null;
    const previousIsAdjacent=!!latest&&!!previous &&
       Date.parse(latest[0]+"T00:00:00Z")-Date.parse(previous[0]+"T00:00:00Z")===DAY_MS;
    const percentage=previousIsAdjacent&&previous[1].total>0?
       Math.round((latest[1].total/previous[1].total-1)*10_000)/100:null;
    return {
      corridor_id:PORTWATCH_ROUTE_IDS[id],
      latest_observation_day:latest?.[0]??null,
      observation_lag_days:days,
      observation_state:days===null?"NO_RECORD":
        days>MAX_LAG_DAYS?"SOURCE_STALE":"DAILY_REFERENCE_OBSERVED",
      consecutive_day_change_pct:percentage,
      consecutive_day_comparison_available:percentage!==null,
      // This is derived transit context, not proof of a disruption.
      real_time_incident_verified:false,route_score:null,
      commercial_rights_verified:false
    };
 });
 const available=routes.filter(r=>r.observation_state==="DAILY_REFERENCE_OBSERVED").length;
 return {
   schema:"geomacro.portwatch-six-corridor-private-daily.v1",
   checked_at:now.toISOString(),source_family:"imf_portwatch",
   status:malformed>0?"PROVIDER_ROWS_UNVERIFIED":
      available===6?"SIX_CORRIDORS_DAILY_REFERENCE_OBSERVED":
      available>0?"PARTIAL_DAILY_REFERENCE_OBSERVED":"NO_CURRENT_REFERENCE_OBSERVATIONS",
   route_count:routes.length,
   routes_with_recent_daily_observations:available,
   malformed_records:malformed,
   routes,
   shipping_incidents_verified:0,physical_route_geometry_verified:false,
   commercial_rights_verified:false,raw_provider_payload_stored:false,
   signed_risk_generated:false,paid_delivery_enabled:false,
   provider_calls:1,supabase_requests:0,d1_writes:0,b2_requests:0,payments:0
 };
}
async function readBounded(response){
 if(!response.ok)throw Error([401,403,429].includes(response.status)?
   "PORTWATCH_DENIED_OR_QUOTA":"PORTWATCH_HTTP_UNAVAILABLE");
 const declared=Number(response.headers.get("content-length")||0);
 if(declared>MAX_BYTES)throw Error("PORTWATCH_BODY_LIMIT");
 if(!response.body)throw Error("PORTWATCH_BODY_EMPTY");
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{
   for(;;){
     const {done,value}=await reader.read();
     if(done)break;
     bytes+=value.byteLength;
     if(bytes>MAX_BYTES)throw Error("PORTWATCH_BODY_LIMIT");
     chunks.push(value);
   }
 }finally{
   try{await reader.cancel()}catch{}
   reader.releaseLock();
 }
 const all=new Uint8Array(bytes);let offset=0;
 for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
 if(bytes===0)throw Error("PORTWATCH_BODY_EMPTY");
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all))}
 catch{throw Error("PORTWATCH_JSON_INVALID")}
}
export async function observePortwatchDaily({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("PORTWATCH_CLOCK_INVALID");
 const response=await fetchImpl(portwatchDailyQueryUrl(),{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(12_000),
   headers:{accept:"application/json"}
 });
 const parsed=await readBounded(response);
 return inspectPortwatchDailyResponse(parsed,now);
}

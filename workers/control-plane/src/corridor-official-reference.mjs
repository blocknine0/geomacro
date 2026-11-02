/** Private, authenticated official corridor reference context.
 * No source article, no Website Intelligence, PREDGE, x402 or paid scoring.
 */
const AGE=72*3600000,HEX=/^[a-f0-9]{64}$/u;
const ALLOWED=new Set(["gdelt_v2_15m","world_bank_wdi","ecb_data","eurostat_data","imf_portwatch"]);
const METRICS={
 gdelt_v2_15m:/^gdelt_(?:export|gkg|mentions)_batch_bytes$/u,
 world_bank_wdi:/^wdi_gdp_growth_(?:us|cn|in|de|gb)$/u,
 ecb_data:/^ecb_usd_eur_spot$/u,
 eurostat_data:/^eurostat_ea20_hicp_annual_pct$/u,
 imf_portwatch:/^portwatch_daily_transit_pct_change$/u
};
const ROUTES=new Set(["suez_canal","panama_canal","bab_el_mandeb",
 "strait_of_malacca","strait_of_hormuz","taiwan_strait"]);
const FIELDS=["id","source_id","metric_id","observation_period","numeric_value",
 "observed_at","source_native_publication_at","source_observation_is_not_live_event",
 "corridor_ids","context_only","independently_verified_event",
 "commercial_rights_verified","customer_delivery_enabled"];
const response=(obj,status=200)=>Response.json(obj,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"
}});
const iso=s=>typeof s==="string"&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
function fail(){throw Error("CORRIDOR_OFFICIAL_REFERENCE_INVALID")}
async function normalized(row,now){
 if(!row||Array.isArray(row)||typeof row!=="object"||
    Object.keys(row).length!==FIELDS.length||FIELDS.some(k=>!Object.hasOwn(row,k)))
   fail();
 if(!HEX.test(row.id)||!ALLOWED.has(row.source_id)||
    !METRICS[row.source_id].test(row.metric_id)||
    typeof row.observation_period!=="string"||
    !/^\d{4}(?:-\d\d(?:-\d\d)?|-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)?$/u.test(row.observation_period)||
    !(row.numeric_value===null||typeof row.numeric_value==="number"&&
      Number.isFinite(row.numeric_value)&&Math.abs(row.numeric_value)<1000000000000)||
    !iso(row.observed_at)||Math.abs(now-Date.parse(row.observed_at))>15*60000||
    row.source_native_publication_at!==null||
    row.source_observation_is_not_live_event!==true||
    !Array.isArray(row.corridor_ids)||row.corridor_ids.length>6||
    row.corridor_ids.some(x=>!ROUTES.has(x))||
    new Set(row.corridor_ids).size!==row.corridor_ids.length||
    row.context_only!==true||row.independently_verified_event!==false||
    row.commercial_rights_verified!==false||row.customer_delivery_enabled!==false)
   fail();
 if(row.source_id!=="imf_portwatch"&&row.corridor_ids.length!==0)fail();
 if(row.source_id==="imf_portwatch"&&row.corridor_ids.length!==1)fail();
 const str=[row.source_id,row.metric_id,row.observation_period,String(row.numeric_value)].join("\x1f");
 const dig=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));
 const id=[...new Uint8Array(dig)].map(x=>x.toString(16).padStart(2,"0")).join("");
 if(id!==row.id)fail();
 return [id,row.source_id,row.metric_id,row.observation_period,
  row.numeric_value,JSON.stringify(row.corridor_ids)];
}
export async function validateOfficialCorridorReferenceBatch(payload,now=Date.now()){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
   Object.keys(payload).sort().join("|")!==
    ["schema","channel","checked_at","observations","commercial_rights_verified",
     "website_intelligence_enabled"].sort().join("|")||
   payload.schema!=="geomacro.corridor-official-reference-batch.v1"||
   payload.channel!=="CORRIDOR_ONLY"||
   payload.commercial_rights_verified!==false||
   payload.website_intelligence_enabled!==false||
   !iso(payload.checked_at)||Math.abs(now-Date.parse(payload.checked_at))>15*60000||
   !Array.isArray(payload.observations)||payload.observations.length>60)
   fail();
 const records=[];
 for(const obj of payload.observations)records.push(await normalized(obj,now));
 if(new Set(records.map(x=>x[0])).size!==records.length)fail();
 return records;
}
const WRITE="INSERT INTO corridor_official_reference_context "+
 "(reference_id,source_id,metric_id,observation_period,numeric_value,"+
 "corridor_ids_json,first_seen_at,last_observed_at) VALUES (?,?,?,?,?,?,?,?) "+
 "ON CONFLICT(reference_id) DO UPDATE SET last_observed_at=excluded.last_observed_at";
export async function putOfficialCorridorReference(env,payload,now=Date.now()){
 let rows;
 try{rows=await validateOfficialCorridorReferenceBatch(payload,now)}
 catch{return response({ok:false,error:"CORRIDOR_OFFICIAL_REFERENCE_INVALID",chargeable:false},422)}
 if(!env?.DB?.prepare||!env?.DB?.batch)
  return response({ok:false,error:"CORRIDOR_OFFICIAL_D1_UNAVAILABLE",chargeable:false},503);
 const clock=new Date(now).toISOString(),cutoff=new Date(now-AGE).toISOString();
 try{
  for(let i=0;i<rows.length;i+=20)
   await env.DB.batch(rows.slice(i,i+20).map(r=>env.DB.prepare(WRITE).bind(...r,clock,clock)));
  await env.DB.prepare(
   "DELETE FROM corridor_official_reference_context WHERE last_observed_at < ?"
  ).bind(cutoff).run();
  let verified=0;
  for(let i=0;i<rows.length;i+=20){
   const chunk=rows.slice(i,i+20),holders=chunk.map(()=>"?").join(",");
   const found=(await env.DB.prepare(
    "SELECT reference_id,source_id,metric_id,observation_period,numeric_value,"+
    "corridor_ids_json FROM corridor_official_reference_context WHERE reference_id IN ("+
    holders+") AND last_observed_at >= ?"
   ).bind(...chunk.map(r=>r[0]),cutoff).all())?.results??[];
   const byId=new Map(found.map(r=>[r.reference_id,r]));
   verified+=chunk.filter(x=>{
    const r=byId.get(x[0]);
    return r&&r.source_id===x[1]&&r.metric_id===x[2]&&
      r.observation_period===x[3]&&r.numeric_value===x[4]&&
      r.corridor_ids_json===x[5];
   }).length;
  }
  if(verified!==rows.length)
    return response({ok:false,error:"CORRIDOR_OFFICIAL_D1_READBACK_MISMATCH",
      submitted:rows.length,verified,chargeable:false},503);
  return response({ok:true,schema:"geomacro.corridor-official-reference-d1-receipt.v1",
   channel:"CORRIDOR_ONLY",submitted:rows.length,verified,
   d1_readback_verified:true,retention_hours:72,
   website_intelligence_writes:0,publisher_titles_saved:false,
   raw_provider_payload_saved:false,events_verified:0,
   commercial_rights_verified:false,signed_gro_generated:false,chargeable:false});
 }catch{return response({ok:false,error:"CORRIDOR_OFFICIAL_D1_WRITE_UNAVAILABLE",chargeable:false},503)}
}
export async function readOfficialCorridorReference(env,params=new URLSearchParams(),now=Date.now()){
 if(!env?.DB?.prepare)
  return response({ok:false,error:"CORRIDOR_OFFICIAL_D1_UNAVAILABLE",chargeable:false},503);
 const count=params.get("limit")??"25";
 if(!/^(?:[1-9]|[1-4]\d|50)$/u.test(count))
  return response({ok:false,error:"CORRIDOR_OFFICIAL_LIMIT_INVALID",chargeable:false},400);
 try{
  const rows=(await env.DB.prepare(
   "SELECT reference_id,source_id,metric_id,observation_period,numeric_value,"+
   "corridor_ids_json,last_observed_at FROM corridor_official_reference_context "+
   "WHERE last_observed_at >= ? ORDER BY last_observed_at DESC LIMIT ?"
  ).bind(new Date(now-AGE).toISOString(),Number(count)).all())?.results??[];
  return response({ok:true,schema:"geomacro.corridor-official-reference-private-read.v1",
   channel:"CORRIDOR_ONLY",count:rows.length,observations:rows.map(r=>({
    id:r.reference_id,source_id:r.source_id,metric_id:r.metric_id,
    observation_period:r.observation_period,numeric_value:r.numeric_value,
    corridor_ids:JSON.parse(r.corridor_ids_json),last_observed_at:r.last_observed_at
   })),independent_events_verified:false,commercial_eligible:false,chargeable:false});
 }catch{return response({ok:false,error:"CORRIDOR_OFFICIAL_D1_READ_UNAVAILABLE",chargeable:false},503)}
}
export async function purgeExpiredOfficialCorridorReferences(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 try{
  await env.DB.prepare(
   "DELETE FROM corridor_official_reference_context WHERE last_observed_at < ?"
  ).bind(new Date(now-AGE).toISOString()).run();
  return {ok:true};
 }catch{return {ok:false}}
}

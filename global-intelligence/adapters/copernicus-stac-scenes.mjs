import {createHash} from "node:crypto";

/** Official anonymous Copernicus Data Space STAC scene discovery.
 * A scene item, imagery readback, affected country and verified supply disruption
 * are FOUR different evidence milestones. This adapter only proves STAC item
 * metadata. No raw scenes/assets, commercial approval or signed intelligence.
 */
export const STAC_BASE="https://stac.dataspace.copernicus.eu/v1";
const STAC_COLLECTION="sentinel-2-l2a";
const MAX_BYTES=512*1024;
export const MINERAL_REGION_PILOT=Object.freeze({
  // Fixed small region in northern Chile for transport health only:
  // this does NOT certify a particular mine or production change.
  bbox:Object.freeze([-69.35,-24.55,-68.95,-24.15]),
  region_label:"northern_chile_technical_sample",
});
function validateBbox(raw){
  if(!Array.isArray(raw)||raw.length!==4||
     raw.some(x=>typeof x!=="number"||!Number.isFinite(x)))throw Error("STAC_BBOX_INVALID");
  const [w,s,e,n]=raw;
  if(w< -180||e>180||s< -90||n>90||e<=w||n<=s||e-w>1||n-s>1)
    throw Error("STAC_BBOX_OUT_OF_SCOPE");
  return [w,s,e,n];
}
function dateTime(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value))
    throw Error("STAC_ACQUISITION_TIMESTAMP_INVALID");
  const n=Date.parse(value);
  if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,19)!==value.slice(0,19))
    throw Error("STAC_ACQUISITION_TIMESTAMP_INVALID");
  return n;
}
export function buildCopernicusSceneQuery({bbox=MINERAL_REGION_PILOT.bbox,now=new Date(),days=60}={}){
  const bounds=validateBbox(bbox);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Number.isSafeInteger(days)||days<1||days>120)throw Error("STAC_QUERY_SCOPE_INVALID");
  const start=new Date(now.getTime()-days*86400000);
  const url=new URL(STAC_BASE+"/collections/"+STAC_COLLECTION+"/items");
  url.searchParams.set("bbox",bounds.join(","));
  url.searchParams.set("datetime",start.toISOString()+"/"+now.toISOString());
  url.searchParams.set("limit","5");
  return {url:url.href,bbox:bounds,window_start:start.toISOString(),window_end:now.toISOString()};
}
function intersects(a,b){
  return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
}
export function parseCopernicusScenes(payload,{bbox=MINERAL_REGION_PILOT.bbox,now=new Date(),days=60}={}){
  const query=buildCopernicusSceneQuery({bbox,now,days});
  if(payload?.type!=="FeatureCollection"||!Array.isArray(payload?.features)||
     payload.features.length>5)throw Error("STAC_ITEM_COLLECTION_INVALID");
  const seen=new Set(),scenes=[];
  for(const item of payload.features){
    if(item?.type!=="Feature"||item?.collection!==STAC_COLLECTION||
       typeof item.id!=="string"||!item.id.trim()||item.id.length>300||
       !Array.isArray(item.bbox)||item.bbox.length<4 ||
       item.bbox.slice(0,4).some(x=>!Number.isFinite(x))||
       item.bbox[2]<item.bbox[0]||item.bbox[3]<item.bbox[1]||
       !intersects(item.bbox,query.bbox))
      throw Error("STAC_SCENE_ID_OR_GEO_INVALID");
    const timestamp=item.properties?.datetime;
    const acquisition=dateTime(timestamp);
    const start=Date.parse(query.window_start),end=Date.parse(query.window_end);
    if(acquisition<start||acquisition>end+5*60000)
      throw Error("STAC_ACQUISITION_OUTSIDE_WINDOW");
    if(!item.geometry||!["Polygon","MultiPolygon"].includes(item.geometry.type)||
       !Array.isArray(item.geometry.coordinates)||!item.geometry.coordinates.length)
      throw Error("STAC_GEOMETRY_INVALID");
    const assets=item.assets;
    if(!assets||typeof assets!=="object"||Array.isArray(assets))
      throw Error("STAC_ASSETS_MISSING");
    const assetCount=Object.values(assets).filter(a=>a&&typeof a.href==="string").length;
    if(assetCount<1)throw Error("STAC_ASSETS_MISSING");
    const digest=createHash("sha256").update(
      JSON.stringify([item.id,timestamp,item.bbox,STAC_COLLECTION])).digest("hex");
    if(seen.has(digest))continue;
    seen.add(digest);
    scenes.push({
      scene_sha256:digest,acquired_at:timestamp,
      collection:STAC_COLLECTION,asset_descriptors_count:assetCount,
      intersection_checked:true,actual_asset_bytes_readback:false,
      country_impact_verified:false,commercial_rights_certified:false,
      publisher_news_publication_verified:false,
    });
  }
  scenes.sort((a,b)=>b.acquired_at.localeCompare(a.acquired_at));
  return {
    schema:"geomacro.copernicus-scene-discovery.v1",
    collection:STAC_COLLECTION,scene_count:scenes.length,
    latest_acquired_at:scenes[0]?.acquired_at??null,
    country_iso3:null,region:MINERAL_REGION_PILOT.region_label,
    scenes,real_imagery_retrieved:false,
    actual_image_pixels_verified:false,
    verified_mineral_disruption:false,
    signed_current_intelligence:false,paid_eligible:false,
  };
}
export async function fetchCopernicusScenes({
  bbox=MINERAL_REGION_PILOT.bbox,now=new Date(),days=60,fetchImpl=fetch,
}={}){
  const query=buildCopernicusSceneQuery({bbox,now,days});
  const response=await fetchImpl(query.url,{
    method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),
    headers:{"accept":"application/geo+json, application/json"},
  });
  if(!response.ok){
    await response.body?.cancel().catch(()=>undefined);
    throw Error("STAC_HTTP_"+response.status);
  }
  if(!response.body||Number(response.headers.get("content-length")??0)>MAX_BYTES)
    throw Error("STAC_BODY_LIMIT");
  const reader=response.body.getReader();let count=0;const chunks=[];
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      count+=value.byteLength;
      if(count>MAX_BYTES)throw Error("STAC_BODY_LIMIT");
      chunks.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(count);let offset=0;
  for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  let data;try{data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch{throw Error("STAC_BODY_NOT_JSON");}
  return parseCopernicusScenes(data,{bbox,now,days});
}

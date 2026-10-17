import {parseCsvRecords} from "./public-reference-extraction.mjs";

const SPECS=Object.freeze({
 faostat:Object.freeze({
   url:"https://nsi-release-ro-statsuite.fao.org/rest/data/FAO,DF_SDG_ALL_INDICATORS,1.0/A.SN_ITK_DEFC..........?startPeriod=2023&dimensionAtObservation=AllDimensions&format=csvfile",
   country:"IND",indicator:"SN_ITK_DEFC",
   provider:"FAO",category:"MACRO",
 }),
 ilostat:Object.freeze({
   url:"https://rplumber.ilo.org/data/indicator/?id=EMP_TEMP_SEX_AGE_NB_A&ref_area=USA&timefrom=2024&timeto=2024",
   country:"USA",indicator:"EMP_TEMP_SEX_AGE_NB",
   required_sex:"SEX_T",required_classif1:"AGE_AGGREGATE_YGE15",
   provider:"ILO",category:"MACRO",
 }),
});
export const COUNTRY_STATISTICS_SOURCE_IDS=Object.freeze(Object.keys(SPECS));
const MAX_BYTES=2*1024*1024;
function rowsFromPayload(payload){
 if(typeof payload==="string"){
   const text=payload.trimStart();
   if(text.startsWith("{")||text.startsWith("[")){
     let x;try{x=JSON.parse(text);}catch{throw Error("COUNTRY_STATS_JSON_INVALID");}
     return rowsFromPayload(x);
   }
   return parseCsvRecords(text);
 }
 if(Array.isArray(payload))return payload;
 if(payload&&typeof payload==="object"){
   if(Array.isArray(payload.data))return payload.data;
   if(Array.isArray(payload.results))return payload.results;
   if(Array.isArray(payload.items))return payload.items;
   if(Array.isArray(payload.Result))return payload.Result;
 }
 throw Error("COUNTRY_STATS_ROWS_SHAPE_UNVERIFIED");
}
function numeric(raw){
 if(raw===undefined||raw===null||raw==="")return null;
 const n=Number(raw);
 return Number.isFinite(n)?n:null;
}
function countryOf(row){
 return String(row.REF_AREA_ISO3??row.ref_area_iso3??row.ref_area??row.REF_AREA??"").trim().toUpperCase();
}
function periodOf(row){
 const value=String(row.TIME_PERIOD??row.time??row.Time??"");
 return /^(?:19|20)\d{2}$/.test(value)?value:null;
}
function indicatorOf(row){
 return String(row.SDG_SERIES??row.SERIES??row.INDICATOR??row.indicator??row.SERIES_CODE??"").trim().toUpperCase();
}
function valueOf(row){
 return numeric(row.OBS_VALUE??row.obs_value??row.value);
}
export function extractExactCountryStatistic(id,payload){
 const spec=SPECS[id];
 if(!spec)throw Error("COUNTRY_STATS_SOURCE_NOT_APPROVED");
 const rows=rowsFromPayload(payload);
 if(!rows.length||rows.length>20000)throw Error("COUNTRY_STATS_ROWS_LIMIT");
 const mapped=rows.map(row=>({
   iso3:countryOf(row),indicator:indicatorOf(row),
   period:periodOf(row),value:valueOf(row),
   // Preserve evidence quality/flags; a number alone is not a release date.
   unit:String(row.UNIT_MEASURE??row.unit??row.unit_measure??"").slice(0,64),
   source_flag:String(row.OBS_STATUS??row.obs_status??"").slice(0,32),
   sex:String(row.sex??row.SEX??"").trim().toUpperCase(),
   classif1:String(row.classif1??row.CLASSIF1??"").trim().toUpperCase(),
 }));
 const exact=mapped.filter(r=>r.iso3===spec.country&&r.indicator===spec.indicator&&
   r.period&&r.value!==null&&
   (!spec.required_sex||r.sex===spec.required_sex)&&
   (!spec.required_classif1||r.classif1===spec.required_classif1));
 exact.sort((a,b)=>b.period.localeCompare(a.period));
 if(!exact.length){
   // Provider schema census only: column names and dimension-match counts,
   // never provider values, filenames, source URLs or secret-bearing bodies.
   const names=Object.keys(rows[0]??{}).filter(k=>
     /^[A-Za-z][A-Za-z0-9_.]{0,47}$/.test(k)).sort().slice(0,30);
   const error=Error("COUNTRY_STATS_EXACT_SERIES_NOT_FOUND");
   error.safe_shape={column_names:names,
     total_rows:Math.min(rows.length,20000),
     country_matches:mapped.filter(x=>x.iso3===spec.country).length,
     indicator_matches:mapped.filter(x=>x.indicator===spec.indicator).length,
     year_matches:mapped.filter(x=>x.period!==null).length,
     // Only official categorical codes, never descriptions/numeric observations.
     indicator_codes:[...new Set(mapped.map(x=>x.indicator).filter(x=>
       /^[A-Z][A-Z0-9_]{0,63}$/u.test(x)))].slice(0,6),
     sex_codes:[...new Set(rows.map(x=>String(x.sex??x.SEX??"").trim()).filter(x=>
       /^[A-Z][A-Z0-9_]{0,31}$/u.test(x)))].slice(0,8),
     classif1_codes:[...new Set(rows.map(x=>String(x.classif1??x.CLASSIF1??"").trim()).filter(x=>
       /^[A-Z][A-Z0-9_]{0,63}$/u.test(x)))].slice(0,8),
     complete_selected_scope_count:mapped.filter(x=>
       x.iso3===spec.country&&x.indicator===spec.indicator&&
       (!spec.required_sex||x.sex===spec.required_sex)&&
       (!spec.required_classif1||x.classif1===spec.required_classif1)).length};
   throw error;
 }
 const top=exact[0];
 const competing=exact.filter(r=>r.period===top.period);
 if(competing.length!==1)throw Error("COUNTRY_STATS_SERIES_SCOPE_AMBIGUOUS");
 return {
   source_id:id,provider:spec.provider,country_iso3:top.iso3,
   indicator:top.indicator,reference_period:top.period,
   observed_value:top.value,observed_unit:top.unit||"provider_defined",
   source_status_flag:top.source_flag||null,
   record_count:exact.length,
   original_release_at:null,
   release_timestamp_verified:false,
   statistically_comparable_peer_group_verified:false,
   commercial_rights_verified:false,
   signed_current_intelligence:false,
   raw_customer_distribution:false,
 };
}
async function readBody(url,fetchImpl){
 const response=await fetchImpl(url,{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
   headers:{accept:"text/csv,application/vnd.sdmx.data+csv,application/json;q=0.8",
      "accept-language":"en"},
 });
 if(!response.ok){
   await response.body?.cancel().catch(()=>{});
   throw Error("COUNTRY_STATS_HTTP_"+response.status);
 }
 if(!response.body||Number(response.headers.get("content-length")??0)>MAX_BYTES)
   throw Error("COUNTRY_STATS_BODY_LIMIT");
 const reader=response.body.getReader(),chunks=[];let len=0;
 try{
   for(;;){
     const x=await reader.read();if(x.done)break;
     len+=x.value.byteLength;if(len>MAX_BYTES)throw Error("COUNTRY_STATS_BODY_LIMIT");
     chunks.push(x.value);
   }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const b=new Uint8Array(len);let k=0;
 for(const chunk of chunks){b.set(chunk,k);k+=chunk.byteLength;}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(b);}
 catch{throw Error("COUNTRY_STATS_CHARSET_INVALID");}
}
export async function readExactCountryStatistic(id,{fetchImpl=fetch}={}){
 const spec=SPECS[id];
 if(!spec)throw Error("COUNTRY_STATS_SOURCE_NOT_APPROVED");
 return extractExactCountryStatistic(id,await readBody(spec.url,fetchImpl));
}
export async function actualCountryStatisticsReceipt({read=readExactCountryStatistic,now=()=>new Date()}={}){
 const rows=[];
 for(const id of COUNTRY_STATISTICS_SOURCE_IDS){
   try{
     const x=await read(id);
     if(x?.source_id!==id||x?.commercial_rights_verified!==false||
        x?.release_timestamp_verified!==false||
        x?.country_iso3!==SPECS[id].country)throw Error("COUNTRY_STATS_CONTRACT_INVALID");
     rows.push({id,state:"EXACT_COUNTRY_SERIES_EXTRACTED",
       country_iso3:x.country_iso3,indicator:x.indicator,period:x.reference_period,
       unit:x.observed_unit,original_release_verified:false,
       commercial_rights_verified:false});
   }catch(e){
     const cause=String(e?.message??"");
     rows.push({id,state:"EXACT_SERIES_UNVERIFIED",
       reason:/^COUNTRY_STATS_[A-Z0-9_]+$/.test(cause)?cause:"UPSTREAM_OR_SHAPE_UNVERIFIED",
       ...(e?.safe_shape?{shape:e.safe_shape}:{})});
   }
 }
 return {
   schema:"geomacro.fao-ilo-country-reference.v1",at:now().toISOString(),
   attempted:2,extracted:rows.filter(x=>x.state==="EXACT_COUNTRY_SERIES_EXTRACTED").length,
   results:rows,
   all_195_countries_certified:false,paid_eligible:false,
   signed_current_intelligence:false,raw_values_in_receipt:false,
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0,
 };
}

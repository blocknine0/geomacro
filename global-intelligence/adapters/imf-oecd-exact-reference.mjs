import {fetchImfDataMapper} from "./imf-sdmx.mjs";
import {parseCsvRecords} from "./public-reference-extraction.mjs";

// Pinned official OECD Data Explorer monthly unemployment dataset, bounded
// to one historical month; exact United States row will be selected only if
// independently unambiguous. Dataset reference != native release timestamp.
const OECD_ENDPOINT="https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_LFS@DF_IALFS_INDIC,1.0/USA.UNE_LF_M...Y._T.Y_GE15..M?startPeriod=2025-06&endPeriod=2025-06&dimensionAtObservation=AllDimensions&format=csvfile";
const MAX_BYTES=1024*1024;
function num(x){if(x==null||String(x).trim()==="")return null;const v=Number(x);return Number.isFinite(v)?v:null;}
export function extractOecdUsMonthlyUnemployment(text){
 const rows=parseCsvRecords(text);
 if(rows.length>10000)throw Error("OECD_CSV_ROW_LIMIT");
 const columns=Object.keys(rows[0]??{});
 const required=["REF_AREA","TIME_PERIOD","OBS_VALUE"];
 if(required.some(x=>!columns.includes(x)))throw Error("OECD_SOURCE_COLUMNS_INVALID");
 const available=rows.filter(r=>r.REF_AREA==="USA" &&
   r.TIME_PERIOD==="2025-06" && num(r.OBS_VALUE)!==null &&
   (!r.FREQ||r.FREQ==="M") &&
   (!r.COMBINED_MEASURE||r.COMBINED_MEASURE==="UNE_LF_M") &&
   (!r.ADJUSTMENT||r.ADJUSTMENT==="Y") &&
   (!r.SEX||r.SEX==="_T") &&
   (!r.AGE||r.AGE==="Y_GE15"));
 if(available.length!==1){
   const error=Error("OECD_EXACT_SERIES_UNVERIFIED");
   error.sanitized={returned_rows:rows.length,usa_rows:rows.filter(x=>x.REF_AREA==="USA").length,
     valid_scope_rows:available.length,column_names:columns.slice(0,35).filter(x=>/^[A-Z][A-Z0-9_]{0,63}$/u.test(x))};
   throw error;
 }
 const r=available[0];
 return {
   source_id:"oecd_sdmx",category:"MACRO",country_iso3:"USA",
   reference_period:r.TIME_PERIOD,observation_value:num(r.OBS_VALUE),
   unit:r.UNIT_MEASURE??null,series_key:typeof r.KEY==="string"?r.KEY:null,
   original_published_at:null,native_release_at_verified:false,
   historical_dataset_reference:true,original_current_news_proven:false,
   commercial_rights_verified:false,paid_eligible:false,
 };
}
async function boundedBody(url,fetchImpl){
 const res=await fetchImpl(url,{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(15000),
   // CSV response is already requested by the official format=csvfile query.
   headers:{accept:"text/csv"}
 });
 if(!res.ok){await res.body?.cancel().catch(()=>{});throw Error("OECD_HTTP_"+res.status);}
 if(!res.body||Number(res.headers.get("content-length")??0)>MAX_BYTES)
   throw Error("OECD_BODY_LIMIT");
 const reader=res.body.getReader(),parts=[];let n=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
   n+=value.byteLength;if(n>MAX_BYTES)throw Error("OECD_BODY_LIMIT");parts.push(value);}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(n);let k=0;for(const p of parts){bytes.set(p,k);k+=p.byteLength;}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
 catch{throw Error("OECD_CHARSET_UNVERIFIED");}
}
export async function fetchOecdExactReference({fetchImpl=fetch}={}){
 const body=await boundedBody(OECD_ENDPOINT,fetchImpl);
 return extractOecdUsMonthlyUnemployment(body);
}
export async function verifyImfOecdReference({imf=fetchImfDataMapper,oecd=fetchOecdExactReference,alternates=null}={}){
 const receipt={schema:"geomacro.imf-oecd-native-statistics.v1",
   checked_at:new Date().toISOString(),readers:[],supabase_requests:0,
   b2_requests:0,d1_writes:0,payments:0,paid_eligible:false,
   signed_current_publications:0};
 try{
   const result=await imf({indicator:"NGDP_RPCH",countryIso3:"IND",periods:["2024","2025"]});
   if(!Array.isArray(result)||!result.length||
      !result.every(r=>r.source_id==="imf_sdmx"&&r.category==="MACRO"&&
        r.country_iso3==="IND"&&r.published_at===null&&
        r.raw?.native_release_at===null&&
        r.raw?.commercial_rights_verified===false&&
        ["2024","2025"].includes(r.raw.reference_period)))
     throw Error("IMF_SERIES_CONTRACT_UNVERIFIED");
   receipt.readers.push({id:"imf",state:"EXACT_STATISTICAL_REFERENCE_VERIFIED",
     country_iso3:"IND",periods:result.map(r=>r.raw.reference_period).sort(),
     native_release_time_verified:false,commercial_rights_verified:false});
 }catch(error){
   const e=String(error?.message??"");
   const http=e.match(/^HTTP ([1-5][0-9]{2}) for bounded credentialed request$/u)?.[1];
   receipt.readers.push({id:"imf",state:"EXACT_SERIES_UNVERIFIED",
     reason:http?"IMF_HTTP_"+http:/^IMF_[A-Z0-9_]+$/.test(e)?e:"SOURCE_DENIAL_OR_SCHEMA_UNKNOWN"});
 }
 try{
   const r=await oecd();
   if(r?.source_id!=="oecd_sdmx"||r.country_iso3!=="USA"||
      r.reference_period!=="2025-06"||r.native_release_at_verified!==false||
      r.commercial_rights_verified!==false)throw Error("OECD_CONTRACT_UNVERIFIED");
   receipt.readers.push({id:"oecd",state:"EXACT_STATISTICAL_REFERENCE_VERIFIED",
     country_iso3:r.country_iso3,period:r.reference_period,
     native_release_time_verified:false,commercial_rights_verified:false});
 }catch(error){
   const e=String(error?.message??"");
   receipt.readers.push({id:"oecd",state:"EXACT_SERIES_UNVERIFIED",
     reason:/^OECD_[A-Z0-9_]+$/.test(e)?e:"SOURCE_DENIAL_OR_SCHEMA_UNKNOWN",
     ...(error?.sanitized?{shape:error.sanitized}:{})});
 }
 receipt.attempted=2;
 receipt.verified=receipt.readers.filter(r=>r.state==="EXACT_STATISTICAL_REFERENCE_VERIFIED").length;
 // No automatic fallback for injected primary readers in offline tests.
 // Production explicitly opts in to two independent credential-free issuers.
 receipt.official_alternates=[];
 if(alternates!==null){
   const lanes=[
     {primary:"imf",source:"world_bank_wdi",read:alternates.wdi,
      validate:r=>r?.source_id==="world_bank_wdi"&&
       r.country_iso3==="IND"&&r.indicator==="NY.GDP.MKTP.KD.ZG"&&
       r.frequency==="annual"&&r.source_methodology_equivalent_to_imf===false&&
       Array.isArray(r.reference_periods)&&r.reference_periods.length>=1&&
       r.reference_periods.every(x=>/^20\d{2}$/u.test(x))},
     {primary:"oecd",source:"us_bls_cps",read:alternates.bls,
      validate:r=>r?.source_id==="us_bls_cps"&&
       r.country_iso3==="USA"&&r.indicator==="LNS14000000"&&
       /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(r.reference_period)&&r.frequency==="monthly"&&
       r.harmonization_equivalent_to_oecd===false},
   ];
   for(const lane of lanes){
     if(receipt.readers.find(x=>x.id===lane.primary)?.state===
         "EXACT_STATISTICAL_REFERENCE_VERIFIED")continue;
     try{
       if(typeof lane.read!=="function")throw Error("ALT_READER_UNCONFIGURED");
       const data=await lane.read();
       if(!lane.validate(data)||data.native_release_time_verified!==false||
          data.commercial_rights_attested!==false||data.paid_eligible!==false||
          data.original_published_at!==null)
          throw Error("ALT_CONTRACT_INVALID");
       receipt.official_alternates.push({replaces_unavailable_source:lane.primary,
         alternate_source:lane.source,state:"INDEPENDENT_REFERENCE_AVAILABLE",
         reference_period:lane.primary==="imf"?
           data.reference_periods.join(","):data.reference_period,
         comparable_topic_not_identical_methodology:true,
         original_native_release_verified:false,commercial_rights_attested:false,
         paid_eligible:false});
     }catch(error){
       const reason=String(error?.message??"");
       receipt.official_alternates.push({
        replaces_unavailable_source:lane.primary,alternate_source:lane.source,
        state:"ALTERNATE_UNAVAILABLE",reason:/^ALT_[A-Z0-9_]+$/u.test(reason)?
          reason:"ALT_TRANSPORT_OR_SCHEMA_UNKNOWN",paid_eligible:false});
     }
   }
 }
 receipt.alternates_verified=receipt.official_alternates.filter(
  x=>x.state==="INDEPENDENT_REFERENCE_AVAILABLE").length;
 receipt.reference_portfolio_available=receipt.verified+receipt.alternates_verified===2;
 receipt.primary_imf_oecd_exact_sources_both_verified=receipt.verified===2;
 return receipt;
}

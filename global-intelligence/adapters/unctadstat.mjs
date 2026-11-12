import { createHash } from "node:crypto";

export const UNCTADSTAT_URL = "https://unctadstat.unctad.org/datacentre/reportInfo/US.UCPI_M";
export const UNCTADSTAT_METADATA_URL = "https://unctadstat-api.unctad.org/api/reportMetadata/US.UCPI_M/en";

/** Parse publisher date keys from UNCTAD's reportMetadata machine endpoint.
 * Reference-period keys such as year/month/quarter are deliberately ignored.
 */
export function parseUnctadPublisherReleaseMetadata(payload){
 if(!payload||typeof payload!=="object"||Array.isArray(payload))
  throw Error("UNCTAD_RELEASE_METADATA_SHAPE_INVALID");
 const allowed=new Set([
  "publisher_release_date","release_date","releaseDate","release_date_utc","releaseDateUtc",
  "publication_date","publicationDate","date_published","datePublished","published_at","publishedAt",
  "last_updated","lastUpdated","last_update","lastUpdate","last_update_date","lastUpdateDate",
  "updated_at","updatedAt","updated_on","updatedOn","last_modified","lastModified"
 ]);
 const values=[];
 const walk=(value,depth=0)=>{
  if(depth>8||!value||typeof value!=="object")return;
  if(Array.isArray(value)){for(const child of value.slice(0,100))walk(child,depth+1);return}
  for(const [key,child] of Object.entries(value)){
   if(allowed.has(key)&&typeof child==="string")values.push(child.trim());
   else if(child&&typeof child==="object")walk(child,depth+1);
  }
 };
 walk(payload);
 for(const raw of values){
  if(raw.length>80)continue;
  let date;
  if(/^20\d{2}-\d{2}-\d{2}$/u.test(raw)){
   date=new Date(raw+"T00:00:00.000Z");
   if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==raw)continue;
  }else{
   if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/iu.test(raw))continue;
   date=new Date(raw);if(!Number.isFinite(date.getTime()))continue;
  }
  return Object.freeze({published_at:date.toISOString(),publisher_release_date:raw,
   clock_source:"UNCTAD_REPORT_METADATA_API",native_publication_time_verified:true});
 }
 throw Error("UNCTAD_NATIVE_RELEASE_CLOCK_MISSING");
}

export function normalizeUnctadStatObservation({ dataset, series, period, value, unit = null, countryIso3 = null, retrievedAt = new Date().toISOString(), publisherMetadata = null, raw = null }) {
  if (!dataset || !series || !period || !/^20\d{2}(?:-(?:0[1-9]|1[0-2]|Q[1-4]))?$/.test(String(period)) || value == null || !Number.isFinite(Number(value))) {
    throw new Error("Invalid UNCTADstat observation");
  }
  const key = [dataset, series, countryIso3 ?? "GLOBAL", period].join(":");
  const rawPayload = raw ?? { dataset, series, period, value, unit, countryIso3 };
  let clock=null;
  if(publisherMetadata!==null)clock=parseUnctadPublisherReleaseMetadata(publisherMetadata);
  return {
    source_id:"unctadstat_global",
    source_record_id:"UNCTAD:" + key.replace(/\s+/g, "_"),
    category:"MACRO",
    country_iso3:countryIso3,
    observed_at:retrievedAt,
    // Dataset period (year/month/quarter) is NOT the native publication date.
    published_at:clock?.published_at??null,
    observation_period:String(period),
    clock_semantics:String(period).includes("-Q")?"reference_quarter":
      String(period).includes("-")?"reference_month":"reference_year",
    native_publication_time_verified:clock?.native_publication_time_verified??false,
    title:"UNCTADstat " + series,
    summary:"UNCTADstat observation for " + series + " (" + period + ").",
    source_url:UNCTADSTAT_URL,
    metric:series,
    value_numeric:Number(value),
    value_text:null,
    unit:unit ?? "UNCTADstat unit",
    event_type:"MACRO_STATISTIC",
    signal_type:"EXTERNAL_MACRO_STATISTIC",
    provenance:{provider:"UN Trade and Development",dataset,series,period},
    raw_payload:rawPayload,
    raw_hash:createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}

import { createHash } from "node:crypto";

export const UNCTADSTAT_URL = "https://unctadstat.unctad.org/datacentre/";

/** Publisher clock extractor for machine payloads; periods never count as release clocks. */
export function parseUnctadPublisherReleaseMetadata(payload){
 const root=payload?.metadata??payload?.meta??payload;
 if(!root||typeof root!=="object"||Array.isArray(root))throw Error("UNCTAD_RELEASE_METADATA_SHAPE_INVALID");
 const raw=root.publisher_release_date??root.release_date??root.last_updated??root.lastUpdated??root.updated_at??null;
 if(typeof raw!=="string"||raw.length>80||!/(?:Z|[+-]\d{2}:?\d{2})$/iu.test(raw))
  throw Error("UNCTAD_NATIVE_RELEASE_CLOCK_MISSING");
 const date=new Date(raw);if(!Number.isFinite(date.getTime()))throw Error("UNCTAD_NATIVE_RELEASE_CLOCK_INVALID");
 return Object.freeze({published_at:date.toISOString(),clock_source:"PUBLISHER_MACHINE_METADATA",native_publication_time_verified:true});
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

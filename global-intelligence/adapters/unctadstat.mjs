import { createHash } from "node:crypto";

export const UNCTADSTAT_URL = "https://unctadstat.unctad.org/datacentre/";

export function normalizeUnctadStatObservation({ dataset, series, period, value, unit = null, countryIso3 = null, retrievedAt = new Date().toISOString(), raw = null }) {
  if (!dataset || !series || !period || !/^(?:\\d{4}(?:-\\d{2})?|\\d{4}-Q[1-4])$/.test(String(period)) || value == null || !Number.isFinite(Number(value))) {
    throw new Error("Invalid UNCTADstat observation");
  }
  const key = [dataset, series, countryIso3 ?? "GLOBAL", period].join(":");
  const rawPayload = raw ?? { dataset, series, period, value, unit, countryIso3 };
  return {
    source_id:"unctadstat_global",
    source_record_id:"UNCTAD:" + key.replace(/\s+/g, "_"),
    category:"MACRO",
    country_iso3:countryIso3,
    observed_at:retrievedAt,
    published_at:period.length === 7 ? period + "-01T00:00:00.000Z" : retrievedAt,
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

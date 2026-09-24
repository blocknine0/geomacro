import { createHash } from "node:crypto";

export const COCHILCO_URL = "https://www.cochilco.cl/web/anuario-de-estadisticas-del-cobre-y-otros-minerales/";

export function normalizeCochilcoObservation({ series, period, value, unit = null, commodity = "Copper", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!series || !period || value == null || !Number.isFinite(Number(value))) throw new Error("Invalid COCHILCO observation");
  const rawPayload = raw ?? { series, period, value, unit, commodity };
  return {
    source_id:"cochilco_minerals",
    source_record_id:"COCHILCO:" + [series,period,commodity].join(":").replace(/\s+/g, "_"),
    category:"CRITICAL_MINERALS",
    country_iso3:"CHL",
    observed_at:retrievedAt,
    published_at:period.length === 7 ? period + "-01T00:00:00.000Z" : retrievedAt,
    title:"COCHILCO " + series + ": " + commodity,
    summary:"Chilean mining and mineral market statistical observation.",
    source_url:COCHILCO_URL,
    metric:series,
    value_numeric:Number(value),
    value_text:null,
    unit:unit ?? "COCHILCO unit",
    commodity,
    event_type:"MINERAL_STATISTIC",
    signal_type:"CRITICAL_MINERALS_MARKET_DATA",
    provenance:{provider:"Comisión Chilena del Cobre (COCHILCO)",dataset:"Copper and Other Minerals Statistics",series,period},
    raw_payload:rawPayload,
    raw_hash:createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}

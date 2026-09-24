import { createHash } from "node:crypto";

export const COCHILCO_URL = "https://www.cochilco.cl/web/anuario-de-estadisticas-del-cobre-y-otros-minerales/";

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCochilcoAnuarioHtml(html, { retrievedAt = new Date().toISOString(), baseUrl = COCHILCO_URL } = {}) {
  const input = String(html ?? "");
  if (!/Anuario de Estadísticas del Cobre y Otros Minerales/i.test(input)) {
    throw new Error("COCHILCO Anuario marker not found");
  }

  const links = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of input.matchAll(anchorRe)) {
    const label = decodeHtml(match[2]);
    if (!/Base de Datos|Anuario/i.test(label)) continue;
    let url = null;
    try { url = new URL(match[1], baseUrl).toString(); } catch {}
    if (!url) continue;
    links.push({ label, url });
  }

  const uniqueLinks = [...new Map(links.map((item) => [item.url, item])).values()];
  if (!uniqueLinks.length) throw new Error("COCHILCO parser found no Anuario/database download links");

  return {
    source_id: "cochilco_minerals",
    category: "CRITICAL_MINERALS",
    country_iso3: "CHL",
    observed_at: retrievedAt,
    source_url: COCHILCO_URL,
    metric: "official_minerals_dataset_surface",
    value_numeric: uniqueLinks.length,
    value_text: uniqueLinks.map((item) => item.label).join(" | "),
    unit: "official dataset links",
    event_type: "MINERAL_DATASET_UPDATE",
    signal_type: "CRITICAL_MINERALS_MARKET_DATA",
    provenance: {
      provider: "Comisión Chilena del Cobre (COCHILCO)",
      dataset: "Anuario de Estadísticas del Cobre y Otros Minerales",
      links: uniqueLinks
    },
    raw_payload: { links: uniqueLinks },
    raw_hash: createHash("sha256").update(JSON.stringify(uniqueLinks)).digest("hex")
  };
}

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

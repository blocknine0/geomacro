import { createHash } from "node:crypto";

export const AU_CRITICAL_MINERALS_URL = "https://www.industry.gov.au/publications/australias-critical-minerals-list-and-strategic-materials-list";

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

function splitCells(row) {
  return [...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((m) => decodeHtml(m[1]));
}

export function parseAustraliaCriticalMineralsHtml(html, { retrievedAt = new Date().toISOString() } = {}) {
  const input = String(html ?? "");
  if (!/Critical Minerals List/i.test(input) || !/Strategic Materials List/i.test(input)) {
    throw new Error("Australian critical minerals list markers not found");
  }

  const records = [];
  const tableRe = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  for (const tableMatch of input.matchAll(tableRe)) {
    const rows = [...tableMatch[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)];
    for (const row of rows) {
      const cells = splitCells(row[0]);
      if (!cells.length) continue;
      const mineral = cells[0];
      if (!mineral || /^(mineral|commodity|material|name)$/i.test(mineral)) continue;
      if (mineral.length > 80 || !/[A-Za-z]/.test(mineral)) continue;
      records.push(normalizeAustraliaCriticalMineral({
        mineral,
        list: /Strategic/i.test(cells.join(" ")) ? "Strategic Materials List" : "Critical Minerals List",
        geologicalPotential: cells.find((cell) => /high|medium|low/i.test(cell)) ?? null,
        production: cells.find((cell) => /\b(?:kt|tonnes?|t|mt)\b/i.test(cell)) ?? null,
        retrievedAt,
        raw: { cells }
      }));
    }
  }

  const strategicSection = input.match(/Strategic Materials List[\\s\\S]*?(?:More information|Contact us|$)/i)?.[0] ?? "";
  const strategicList = strategicSection.match(/<ul\\b[^>]*>[\\s\\S]*?<\\/ul>/i)?.[0] ?? "";
  for (const item of strategicList.matchAll(/<li\\b[^>]*>([\\s\\S]*?)<\\/li>/gi)) {
    const mineral = decodeHtml(item[1]);
    if (!mineral || mineral.length > 80 || !/[A-Za-z]/.test(mineral)) continue;
    records.push(normalizeAustraliaCriticalMineral({
      mineral,
      list: "Strategic Materials List",
      retrievedAt,
      raw: { mineral, list: "Strategic Materials List" }
    }));
  }

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  if (!unique.length) throw new Error("Australian critical minerals parser found no table records");
  return unique;
}

export function normalizeAustraliaCriticalMineral({ mineral, list = "Critical Minerals List", geologicalPotential = null, production = null, retrievedAt = new Date().toISOString(), raw = null }) {
  if (!mineral) throw new Error("Australian critical mineral record requires mineral");
  const rawPayload = raw ?? { mineral, list, geologicalPotential, production };
  return {
    source_id:"australia_critical_minerals",
    source_record_id:"AUCM:" + String(mineral).trim().replace(/\s+/g, "_"),
    category:"CRITICAL_MINERALS",
    country_iso3:"AUS",
    observed_at:retrievedAt,
    title:"Australia critical mineral: " + mineral,
    summary:"Australian Government critical minerals or strategic materials list entry.",
    source_url:AU_CRITICAL_MINERALS_URL,
    metric:"critical_mineral_listing",
    value_numeric:1,
    value_text:list,
    unit:"listed mineral",
    commodity:String(mineral),
    event_type:"CRITICAL_MINERAL_POLICY",
    signal_type:"CRITICAL_MINERALS_SUPPLY_CHAIN",
    provenance:{provider:"Australian Government Department of Industry, Science and Resources",dataset:list,mineral:String(mineral),geological_potential:geologicalPotential,production},
    raw_payload:rawPayload,
    raw_hash:createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}

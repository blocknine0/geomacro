import { createHash } from "node:crypto";

export const AU_CRITICAL_MINERALS_URL = "https://www.industry.gov.au/mining-oil-and-gas/minerals/critical-minerals";

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

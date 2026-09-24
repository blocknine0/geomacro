import { createHash } from "node:crypto";

export const EU_SANCTIONS_URL = "https://webgate.ec.europa.eu/fsd/fsf";

export function normalizeEuSanctionsRecord({ id, name, regime = null, designationDate = null, retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id && !name) throw new Error("EU sanctions record requires id or name");
  const key = String(id ?? name).trim().replace(/\s+/g, "_");
  const rawPayload = raw ?? { id, name, regime, designationDate };
  return {
    source_id:"eu_sanctions_consolidated",
    source_record_id:"EUFS:" + key,
    category:"GEOPOLITICS",
    observed_at:retrievedAt,
    published_at:designationDate ? new Date(designationDate).toISOString() : retrievedAt,
    title:"EU financial sanctions designation: " + String(name ?? key).trim(),
    summary:regime ? "EU financial sanctions designation under " + String(regime).trim() + "." : "EU financial sanctions designation.",
    source_url:EU_SANCTIONS_URL,
    metric:"sanctions_designation",
    value_numeric:1,
    value_text:"DESIGNATED",
    unit:"designation",
    event_type:"SANCTIONS_DESIGNATION",
    signal_type:"EXTERNAL_SANCTIONS",
    provenance:{provider:"European Commission DG FISMA",dataset:"Consolidated List of Financial Sanctions",id:String(id ?? ""),regime:String(regime ?? "")},
    raw_payload:rawPayload,
    raw_hash:createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}

import { createHash } from "node:crypto";

export const UK_SANCTIONS_URL = "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml";

function first(...values) {
  return values.find((v) => v != null && String(v).trim()) ?? null;
}

export function parseUkSanctionsXml(xml, { observedAt = new Date().toISOString() } = {}) {
  const records = [];
  const blockRe = /<(?:Designation|Individual|Entity|Ship)\b[\s\S]*?<\/(?:Designation|Individual|Entity|Ship)>/gi;
  for (const match of String(xml).matchAll(blockRe)) {
    const block = match[0];
    const id = first(block.match(/<UniqueID[^>]*>([\s\S]*?)<\/UniqueID>/i)?.[1], block.match(/<Unique Id[^>]*>([\s\S]*?)<\/Unique Id>/i)?.[1]);
    const name = first(block.match(/<PrimaryName[^>]*>([\s\S]*?)<\/PrimaryName>/i)?.[1], block.match(/<Name[^>]*>([\s\S]*?)<\/Name>/i)?.[1]);
    const updated = first(block.match(/<LastUpdated[^>]*>([\s\S]*?)<\/LastUpdated>/i)?.[1], block.match(/<Last Updated[^>]*>([\s\S]*?)<\/Last Updated>/i)?.[1]);
    const regime = first(block.match(/<RegimeName[^>]*>([\s\S]*?)<\/RegimeName>/i)?.[1], block.match(/<Regime[^>]*>([\s\S]*?)<\/Regime>/i)?.[1]);
    if (!id && !name) continue;
    const key = String(id ?? name).replace(/\s+/g, "_");
    records.push({
      source_id:"uk_sanctions_list",
      source_record_id:"UKSL:" + key,
      category:"GEOPOLITICS",
      observed_at:observedAt,
      published_at:updated ? new Date(updated).toISOString() : observedAt,
      title:"UK Sanctions designation: " + String(name ?? key).trim(),
      summary:regime ? "UK sanctions designation under " + String(regime).trim() + "." : "UK sanctions designation.",
      source_url:UK_SANCTIONS_URL,
      metric:"sanctions_designation",
      value_numeric:1,
      value_text:"DESIGNATED",
      unit:"designation",
      event_type:"SANCTIONS_DESIGNATION",
      signal_type:"EXTERNAL_SANCTIONS",
      provenance:{provider:"UK Foreign, Commonwealth & Development Office",dataset:"UK Sanctions List",unique_id:String(id ?? ""),regime:String(regime ?? "")},
      raw_payload:block,
      raw_hash:createHash("sha256").update(block).digest("hex")
    });
  }
  if (!records.length) throw new Error("UK Sanctions XML parser found no designation records");
  return records;
}

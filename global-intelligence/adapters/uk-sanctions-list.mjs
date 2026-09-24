import { createHash } from "node:crypto";

export const UK_SANCTIONS_URL = "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml";

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}

function first(...values) {
  return values.find((v) => v != null && String(v).trim()) ?? null;
}

function field(block, names) {
  for (const name of names) {
    const re = new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + ">", "i");
    const match = block.match(re);
    if (match?.[1]) return decodeXml(match[1]);
  }
  return null;
}

export function parseUkSanctionsXml(xml, { observedAt = new Date().toISOString() } = {}) {
  const records = [];
  const input = String(xml).replace(/<\?xml[^>]*>/i, "");
  const blockRe = /<(?:Designation|Individual|Entity|Ship)\b[^>]*>[\s\S]*?<\/(?:Designation|Individual|Entity|Ship)>/gi;

  for (const match of input.matchAll(blockRe)) {
    const block = match[0];
    const id = first(field(block, ["UniqueID", "Unique Id"]));
    const name = first(field(block, ["PrimaryName", "Name1", "Name"]));
    const updated = first(field(block, ["LastUpdated", "Last Updated"]));
    const regime = first(field(block, ["RegimeName", "Regime"]));

    if (!id && !name) continue;

    const key = String(id ?? name).replace(/\s+/g, "_");
    const publishedAt = updated && !Number.isNaN(Date.parse(updated))
      ? new Date(updated).toISOString()
      : null;

    records.push({
      source_id: "uk_sanctions_list",
      source_record_id: "UKSL:" + key,
      category: "GEOPOLITICS",
      observed_at: observedAt,
      published_at: publishedAt,
      title: "UK Sanctions designation: " + String(name ?? key).trim(),
      summary: regime
        ? "UK sanctions designation under " + String(regime).trim() + "."
        : "UK sanctions designation.",
      source_url: UK_SANCTIONS_URL,
      metric: "sanctions_designation",
      value_numeric: 1,
      value_text: "DESIGNATED",
      unit: "designation",
      event_type: "SANCTIONS_DESIGNATION",
      signal_type: "EXTERNAL_SANCTIONS",
      provenance: {
        provider: "UK Foreign, Commonwealth & Development Office",
        dataset: "UK Sanctions List",
        unique_id: String(id ?? ""),
        regime: String(regime ?? "")
      },
      raw_payload: block,
      raw_hash: createHash("sha256").update(block).digest("hex")
    });
  }

  if (!records.length) throw new Error("UK Sanctions XML parser found no designation records");
  return records;
}
